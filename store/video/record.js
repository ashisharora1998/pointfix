// Records the Pointfix demo video with a voice-over. Speaks each narration
// line with macOS `say`, drives a headless Chrome over the DevTools protocol
// like a person would (mouse, clicks, typing) on demo.html in time with the
// voice, encodes the screencast frames with encode.swift and lays the voice
// onto the video with mux.swift.
//   node store/video/record.js [page-url]   (serve the repo on :4321 first)
//   VOICE="Ava (Premium)" node store/video/record.js   to pick a voice
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAGE = process.argv[2] || 'http://localhost:4321/store/video/demo.html';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCALE = 1.5; // 1280x800 CSS px -> 1920x1200 video
const FRAMES = path.join(os.tmpdir(), `pointfix-frames-${process.pid}`);
const OUT = path.join(__dirname, 'pointfix-demo.mp4');
const PORT = 9333;
const RATE = 178; // words per minute

// One line per scene; the demo below waits for each line to finish.
const NARRATION = {
  intro: 'This is Pointfix. Point at anything on your web page, and your own AI coding agent fixes the code.',
  open: 'Click the Pointfix icon, then hover to highlight any element on the page.',
  select: 'Click the one you want to change. Pointfix finds your project folder automatically.',
  describe: 'Now describe the change, in plain words.',
  send: 'Hit send. Pointfix gives Claude Code the exact element: its HTML, its styles, a screenshot, and the component it comes from. Claude finds the right file, and edits it.',
  result: 'When it is done, the page reloads by itself, and you see the before and after, side by side.',
  diff: 'You can review the exact diff, and undo any change with one click.',
  end: 'Pointfix is free, and works with Claude Code or Codex, using your own subscription.',
};

// Prefer a Premium or Enhanced voice when one is installed; they sound far more natural.
function pickVoice() {
  if (process.env.VOICE) return process.env.VOICE;
  // Lines look like "Samantha (English (US)) en_US    # Hello! My name is Samantha."
  const voices = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n')
    .map((l) => l.match(/^(.+?)\s+en_(US|GB)\s+#/)).filter(Boolean).map((m) => m[1].trim());
  // Natural-sounding voices first; never one of the novelty voices (Albert, Bells…).
  for (const pattern of [/premium/i, /enhanced/i, /^Samantha\b/, /^Daniel\b/, /^Karen\b/]) {
    const match = voices.find((v) => pattern.test(v));
    if (match) return match;
  }
  return 'Samantha';
}

function speak(dir, voice) {
  const clips = {};
  for (const [id, text] of Object.entries(NARRATION)) {
    const file = path.join(dir, `${id}.m4a`);
    execFileSync('say', ['-v', voice, '-r', String(RATE), '--file-format=m4af', '--data-format=aac', '-o', file, text]);
    const info = execFileSync('afinfo', [file], { encoding: 'utf8' });
    clips[id] = { file, duration: Number(info.match(/estimated duration: ([\d.]+)/)[1]) };
  }
  return clips;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(`${m.error.message}`));
        else resolve(m.result);
      } else if (m.method) {
        this.handlers.get(m.method)?.(m.params);
      }
    };
    this.ready = new Promise((r) => (this.ws.onopen = r));
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    this.handlers.set(method, fn);
  }
}

