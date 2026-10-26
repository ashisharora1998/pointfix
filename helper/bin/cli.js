#!/usr/bin/env node
// Installs the native messaging host so the Chrome extension can reach the
// user's local `claude` / `codex` CLI.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOST_NAME = 'com.pointfix.bridge';
// Fill in after the first Chrome Web Store upload (Developer Dashboard → item ID).
const STORE_EXTENSION_ID = 'pcgkgikpebfgbokablimgdjlnpjklnhg';

const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.pointfix');
const IS_WIN = process.platform === 'win32';
const LAUNCHER = path.join(INSTALL_DIR, IS_WIN ? 'host.bat' : 'host.sh');
const HOST_JS = path.join(INSTALL_DIR, 'host.js');
const CONFIG = path.join(INSTALL_DIR, 'config.json');
const WIN_MANIFEST = path.join(INSTALL_DIR, `${HOST_NAME}.json`);
// The ChatGPT desktop app for macOS ships its own Codex CLI; its location
// inside the app has changed between versions.
const CHATGPT_APP_CODEX = process.platform === 'darwin'
  ? ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex', '/Applications/ChatGPT.app/Contents/Resources/codex']
  : [];

// [browser data dir that proves the browser is installed, native host manifest dir]
function browserTargets() {
  if (process.platform === 'darwin') {
    const base = path.join(HOME, 'Library', 'Application Support');
    return ['Google/Chrome', 'Google/Chrome Beta', 'Chromium', 'BraveSoftware/Brave-Browser', 'Microsoft Edge'].map((b) => [
      path.join(base, b),
      path.join(base, b, 'NativeMessagingHosts'),
    ]);
  }
  if (process.platform === 'linux') {
    const base = path.join(HOME, '.config');
    return ['google-chrome', 'google-chrome-beta', 'chromium', 'BraveSoftware/Brave-Browser', 'microsoft-edge'].map((b) => [
      path.join(base, b),
      path.join(base, b, 'NativeMessagingHosts'),
    ]);
  }
  return [];
}

const WIN_REGISTRY_KEYS = ['Google\\Chrome', 'Chromium', 'BraveSoftware\\Brave-Browser', 'Microsoft\\Edge'].map(
  (b) => `HKCU\\Software\\${b}\\NativeMessagingHosts\\${HOST_NAME}`
);

function which(name) {
  try {
    const out = execFileSync(IS_WIN ? 'where' : 'which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

function existingOrigins(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).allowed_origins || [];
  } catch {
    return [];
  }
}

function parseIds(args) {
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--extension-id') ids.push(args[++i]);
    else if (args[i].startsWith('--extension-id=')) ids.push(args[i].split('=')[1]);
  }
  for (const id of ids) {
    if (!/^[a-p]{32}$/.test(id || '')) throw new Error(`Not a valid Chrome extension id: ${id}`);
  }
  if (STORE_EXTENSION_ID) ids.push(STORE_EXTENSION_ID);
  return ids;
}

function install(args) {
  const ids = parseIds(args);
  const manifestPaths = IS_WIN
    ? [WIN_MANIFEST]
    : browserTargets()
        .filter(([dataDir], i) => i === 0 || fs.existsSync(dataDir))
        .map(([, hostDir]) => path.join(hostDir, `${HOST_NAME}.json`));

  const origins = new Set(manifestPaths.flatMap(existingOrigins));
  for (const id of ids) origins.add(`chrome-extension://${id}/`);
  if (origins.size === 0) {
    throw new Error('Pass the extension id: install --extension-id <id>  (shown in the extension’s error message or on chrome://extensions)');
  }

  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'host.js'), HOST_JS);
  const claudePath = which('claude');
  const codexPath = which('codex') || CHATGPT_APP_CODEX.find((p) => fs.existsSync(p)) || null;
  fs.writeFileSync(CONFIG, JSON.stringify({ claudePath, codexPath }, null, 2));

  if (IS_WIN) {
    fs.writeFileSync(LAUNCHER, `@echo off\r\n"${process.execPath}" "${HOST_JS}" %*\r\n`);
  } else {
    fs.writeFileSync(LAUNCHER, `#!/bin/sh\nexec "${process.execPath}" "${HOST_JS}" "$@"\n`, { mode: 0o755 });
    fs.chmodSync(LAUNCHER, 0o755);
  }

  const manifest = JSON.stringify(
    {
      name: HOST_NAME,
      description: 'Pointfix bridge to local Claude Code / Codex',
      path: LAUNCHER,
      type: 'stdio',
      allowed_origins: [...origins],
    },
    null,
    2
  );
  for (const manifestPath of manifestPaths) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, manifest);
    console.log(`✓ Registered with ${manifestPath}`);
  }
  if (IS_WIN) {
    for (const key of WIN_REGISTRY_KEYS) {
      execFileSync('reg', ['add', key, '/ve', '/t', 'REG_SZ', '/d', WIN_MANIFEST, '/f'], { stdio: 'ignore' });
    }
    console.log('✓ Registered in the Windows registry');
  }

  console.log(`✓ Helper installed in ${INSTALL_DIR}`);
  console.log(`  Allowed extensions: ${[...origins].join(', ')}`);
  console.log(claudePath ? `✓ Claude Code: ${claudePath}` : '• Claude Code not found (optional) — install it and run `claude` once to sign in');
  console.log(codexPath ? `✓ Codex: ${codexPath}` : '• Codex not found (optional) — `npm install -g @openai/codex`, then run `codex` once to sign in');
  console.log('\nDone. Go back to the page and press Send.');
}

function uninstall() {
  const manifestPaths = IS_WIN ? [WIN_MANIFEST] : browserTargets().map(([, d]) => path.join(d, `${HOST_NAME}.json`));
  for (const p of manifestPaths) fs.rmSync(p, { force: true });
  if (IS_WIN) {
    for (const key of WIN_REGISTRY_KEYS) {
      try {
        execFileSync('reg', ['delete', key, '/f'], { stdio: 'ignore' });
      } catch {
        // Key was not present.
      }
    }
  }
  fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  console.log('✓ Helper removed');
}

function doctor() {
  const ok = (cond, msg) => console.log(`${cond ? '✓' : '✗'} ${msg}`);
  ok(fs.existsSync(HOST_JS), `Helper script: ${HOST_JS}`);
  ok(fs.existsSync(LAUNCHER), `Launcher: ${LAUNCHER}`);
  ok(fs.existsSync(process.execPath), `Node: ${process.execPath}`);
  const manifests = IS_WIN ? [WIN_MANIFEST] : browserTargets().map(([, d]) => path.join(d, `${HOST_NAME}.json`));
  for (const p of manifests.filter((m) => fs.existsSync(m))) ok(true, `Registered: ${p} → ${existingOrigins(p).join(', ')}`);
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    // Not installed yet.
  }
  for (const [name, bin] of [['Claude Code', config.claudePath], ['Codex', config.codexPath]]) {
    if (!bin) {
      ok(false, `${name}: not found`);
      continue;
    }
    try {
      ok(true, `${name}: ${execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim()}`);
    } catch (err) {
      ok(false, `${name}: ${bin} failed (${err.message})`);
    }
  }
}

const [command = 'help', ...rest] = process.argv.slice(2);
try {
  if (command === 'install') install(rest);
  else if (command === 'uninstall') uninstall();
  else if (command === 'doctor') doctor();
  else {
    console.log('Usage: pointfix <install [--extension-id <id>] | uninstall | doctor>');
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
