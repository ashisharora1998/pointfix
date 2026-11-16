#!/usr/bin/env node
// Native messaging host. Chrome starts this process when the extension
// connects; it runs the user's own `claude` or `codex` CLI in the chosen
// project folder and streams progress back. Never write anything else to
// stdout: it carries the length-prefixed message protocol.
'use strict';

const { spawn, execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = '0.2.4';
const HOME = os.homedir();
const IS_WIN = process.platform === 'win32';
const CONFIG_PATH = path.join(HOME, '.pointfix', 'config.json');
const SNAPSHOT_ROOT = path.join(HOME, '.pointfix', 'snapshots');
const IMAGE_DIR = path.join(os.tmpdir(), 'pointfix');
const MAX_TEXT = 200_000; // stay well under Chrome's 1 MB host-to-extension message limit
const MAX_DIFF = 60_000;
const MAX_IMAGES = 5;
const SESSION_ID = /^[0-9a-f-]{36}$/i;
const TREE_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
// Never snapshot these in folders that are not git repositories.
const DEFAULT_EXCLUDES = ['node_modules/', '.git/', 'dist/', 'build/', 'out/', '.next/', '.nuxt/', '.svelte-kit/', '.cache/', 'coverage/', '.venv/', 'venv/', '__pycache__/', '.DS_Store'];

let child = null;
let filesEdited = false; // whether the current run used a file-editing tool
let stopped = false; // whether the user stopped the current run

// On Windows the agent may run under cmd.exe (see command), and killing that
// would leave the agent itself running, so end the whole process tree.
function stopChild() {
  if (!child) return;
  stopped = true;
  if (IS_WIN && child.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // Already gone, or taskkill unavailable: fall back to kill.
    }
  }
  child.kill('SIGTERM');
}

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function clip(text, max = MAX_TEXT) {
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Chrome launches hosts with a minimal PATH, so look in the usual install
// locations as well as the path recorded by the installer.
// On Windows, npm installs CLIs as .cmd shims next to an extensionless shell
// script that Windows can't run, so only .exe and .cmd count.
const WIN_EXTS = ['.exe', '.cmd'];

function resolveBinary(name) {
  const configured = readConfig()[`${name}Path`];
  if (configured) {
    const tries = IS_WIN && !/\.(exe|cmd)$/i.test(configured) ? WIN_EXTS.map((e) => configured + e) : [configured];
    const found = tries.find((p) => fs.existsSync(p));
    if (found) return found;
  }
  const exes = IS_WIN ? WIN_EXTS.map((e) => name + e) : [name];
  const dirs = [
    ...(process.env.PATH || '').split(path.delimiter),
    IS_WIN && process.env.APPDATA && path.join(process.env.APPDATA, 'npm'),
    path.join(HOME, '.local', 'bin'),
    path.join(HOME, '.claude', 'local'),
    path.join(HOME, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/usr/sbin',
    path.dirname(process.execPath),
    // The ChatGPT desktop app for macOS ships its own Codex CLI; its location
    // inside the app has changed between versions.
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin',
    '/Applications/ChatGPT.app/Contents/Resources',
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const exe of exes) {
      const candidate = path.join(dir, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Node refuses to spawn .cmd/.bat files directly, so run them through cmd.exe
// with every argument quoted and its metacharacters escaped (the same scheme
// as the cross-spawn package). Returns [file, args, extra spawn options].
function command(binary, args) {
  if (!IS_WIN || !/\.(cmd|bat)$/i.test(binary)) return [binary, args, {}];
  const meta = (s) => s.replace(/[()%!^"<>&|;, ]/g, '^$&');
  const quote = (arg) => meta(`"${String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`);
  const line = [meta(binary), ...args.map(quote)].join(' ');
  return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { windowsVerbatimArguments: true }];
}

// Claude reads its login from the macOS keychain (by user name, through
// /usr/bin/security), so make sure USER and the system folders are present
// even when Chrome starts us with a bare environment.
const SYSTEM_PATH = process.platform === 'win32' ? [] : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

function childEnv(binary, extra = {}) {
  const { username } = os.userInfo();
  return {
    ...process.env,
    USER: process.env.USER || username,
    LOGNAME: process.env.LOGNAME || username,
    PATH: [binary && path.dirname(binary), path.dirname(process.execPath), process.env.PATH, ...SYSTEM_PATH].filter(Boolean).join(path.delimiter),
    ...extra,
  };
}

function exec(file, args, options = {}, { withStderr = false } = {}) {
  return new Promise((resolve, reject) => {
    const [cmd, cmdArgs, extra] = command(file, args);
    execFile(cmd, cmdArgs, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, ...extra, ...options }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '');
        reject(err);
      } else {
        resolve(withStderr ? `${stdout}${stderr}` : stdout);
      }
    });
  });
}

// ---- setup status (used by the extension's setup page) ---------------------

async function status() {
  const agents = {};
  for (const name of ['claude', 'codex']) {
    const bin = resolveBinary(name);
    if (!bin) {
      agents[name] = { installed: false };
      continue;
    }
    let signedIn = false;
    try {
      // Codex prints its login status on stderr.
      const out = await exec(bin, name === 'claude' ? ['auth', 'status'] : ['login', 'status'], {
        env: childEnv(bin),
        timeout: 20_000,
      }, { withStderr: name === 'codex' });
      signedIn = name === 'claude' ? JSON.parse(out).loggedIn === true : /logged in/i.test(out);
    } catch {
      // Not signed in, or the status command failed.
    }
    agents[name] = { installed: true, signedIn };
  }
  send({ type: 'status', version: VERSION, agents, git: Boolean(resolveBinary('git')) });
}

// ---- finding the project folder ------------------------------------------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
// Flags static servers use for the folder they serve (python -m http.server
// --directory, http-server/serve style --root/-d).
const DIR_FLAGS = new Set(['--directory', '-d', '--root', '--dir', '--base-dir']);

// For a page on localhost, find the process listening on its port and use
// the folder it serves: its working directory, a folder flag on its command
// line, or the enclosing git repository.
async function detectProject(msg) {
  const reply = (fields) => send({ type: 'project', ...fields });
  let url;
  try {
    url = new URL(msg.url);
  } catch {
    return reply({ projectDir: null, reason: 'Not a valid page address.' });
  }
  if (!LOCAL_HOSTS.has(url.hostname) && !url.hostname.endsWith('.localhost')) {
    return reply({ projectDir: null, reason: 'Only pages on localhost can be detected.' });
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const lsof = process.platform === 'win32' ? null : resolveBinary('lsof');
  if (!lsof) return reply({ projectDir: null, reason: 'Detection is not supported on this system yet.' });

  const pids = (await exec(lsof, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).catch(() => '')).split('\n').filter(Boolean);
  for (const pid of pids) {
    const cwdLine = (await exec(lsof, ['-a', '-p', pid, '-d', 'cwd', '-Fn']).catch(() => '')).split('\n').find((l) => l.startsWith('n'));
    if (!cwdLine) continue;
    let dir = cwdLine.slice(1);
    const args = (await exec('/bin/ps', ['-o', 'args=', '-p', pid]).catch(() => '')).trim().split(/\s+/);
    const flag = args.findIndex((a) => DIR_FLAGS.has(a));
    if (flag >= 0 && args[flag + 1]) dir = path.resolve(dir, args[flag + 1]);
    if (!fs.existsSync(dir) || dir === '/' || dir === HOME) continue;
    const git = resolveBinary('git');
    const top = git ? (await exec(git, ['-C', dir, 'rev-parse', '--show-toplevel']).catch(() => '')).trim() : '';
    return reply({ projectDir: top || dir, port });
  }
  reply({ projectDir: null, reason: `Couldn't find the program serving port ${port}.` });
}

// Native "choose folder" dialog. Browsers never reveal real folder paths, so
// the helper shows the operating system's own dialog.
async function chooseFolder() {
  const reply = (fields) => send({ type: 'folderChosen', ...fields });
  // Plain ASCII apostrophe: PowerShell treats curly quotes as string delimiters.
  const prompt = "Choose the project folder that contains this site's code";
  let out;
  try {
    if (process.platform === 'darwin') {
      out = await exec('/usr/bin/osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`], { timeout: 600_000 });
    } else if (process.platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${prompt.replace(/'/g, "''")}'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`;
      out = await exec('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { timeout: 600_000 });
    } else {
      out = await exec('zenity', ['--file-selection', '--directory', `--title=${prompt}`], { timeout: 600_000 });
    }
  } catch {
    return reply({ projectDir: null }); // cancelled, or no dialog available
  }
  const dir = out.trim().replace(/(.)\/$/, '$1');
  reply({ projectDir: dir || null });
}

// ---- change tracking and undo ----------------------------------------------
// Before an edit run we record the whole project as a git tree, without
// touching the user's index, branches or working tree: git repositories get a
// throwaway index file; other folders get a private repository under
// ~/.pointfix/snapshots. Diffing the before/after trees shows exactly
// what the agent changed, and undo writes the "before" versions back.

async function gitContext(projectDir) {
  const git = resolveBinary('git');
  if (!git) return null;
  try {
    // path.resolve turns git's forward slashes into backslashes on Windows, so
    // paths built from it compare correctly in insideWorkTree.
    const top = path.resolve((await exec(git, ['-C', projectDir, 'rev-parse', '--show-toplevel'])).trim());
    const gitDir = (await exec(git, ['-C', projectDir, 'rev-parse', '--absolute-git-dir'])).trim();
    return { git, workTree: top, prefix: ['-C', top], sharedIndex: path.join(gitDir, 'index') };
  } catch {
    // Not inside a git repository.
  }
  const gitDir = path.join(SNAPSHOT_ROOT, crypto.createHash('sha1').update(projectDir).digest('hex'));
  if (!fs.existsSync(path.join(gitDir, 'HEAD'))) {
    await exec(git, ['init', '--bare', '--quiet', gitDir]);
    fs.mkdirSync(path.join(gitDir, 'info'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'info', 'exclude'), `${DEFAULT_EXCLUDES.join('\n')}\n`);
  }
  return { git, workTree: path.resolve(projectDir), prefix: [`--git-dir=${gitDir}`, `--work-tree=${projectDir}`], sharedIndex: null };
}

function runGit(ctx, args, extraEnv = {}) {
  return exec(ctx.git, [...ctx.prefix, ...args], { cwd: ctx.workTree, env: childEnv(ctx.git, extraEnv) });
}

async function snapshot(ctx) {
  const index = path.join(os.tmpdir(), `pointfix-index-${crypto.randomUUID()}`);
  try {
    // Start from the repo's own index so unchanged files are not re-hashed.
    if (ctx.sharedIndex && fs.existsSync(ctx.sharedIndex)) fs.copyFileSync(ctx.sharedIndex, index);
    const env = { GIT_INDEX_FILE: index };
    await runGit(ctx, ['add', '--all', '--', '.'], env);
    return (await runGit(ctx, ['write-tree'], env)).trim();
  } finally {
    fs.rmSync(index, { force: true });
  }
}

async function changedFiles(ctx, before, after) {
  const out = await runGit(ctx, ['diff', '--no-renames', '--name-status', '-z', before, after]);
  const parts = out.split('\0').filter(Boolean);
  const files = [];
  for (let i = 0; i + 1 < parts.length; i += 2) files.push({ status: parts[i], path: parts[i + 1] });
  return files;
}

async function describeChanges(projectDir, before) {
  const ctx = await gitContext(projectDir);
  const after = await snapshot(ctx);
  if (after === before) return null;
  const files = await changedFiles(ctx, before, after);
  const diff = await runGit(ctx, ['diff', '--no-color', '--no-renames', before, after]);
  return { projectDir, before, after, files: files.slice(0, 200), diff: clip(diff, MAX_DIFF) };
}

function insideWorkTree(ctx, relPath) {
  const full = path.resolve(ctx.workTree, relPath);
  return full.startsWith(ctx.workTree + path.sep) ? full : null;
}

async function undo(msg) {
  const reply = (fields) => send({ type: 'undone', undoId: msg.undoId, ...fields });
  if (typeof msg.projectDir !== 'string' || !path.isAbsolute(msg.projectDir) || !TREE_ID.test(msg.before) || !TREE_ID.test(msg.after)) {
    return reply({ ok: false, message: 'Invalid undo request.' });
  }
  const ctx = await gitContext(msg.projectDir);
  if (!ctx) return reply({ ok: false, message: 'Undo needs git, which was not found.' });
  const files = await changedFiles(ctx, msg.before, msg.after);
  if (!files.length) return reply({ ok: true });

  // Refuse if any of these files changed again after the agent's edit.
  const now = await snapshot(ctx);
  const touchedSince = (await runGit(ctx, ['diff', '--no-renames', '--name-only', '-z', msg.after, now, '--', ...files.map((f) => f.path)]))
    .split('\0')
    .filter(Boolean);
  if (touchedSince.length) {
    return reply({ ok: false, message: `Can't undo safely: these files changed again since: ${touchedSince.join(', ')}. Undo the later change first.` });
  }

  // Check every path before writing anything, so undo never half-applies.
  const outside = files.filter((f) => !insideWorkTree(ctx, f.path)).map((f) => f.path);
  if (outside.length) {
    return reply({ ok: false, message: `Can't undo: these paths are outside the project folder: ${outside.join(', ')}` });
  }

  for (const file of files) {
    const full = insideWorkTree(ctx, file.path);
    if (file.status === 'A') {
      fs.rmSync(full, { force: true });
    } else {
      const content = await exec(ctx.git, [...ctx.prefix, 'cat-file', 'blob', `${msg.before}:${file.path}`], {
        cwd: ctx.workTree,
        encoding: 'buffer',
      });
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
  reply({ ok: true, files: files.map((f) => f.path) });
}

// ---- running an agent ------------------------------------------------------

function validate(msg) {
  if (msg.agent !== 'claude' && msg.agent !== 'codex') return 'Unknown agent.';
  if (typeof msg.prompt !== 'string' || !msg.prompt.trim()) return 'Empty request.';
  if (msg.prompt.length > MAX_TEXT) return 'Request is too long.';
  if (typeof msg.projectDir !== 'string' || !path.isAbsolute(msg.projectDir)) {
    return 'Project folder must be an absolute path, e.g. /Users/you/Projects/my-app.';
  }
  try {
    if (!fs.statSync(msg.projectDir).isDirectory()) return `Not a folder: ${msg.projectDir}`;
  } catch {
    return `Folder not found: ${msg.projectDir}`;
  }
  if (msg.sessionId != null && !SESSION_ID.test(msg.sessionId)) return 'Invalid session id.';
  const images = msg.imagesBase64 ?? [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES || images.some((i) => typeof i !== 'string')) return 'Invalid screenshots.';
  if (images.reduce((n, i) => n + i.length, 0) > 40_000_000) return 'Screenshots are too large.';
  return null;
}

// Both agents read the prompt from stdin (see run), so text starting with "-"
// can never be parsed as a flag and long prompts don't hit Windows' ~32 KB
// command-line limit.
function claudeArgs(msg, imagePaths) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', msg.mode === 'suggest' ? 'plan' : 'acceptEdits',
  ];
  if (imagePaths.length) args.push('--add-dir', IMAGE_DIR);
  if (msg.sessionId) args.push('--resume', msg.sessionId);
  return args;
}

function codexArgs(msg, imagePaths) {
  const args = ['exec'];
  if (msg.sessionId) args.push('resume');
  args.push(
    '--json',
    '--skip-git-repo-check',
    '-c', `sandbox_mode="${msg.mode === 'suggest' ? 'read-only' : 'workspace-write'}"`
  );
  for (const p of imagePaths) args.push('--image', p);
  args.push('--');
  if (msg.sessionId) args.push(msg.sessionId);
  args.push('-'); // read the prompt from stdin (see run)
  return args;
}

function toolSummary(name, input = {}) {
  const detail = input.file_path || input.path || input.pattern || input.command || input.url || '';
  return detail ? `${name} ${String(detail).slice(0, 200)}` : name;
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

// Translate one JSON line from either CLI into extension messages.
// Returns the final result once the run has finished, otherwise null.
function handleClaudeEvent(ev) {
  if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
    send({ type: 'session', sessionId: ev.session_id });
  } else if (ev.type === 'assistant') {
    for (const block of ev.message?.content || []) {
      if (block.type === 'text' && block.text.trim()) send({ type: 'text', text: clip(block.text) });
      if (block.type === 'tool_use') {
        if (EDIT_TOOLS.has(block.name)) filesEdited = true;
        send({ type: 'tool', text: toolSummary(block.name, block.input) });
      }
    }
  } else if (ev.type === 'result') {
    return {
      isError: Boolean(ev.is_error),
      message: ev.is_error ? clip(String(ev.result || ev.subtype || 'Claude reported an error.')) : undefined,
    };
  }
  return null;
}

function handleCodexEvent(ev) {
  if (ev.type === 'thread.started' && ev.thread_id) {
    send({ type: 'session', sessionId: ev.thread_id });
  } else if (ev.type === 'item.completed' && ev.item) {
    const item = ev.item;
    if (item.type === 'agent_message' && item.text?.trim()) send({ type: 'text', text: clip(item.text) });
    else if (item.type === 'command_execution') send({ type: 'tool', text: toolSummary('Run', { command: item.command }) });
    else if (item.type === 'file_change') {
      filesEdited = true;
      const files = (item.changes || []).map((c) => `${c.kind || 'edit'} ${c.path}`).join(', ');
      send({ type: 'tool', text: `Edit ${files}`.trim() });
    }
  } else if (ev.type === 'turn.completed') {
    return { isError: false };
  } else if (ev.type === 'turn.failed' || ev.type === 'error') {
    return { isError: true, message: clip(String(ev.error?.message || ev.message || 'Codex reported an error.')) };
  }
  return null;
}

async function run(msg) {
  if (child) return send({ type: 'error', message: 'A request is already running. Stop it first.' });
  const problem = validate(msg);
  if (problem) return send({ type: 'error', message: problem });

  const binary = resolveBinary(msg.agent);
  if (!binary) {
    const how = msg.agent === 'claude'
      ? 'Install Claude Code (https://claude.com/claude-code) and run `claude` once to sign in'
      : 'Install Codex (`npm install -g @openai/codex`) and run `codex` once to sign in with ChatGPT';
    return send({ type: 'error', message: `Couldn't find the ${msg.agent} command. ${how}, then run the helper install again.` });
  }

  // Record the project before an edit run so we can show and undo changes.
  let before = null;
  if (msg.mode !== 'suggest') {
    try {
      const ctx = await gitContext(msg.projectDir);
      if (ctx) before = await snapshot(ctx);
    } catch {
      // Change tracking is best effort; the run itself still goes ahead.
    }
  }

  const imagePaths = [];
  if (msg.imagesBase64?.length) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
    for (const data of msg.imagesBase64) {
      const p = path.join(IMAGE_DIR, `${crypto.randomUUID()}.png`);
      fs.writeFileSync(p, Buffer.from(data, 'base64'));
      imagePaths.push(p);
    }
  }

  const isClaude = msg.agent === 'claude';
  const args = isClaude ? claudeArgs(msg, imagePaths) : codexArgs(msg, imagePaths);
  const handleEvent = isClaude ? handleClaudeEvent : handleCodexEvent;

  filesEdited = false;
  let finished = false;
  let buffered = '';
  let stderr = '';
  const [cmd, cmdArgs, extra] = command(binary, args);
  const proc = spawn(cmd, cmdArgs, { cwd: msg.projectDir, env: childEnv(binary), stdio: ['pipe', 'pipe', 'pipe'], ...extra });
  child = proc;
  stopped = false;
  // Codex gets the screenshots with --image; Claude reads them by path.
  const shots = isClaude && imagePaths.length ? `\n\nScreenshots of the selected elements, in order: ${imagePaths.join(', ')}` : '';
  proc.stdin.on('error', () => {});
  proc.stdin.end(msg.prompt + shots);

  async function complete(result) {
    if (finished) return;
    finished = true;
    let changes = null;
    if (before) {
      try {
        changes = await describeChanges(msg.projectDir, before);
      } catch {
        // Fall back to the tool-based signal below.
      }
    }
    if (changes) send({ type: 'changes', ...changes });
    send({ type: 'done', edited: Boolean(changes) || filesEdited, ...result });
  }

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line || finished) continue;
      let result = null;
      try {
        result = handleEvent(JSON.parse(line));
      } catch {
        // Ignore non-JSON lines (banners, warnings).
      }
      if (result) complete(result);
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });

  const cleanup = () => {
    if (child === proc) child = null;
    for (const p of imagePaths) fs.rm(p, { force: true }, () => {});
  };
  proc.on('error', (err) => {
    cleanup();
    if (!finished) send({ type: 'error', message: `Couldn't start ${msg.agent}: ${err.message}` });
    finished = true;
  });
  proc.on('close', (code, signal) => {
    cleanup();
    // Windows reports a killed process by exit code, not by signal.
    if (signal || stopped) complete({ isError: true, message: 'Stopped.' });
    else complete({ isError: code !== 0, message: code !== 0 ? clip(stderr.trim() || `${msg.agent} exited with code ${code}.`) : undefined });
  });
}

function handle(msg) {
  const fail = (err) => send({ type: 'error', message: err.message || String(err) });
  if (msg?.type === 'run') run(msg).catch(fail);
  else if (msg?.type === 'cancel') stopChild();
  else if (msg?.type === 'status') status().catch(fail);
  else if (msg?.type === 'detectProject') detectProject(msg).catch(() => send({ type: 'project', projectDir: null }));
  else if (msg?.type === 'chooseFolder') chooseFolder();
  else if (msg?.type === 'undo') undo(msg).catch((err) => send({ type: 'undone', undoId: msg.undoId, ok: false, message: err.stderr?.trim() || err.message }));
}

let pending = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= 4) {
    const length = pending.readUInt32LE(0);
    if (pending.length < 4 + length) break;
    const body = pending.subarray(4, 4 + length);
    pending = pending.subarray(4 + length);
    let msg;
    try {
      msg = JSON.parse(body.toString('utf8'));
    } catch {
      send({ type: 'error', message: 'Malformed message from the extension.' });
      continue;
    }
    handle(msg);
  }
});
// Chrome closes stdin when the extension disconnects (tab closed, panel closed).
process.stdin.on('end', () => {
  stopChild();
  process.exit(0);
});