async function main() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const voice = pickVoice();
  const clips = speak(FRAMES, voice);
  console.log(`Voice: ${voice}; narration ${Object.values(clips).reduce((n, c) => n + c.duration, 0).toFixed(1)}s`);
  // Stretch the scripted agent so its work fills the "send" line
  // (it finishes 4.3s after Send at pace 1; Send is clicked ~0.9s into the line).
  const pace = Math.max(1, (clips.send.duration - 1.2) / 4.3);
  const pageUrl = `${PAGE}?pace=${pace.toFixed(2)}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pointfix-rec-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl;
    for (let i = 0; i < 50 && !wsUrl; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      } catch {
        // Chrome still starting.
      }
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error('Chrome did not start');

    const cdp = new CDP(wsUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: SCALE, mobile: false });

    const js = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    const waitFor = async (expression, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await js(expression).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`Timed out waiting for: ${expression}`);
    };
    const load = async (url) => {
      const loaded = new Promise((r) => cdp.on('Page.loadEventFired', r));
      await cdp.send('Page.navigate', { url });
      await loaded;
      await sleep(300);
    };

    // Start from a clean page, then record.
    await load(pageUrl);
    await js('__demo.reset()');
    await load(pageUrl);

    const frames = [];
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      const file = path.join(FRAMES, `f${String(frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      frames.push({ file, t: metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 1 });

    // ---- input helpers ----------------------------------------------------
    let mouse = { x: 900, y: 520 };
    const move = async (x, y, ms = 650) => {
      const steps = Math.max(10, Math.round(ms / 16));
      const { x: sx, y: sy } = mouse;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + (x - sx) * e, y: sy + (y - sy) * e });
        await sleep(ms / steps);
      }
      mouse = { x, y };
    };
    const click = async (x, y, ms) => {
      await move(x, y, ms);
      await sleep(120);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(90);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };
    const type = async (text) => {
      for (const ch of text) {
        await cdp.send('Input.insertText', { text: ch });
        await sleep(38 + Math.random() * 40);
      }
    };
    const panel = (sel) => `document.querySelector('pointfix-overlay')?.shadowRoot?.querySelector(${JSON.stringify(sel)})`;
    const centerOf = async (expr) => js(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

    // Nudge the cursor so it is drawn from the first frame.
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });

    // ---- the demo, in time with the voice ---------------------------------
    // say(id) starts a narration line and resolves when it has been spoken.
    const say = (id) => {
      clips[id].start = Date.now() / 1000;
      return sleep(clips[id].duration * 1000 + 250);
    };
    const icon = await centerOf("document.getElementById('pointfix-icon')");
    const h1 = await centerOf("document.querySelector('h1')");
    const button = await centerOf("document.querySelector('.hero-cta')");

    await sleep(700);
    let line = say('intro');
    await sleep(1500);
    await move(icon[0] - 140, icon[1] + 160, 2200); // drift toward the toolbar
    await line;

    line = say('open');
    await click(icon[0], icon[1], 700);
    await waitFor(`!!${panel('.hint')} && getComputedStyle(${panel('.hint')}).display !== 'none'`);
    await move(h1[0], h1[1], 900);
    await sleep(500);
    await move(button[0], button[1], 800);
    await line;

    line = say('select');
    await click(button[0], button[1], 200);
    await waitFor(`${panel('.folder')}?.value`);
    await line;

    line = say('describe');
    await sleep(300);
    await type('Use our brand blue and make it stand out more');
    await line;

    line = say('send');
    await click(...(await centerOf(panel('.send'))), 650);
    await line;
    await waitFor(`document.body.classList.contains('changed') && ${panel('.compare-grid')}`, 20000);

    line = say('result');
    await sleep(800);
    await move(...(await centerOf(panel('.compare-grid'))), 900);
    await line;

    line = say('diff');
    await js(`${panel('.msg.changes')}.scrollIntoView({ block: 'start' })`);
    await sleep(200);
    await click(...(await centerOf(panel('.msg.changes summary'))), 800);
    await sleep(400);
    // Keep the card's header (with Undo) in view while the diff is open.
    await js(`${panel('.msg.changes')}.scrollIntoView({ block: 'start', behavior: 'smooth' })`);
    await sleep(900);
    await move(...(await centerOf(panel('.msg.changes .undo'))), 700);
    await line;

    line = say('end');
    await js('__demo.endCard()');
    await line;
    await sleep(800);

    const stoppedAt = Date.now() / 1000;
    await cdp.send('Page.stopScreencast');
    await sleep(200);
    // Hold the last frame until recording stopped: a still screen (like the end
    // card) sends no new frames, but the voice may still be speaking.
    const end = Math.max(frames[frames.length - 1].t + 0.6, stoppedAt);
    frames.push({ file: frames[frames.length - 1].file, t: end });
    const t0 = frames[0].t;
    const list = frames.map((f) => ({ file: f.file, t: f.t - t0 }));
    fs.writeFileSync(path.join(FRAMES, 'frames.json'), JSON.stringify(list));
    console.log(`Captured ${frames.length} frames over ${(end - t0).toFixed(1)}s`);

    const silent = path.join(FRAMES, 'silent.mp4');
    execFileSync('swift', ['-suppress-warnings', path.join(__dirname, 'encode.swift'), path.join(FRAMES, 'frames.json'), silent], { stdio: 'inherit' });
    const lines = Object.values(clips).filter((c) => c.start).map((c) => ({ file: c.file, start: c.start - t0 }));
    fs.writeFileSync(path.join(FRAMES, 'voice.json'), JSON.stringify(lines));
    for (const [id, c] of Object.entries(clips)) console.log(`  ${id.padEnd(8)} ${(c.start - t0).toFixed(1).padStart(5)}s  +${c.duration.toFixed(1)}s`);
    execFileSync('swift', ['-suppress-warnings', path.join(__dirname, 'mux.swift'), silent, path.join(FRAMES, 'voice.json'), OUT], { stdio: 'inherit' });
  } finally {
    chrome.kill();
    fs.rmSync(FRAMES, { recursive: true, force: true });
    setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
