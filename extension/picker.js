// Injected into the page when the toolbar icon is clicked. Lets the user hover
// and click elements, then chat with a local coding agent about them.
(() => {
  if (window.__pointfix) {
    window.__pointfix.start();
    return;
  }

  const renderMarkdown = globalThis.__pointfixMarkdown;
  const HELPER_PACKAGE = 'pointfix';
  const AGENTS = { claude: 'Claude Code', codex: 'Codex (ChatGPT)' };
  const MAX_ELEMENTS = 5;
  const STYLE_PROPS = [
    'display', 'position', 'width', 'height', 'margin', 'padding', 'gap', 'justify-content', 'align-items',
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
    'border', 'border-radius', 'box-shadow', 'opacity',
  ];
  const FILE_STATUS = { A: 'added', M: 'modified', D: 'deleted', T: 'changed' };

  const hostEl = document.createElement('pointfix-overlay');
  hostEl.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const root = hostEl.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
      [hidden] { display: none !important; }
      .box { position: fixed; border: 2px solid #2563eb; background: rgba(37, 99, 235, 0.12); border-radius: 3px; display: none; }
      .sel-layer .box { display: block; border-color: #16a34a; background: rgba(22, 163, 74, 0.10); }
      .sel-layer .box span { position: absolute; top: -10px; left: -10px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: #16a34a; color: #fff; font: 600 11px/18px system-ui, sans-serif; text-align: center; }
      .label { position: fixed; display: none; max-width: 420px; padding: 2px 6px; border-radius: 3px; background: #1e293b; color: #f8fafc; font: 12px/1.4 ui-monospace, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hint { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 32px); padding: 6px 12px; border-radius: 6px; background: #1e293b; color: #f8fafc; display: none; text-align: center; }
      .panel { position: fixed; right: 16px; bottom: 16px; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); display: none; flex-direction: column; border-radius: 10px; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.25); pointer-events: auto; }
      header { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 12px; cursor: grab; user-select: none; touch-action: none; }
      header.dragging { cursor: grabbing; }
      header strong { font-weight: 600; white-space: nowrap; }
      .target { flex: 1; min-width: 0; margin-left: 4px; color: #475569; font: 12px ui-monospace, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; min-height: 0; overflow: hidden; }
      .panel.collapsed .body { display: none; }
      .mini-spinner { display: none; }
      .panel.collapsed.running .mini-spinner { display: inline-block; }
      .row { display: flex; gap: 8px; }
      .row label { flex: 1; }
      label { display: flex; flex-direction: column; gap: 2px; color: #475569; font-size: 12px; }
      input, select, textarea { width: 100%; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #0f172a; }
      textarea { resize: vertical; min-height: 60px; }
      input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
      .field { display: flex; flex-direction: column; gap: 2px; }
      .field-label { color: #475569; font-size: 12px; }
      .folder-row { display: flex; gap: 6px; }
      .folder-row input { flex: 1; min-width: 0; }
      .folder-note { color: #475569; font-size: 12px; }
      .folder-note:empty { display: none; }
      .context { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; color: #475569; font-size: 12px; }
      .context label { flex-direction: row; align-items: center; gap: 4px; }
      .context input { width: auto; margin: 0; }
      .errors { border: 1px solid #fecaca; border-left: 3px solid #dc2626; border-radius: 6px; background: #fef2f2; color: #991b1b; }
      .errors-head { display: flex; align-items: center; gap: 8px; padding: 2px 8px 2px 2px; }
      .errors-toggle { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: none; background: transparent; color: inherit; font-weight: 600; text-align: left; }
      .errors-icon { width: 16px; height: 16px; border-radius: 50%; background: #dc2626; color: #fff; font: 700 11px/16px system-ui, sans-serif; text-align: center; flex: none; }
      .caret { display: inline-block; color: #b91c1c; font-size: 16px; line-height: 1; transition: transform 0.15s; }
      .errors-toggle[aria-expanded="true"] .caret { transform: rotate(90deg); }
      .errors-include { flex-direction: row; align-items: center; gap: 4px; color: #991b1b; white-space: nowrap; }
      .errors-include input { width: auto; margin: 0; }
      .errors.excluded { opacity: 0.6; }
      .error-list { list-style: none; margin: 0; padding: 0 8px 8px; display: flex; flex-direction: column; gap: 4px; max-height: 30vh; overflow-y: auto; }
      .error-item { padding: 4px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.7); }
      .error-item summary { cursor: pointer; list-style: none; display: flex; gap: 6px; align-items: baseline; }
      .error-item summary::-webkit-details-marker { display: none; }
      .error-item .kind { flex: none; padding: 0 5px; border-radius: 3px; background: #fee2e2; color: #b91c1c; font: 600 10px/16px system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.02em; }
      .error-item .first { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/16px ui-monospace, Menlo, monospace; color: #7f1d1d; }
      .error-item[open] .first { white-space: normal; word-break: break-word; }
      .error-item pre { margin: 4px 0 0; padding: 4px 6px; border-radius: 3px; background: rgba(220, 38, 38, 0.06); overflow-x: auto; white-space: pre; font: 11px/1.45 ui-monospace, Menlo, monospace; color: #7f1d1d; }
      .log { overflow-y: auto; min-height: 0; max-height: 40vh; display: flex; flex-direction: column; gap: 6px; }
      .log:empty { display: none; }
      .msg { white-space: pre-wrap; word-break: break-word; padding: 6px 8px; border-radius: 6px; background: #f1f5f9; }
      .msg.agent { white-space: normal; }
      .msg.agent p { margin: 0 0 6px; }
      .msg.agent p:last-child, .msg.agent ul:last-child, .msg.agent ol:last-child, .msg.agent pre:last-child { margin-bottom: 0; }
      .msg.agent ul, .msg.agent ol { margin: 0 0 6px; padding-left: 20px; }
      .msg.agent .md-heading { font-weight: 600; margin: 4px 0; }
      .msg code { font: 12px ui-monospace, Menlo, monospace; padding: 0 3px; border-radius: 3px; background: rgba(100, 116, 139, 0.18); }
      .msg pre { margin: 0 0 6px; padding: 6px 8px; border-radius: 4px; background: rgba(100, 116, 139, 0.14); overflow-x: auto; white-space: pre; font: 12px/1.45 ui-monospace, Menlo, monospace; }
      .msg a { color: #2563eb; }
      .msg.you { background: #dbeafe; }
      .msg.tool { background: transparent; padding: 0 8px; color: #475569; font: 12px ui-monospace, Menlo, monospace; }
      .msg.error { background: #fee2e2; color: #991b1b; }
      .msg.done { background: transparent; padding: 0 8px; color: #15803d; font-size: 12px; }
      .msg.changes { white-space: normal; border: 1px solid #cbd5e1; background: transparent; }
      .changes-head { display: flex; align-items: center; gap: 8px; }
      .changes-head span { flex: 1; font-weight: 600; }
      .msg.changes ul { margin: 4px 0; padding-left: 18px; font: 12px ui-monospace, Menlo, monospace; }
      .msg.changes summary { cursor: pointer; color: #475569; font-size: 12px; }
      .diff { max-height: 240px; overflow: auto; margin: 4px 0 0; padding: 6px; border-radius: 4px; background: #f8fafc; white-space: pre; font: 11px/1.45 ui-monospace, Menlo, monospace; }
      .diff .add { color: #15803d; background: rgba(22, 163, 74, 0.10); display: block; }
      .diff .del { color: #b91c1c; background: rgba(220, 38, 38, 0.10); display: block; }
      .diff .hunk { color: #6d28d9; display: block; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { padding: 2px 10px; border-radius: 999px; font-size: 12px; }
      .msg.compare { white-space: normal; background: transparent; border: 1px solid #cbd5e1; }
      .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
      .compare-grid figure { margin: 0; min-width: 0; }
      .compare-grid figcaption { font-size: 11px; color: #475569; margin-bottom: 2px; }
      .compare-grid canvas { display: block; max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #e2e8f0; }
      .compare-grid .missing { font-size: 12px; color: #475569; }
      .panel.show-chats .body > :not(.chats-view) { display: none !important; }
      .chats-view { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
      .chats-head { display: flex; align-items: center; gap: 8px; }
      .chats-head strong { flex: 1; }
      .chats-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 55vh; }
      .chat-item { display: flex; gap: 4px; }
      .chat-open { flex: 1; min-width: 0; text-align: left; }
      .chat-open span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chat-meta { font-size: 11px; color: #475569; }
      .chats-empty { color: #475569; font-size: 12px; }
      .working { display: none; align-items: center; gap: 8px; color: #475569; font-size: 12px; }
      .working.on { display: flex; }
      .working .stop { margin-left: auto; }
      .spinner, .mini-spinner { width: 14px; height: 14px; border: 2px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; flex: none; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinner, .mini-spinner { animation-duration: 2.4s; } }
      .actions { display: flex; gap: 6px; align-items: center; }
      .spacer { flex: 1; }
      button { white-space: nowrap; padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; cursor: pointer; }
      button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
      button.small { padding: 2px 8px; font-size: 12px; }
      button:disabled { opacity: 0.5; cursor: default; }
      button.icon { padding: 0; width: 26px; height: 26px; border: none; background: transparent; font-size: 15px; line-height: 26px; border-radius: 5px; color: inherit; }
      button.icon:hover:not(:disabled) { background: rgba(100, 116, 139, 0.15); }
      @media (prefers-color-scheme: dark) {
        .panel { background: #0f172a; color: #e2e8f0; border-color: #334155; }
        label, .target, .msg.tool, .working, .context, .msg.changes summary, .field-label, .folder-note, .compare-grid figcaption, .compare-grid .missing, .chat-meta, .chats-empty { color: #94a3b8; }
        .msg.compare { border-color: #334155; background: transparent; }
        .compare-grid canvas { border-color: #334155; }
        .spinner, .mini-spinner { border-color: #334155; border-top-color: #60a5fa; }
        input, select, textarea, button { background: #1e293b; color: #e2e8f0; border-color: #334155; }
        button.icon { background: transparent; }
        .msg { background: #1e293b; }
        .msg.you { background: #1e3a8a; }
        .msg.error { background: #450a0a; color: #fecaca; }
        .msg.done { color: #4ade80; }
        .msg.changes { border-color: #334155; background: transparent; }
        .msg a { color: #60a5fa; }
        .diff { background: #020617; }
        .diff .add { color: #4ade80; }
        .diff .del { color: #f87171; }
        .diff .hunk { color: #c4b5fd; }
        button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
        .errors { background: #2a0a0a; border-color: #7f1d1d; border-left-color: #ef4444; color: #fecaca; }
        .errors-toggle { background: transparent; color: #fecaca; }
        .errors-include { color: #fecaca; }
        .caret { color: #fca5a5; }
        .error-item { background: rgba(15, 23, 42, 0.6); }
        .error-item .kind { background: #450a0a; color: #fca5a5; }
        .error-item .first, .error-item pre { color: #fecaca; }
        .error-item pre { background: rgba(239, 68, 68, 0.08); }
      }
    </style>
    <div class="box hover-box"></div>
    <div class="sel-layer"></div>
    <div class="label"></div>
    <div class="hint" role="status"></div>
    <div class="panel" role="dialog" aria-label="Send elements to a coding agent">
      <header>
        <strong class="title">Fix this element</strong>
        <span class="target"></span>
        <span class="mini-spinner" aria-hidden="true"></span>
        <button class="icon parent" type="button" aria-label="Select parent element" title="Select parent element">↑</button>
        <button class="icon child" type="button" aria-label="Select child element" title="Select child element">↓</button>
        <button class="icon collapse" type="button" aria-label="Collapse panel" aria-expanded="true" title="Collapse">–</button>
        <button class="icon chats-btn" type="button" aria-label="Past chats" aria-pressed="false" title="Past chats">☰</button>
        <button class="icon setup" type="button" aria-label="Setup and help" title="Setup and help">⚙</button>
        <button class="icon close" type="button" aria-label="Close" title="Close">×</button>
      </header>
      <div class="body">
        <div class="row">
          <label>Agent
            <select class="agent">
              <option value="claude">Claude Code</option>
              <option value="codex">Codex (ChatGPT)</option>
            </select>
          </label>
          <label>Mode
            <select class="mode">
              <option value="edit">Make the change</option>
              <option value="suggest">Suggest only</option>
            </select>
          </label>
        </div>
        <div class="field">
          <span class="field-label" id="ep-folder-label">Project folder on this computer</span>
          <div class="folder-row">
            <input class="folder" type="text" spellcheck="false" placeholder="/Users/you/Projects/my-app" aria-labelledby="ep-folder-label" aria-describedby="ep-folder-note">
            <button class="browse" type="button">Browse…</button>
          </div>
          <span class="folder-note" id="ep-folder-note" role="status"></span>
        </div>
        <div class="context">
          <span class="viewport"></span>
        </div>
        <div class="errors" hidden>
          <div class="errors-head">
            <button class="errors-toggle" type="button" aria-expanded="false" aria-controls="ep-error-list">
              <span class="errors-icon" aria-hidden="true">!</span>
              <span class="error-count"></span>
              <span class="caret" aria-hidden="true">›</span>
            </button>
            <label class="errors-include"><input type="checkbox" class="include-errors" checked> Send to agent</label>
          </div>
          <ul class="error-list" id="ep-error-list" hidden></ul>
        </div>
        <div class="log" aria-live="polite"></div>
        <div class="working" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <span class="working-text"></span>
          <span class="elapsed" aria-hidden="true"></span>
          <button class="stop small" type="button" hidden>Stop</button>
        </div>
        <div class="chats-view" hidden>
          <div class="chats-head">
            <strong>Past chats on this site</strong>
            <button class="small chats-back" type="button">Back</button>
          </div>
          <ul class="chats-list"></ul>
        </div>
        <div class="chips" role="group" aria-label="Quick actions">
          <button class="chip" type="button" data-prompt="Fix the alignment and spacing of this so it lines up with the elements around it.">Fix alignment</button>
          <button class="chip" type="button" data-prompt="Make this work well on phone and tablet widths without changing the desktop layout.">Make responsive</button>
          <button class="chip" type="button" data-prompt="Make this match the styles used elsewhere on the site: colors, fonts, spacing and corner radius.">Match site style</button>
          <button class="chip" type="button" data-prompt="Where is this in the code? Don't change anything. Tell me the file, the line, and which component renders it.">Where's the code?</button>
        </div>
        <label>What should change?
          <textarea class="message" rows="3" placeholder="e.g. Make this button match the header color (⌘/Ctrl+Enter to send)"></textarea>
        </label>
        <div class="actions">
          <button class="repick" type="button">Pick another</button>
          <button class="newchat" type="button">New chat</button>
          <button class="copy" type="button" title="Copy the element details and your request, to paste into another AI tool">Copy prompt</button>
          <span class="spacer"></span>
          <button class="send primary" type="button">Send</button>
        </div>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const hoverBox = $('.hover-box');
  const selLayer = $('.sel-layer');
  const label = $('.label');
  const hint = $('.hint');
  const panel = $('.panel');
  const header = $('header');
  const ui = {
    title: $('.title'), target: $('.target'), parent: $('.parent'), child: $('.child'), collapse: $('.collapse'),
    setup: $('.setup'), close: $('.close'), agent: $('.agent'), mode: $('.mode'), folder: $('.folder'),
    browse: $('.browse'), folderNote: $('.folder-note'),
    viewport: $('.viewport'), errors: $('.errors'), errorsToggle: $('.errors-toggle'), errorList: $('.error-list'),
    includeErrors: $('.include-errors'), errorCount: $('.error-count'),
    log: $('.log'), working: $('.working'), workingText: $('.working-text'), elapsed: $('.elapsed'),
    message: $('.message'), send: $('.send'), stop: $('.stop'), repick: $('.repick'), newchat: $('.newchat'),
    copy: $('.copy'), chatsBtn: $('.chats-btn'), chatsView: $('.chats-view'), chatsList: $('.chats-list'), chatsBack: $('.chats-back'),
  };

  let picking = false;
  let hovered = null;
  let trail = []; // children we moved up from with ↑, so ↓ can go back
  let pending = []; // elements added with Shift+click while picking
  let selected = [];
  let contextSent = false; // element details already sent in the current chat
  let running = false;
  let port = null;
  let runSessionKey = null;
  let runUsedSession = false;
  let rafPending = false;
  const history = []; // chat entries, kept so the panel survives a reload
  let chatId = null; // id of the current chat in the past-chats list
  let runBefore = null; // screenshots taken before an edit run, for before/after
  const entryEls = new Map(); // history index -> rendered element

  const origin = location.origin;
  const folderKey = `folder:${origin}`;
  const chatsKey = `chats:${origin}`;
  const MAX_CHATS = 20;
  const sessionKey = () => `session:${ui.agent.value}:${ui.folder.value.trim()}`;

  chrome.storage.local.get([folderKey, 'agent', 'mode', 'panelPos']).then((saved) => {
    if (saved[folderKey]) ui.folder.value = saved[folderKey];
    else detectFolder();
    if (saved.agent in AGENTS) ui.agent.value = saved.agent;
    if (saved.mode) ui.mode.value = saved.mode;
    if (saved.panelPos) placePanel(saved.panelPos.left, saved.panelPos.top);
  });
  ui.agent.addEventListener('change', () => chrome.storage.local.set({ agent: ui.agent.value }));
  ui.folder.addEventListener('change', () => {
    ui.folderNote.textContent = '';
    setFolder(ui.folder.value.trim());
  });
  ui.browse.addEventListener('click', () => {
    ui.browse.disabled = true;
    ui.folderNote.textContent = 'Choose the folder in the window that opened…';
    connect().postMessage({ type: 'chooseFolder' });
  });

  function setFolder(dir) {
    ui.folder.value = dir;
    if (dir) chrome.storage.local.set({ [folderKey]: dir });
    else chrome.storage.local.remove(folderKey);
  }

  // The helper can tell which folder a localhost dev server is serving.
  function detectFolder() {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname)) return;
    ui.folderNote.textContent = 'Detecting the project folder…';
    connect().postMessage({ type: 'detectProject', url: location.href });
  }
  ui.mode.addEventListener('change', () => chrome.storage.local.set({ mode: ui.mode.value }));
  ui.errorsToggle.addEventListener('click', () => {
    const open = ui.errorList.hidden;
    ui.errorList.hidden = !open;
    ui.errorsToggle.setAttribute('aria-expanded', String(open));
  });
  ui.includeErrors.addEventListener('change', () => ui.errors.classList.toggle('excluded', !ui.includeErrors.checked));

  // ---- picking -------------------------------------------------------------

  function mount() {
    if (hostEl.isConnected) return;
    document.documentElement.appendChild(hostEl);
    chrome.runtime.sendMessage({ type: 'installErrorCapture' }).catch(() => {});
    updateViewport();
  }

  function start() {
    mount();
    picking = true;
    hovered = null;
    trail = [];
    pending = [];
    root.activeElement?.blur();
    updateHint();
    hint.style.display = 'block';
    drawSelection();
  }

  function stopPicking() {
    picking = false;
    hovered = null;
    pending = [];
    hint.style.display = 'none';
    label.style.display = 'none';
    hoverBox.style.display = 'none';
  }

  function teardown() {
    stopPicking();
    if (running) port?.postMessage({ type: 'cancel' });
    selected = [];
    panel.style.display = 'none';
    drawSelection();
    hostEl.remove();
  }

  function updateHint() {
    hint.textContent = pending.length
      ? `${pending.length} selected · Shift+click to add more · click or Enter to finish`
      : 'Click to select · ↑/↓ parent or child · Shift+click for several · Esc to cancel';
  }

  function isOwn(el) {
    return el === hostEl;
  }

  function place(box, el) {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    return r;
  }

  function drawHover() {
    if (!hovered) return;
    hoverBox.style.display = 'block';
    const r = place(hoverBox, hovered);
    label.textContent = `${shortName(hovered)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    label.style.display = 'block';
    label.style.left = `${Math.max(0, r.left)}px`;
    label.style.top = `${r.top > 24 ? r.top - 22 : r.bottom + 4}px`;
  }

  // Green boxes for the selection (or the Shift+click selection in progress).
  function drawSelection() {
    const list = picking ? pending : selected;
    while (selLayer.children.length > list.length) selLayer.lastChild.remove();
    while (selLayer.children.length < list.length) {
      const box = document.createElement('div');
      box.className = 'box';
      box.append(document.createElement('span'));
      selLayer.append(box);
    }
    list.forEach((el, i) => {
      const box = selLayer.children[i];
      place(box, el);
      box.firstChild.textContent = list.length > 1 ? String(i + 1) : '';
      box.firstChild.style.display = list.length > 1 ? '' : 'none';
    });
  }

  function shortName(el) {
    let name = el.localName;
    if (el.id) name += `#${el.id}`;
    const classes = [...el.classList].slice(0, 2);
    if (classes.length) name += `.${classes.join('.')}`;
    return name;
  }

  function onMove(e) {
    if (!picking || isOwn(e.target) || e.target === hovered) return;
    hovered = e.target;
    trail = [];
    drawHover();
  }

  function swallow(e) {
    if (!picking || isOwn(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    if (!picking || isOwn(e.target)) return;
    swallow(e);
    // Use the element chosen with the arrow keys if the pointer is still over it.
    const el = hovered && hovered.contains(e.target) ? hovered : e.target;
    if (e.shiftKey) {
      togglePending(el);
    } else {
      finish(pending.includes(el) ? pending : [...pending, el].slice(-MAX_ELEMENTS));
    }
  }

  function togglePending(el) {
    const i = pending.indexOf(el);
    if (i >= 0) pending.splice(i, 1);
    else if (pending.length < MAX_ELEMENTS) pending.push(el);
    updateHint();
    drawSelection();
  }

  function typingInPanel() {
    const active = root.activeElement;
    return active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      if (picking && selected.length) {
        stopPicking();
        drawSelection();
      } else if (picking || panel.style.display !== 'none') {
        teardown();
      }
      return;
    }
    if (!picking || typingInPanel()) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!hovered) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const next = e.key === 'ArrowUp' ? parentOf(hovered) : childOf(hovered);
      if (next) {
        if (e.key === 'ArrowUp') trail.push(hovered);
        hovered = next;
        drawHover();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (hovered) finish(pending.includes(hovered) ? pending : [...pending, hovered].slice(-MAX_ELEMENTS));
      else if (pending.length) finish(pending);
    }
  }

  function parentOf(el) {
    const p = el.parentElement;
    return p && p !== document.documentElement ? p : null;
  }

  function childOf(el) {
    if (trail.length && el.contains(trail[trail.length - 1])) return trail.pop();
    return el.firstElementChild;
  }

  function onViewportChange() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      drawSelection();
      if (picking) drawHover();
      updateViewport();
    });
  }

  document.addEventListener('mousemove', onMove, true);
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) document.addEventListener(type, swallow, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
  window.addEventListener('resize', onViewportChange, { passive: true });

  // Keep typing in the panel from triggering the page's keyboard shortcuts.
  // (Our own keys are handled earlier, in the capture listener above.)
  for (const type of ['keydown', 'keyup', 'keypress']) {
    panel.addEventListener(type, (e) => {
      if (e.key === 'Escape') return;
      e.stopPropagation();
    });
  }

  function finish(list) {
    stopPicking();
    selected = list.filter((el) => el.isConnected);
    trail = [];
    contextSent = false;
    drawSelection();
    showSelection();
    panel.style.display = 'flex';
    refreshErrors();
    (ui.folder.value ? ui.message : ui.folder).focus();
  }

  function showSelection() {
    const many = selected.length > 1;
    ui.title.textContent = many ? 'Fix these elements' : 'Fix this element';
    ui.target.textContent = many ? `${selected.length} elements` : selected[0] ? shortName(selected[0]) : 'Click “Pick another” to select';
    ui.target.title = selected.map(cssSelector).join('\n');
    ui.parent.disabled = selected.length !== 1 || !parentOf(selected[0]);
    ui.child.disabled = selected.length !== 1 || !selected[0].firstElementChild;
  }

  function moveSelection(next, goingUp) {
    if (!next) return;
    if (goingUp) trail.push(selected[0]);
    selected = [next];
    contextSent = false;
    drawSelection();
    showSelection();
  }

  ui.parent.addEventListener('click', () => moveSelection(parentOf(selected[0]), true));
  ui.child.addEventListener('click', () => moveSelection(childOf(selected[0]), false));

  // ---- panel: drag, collapse, setup ---------------------------------------

  function placePanel(left, top) {
    const w = panel.offsetWidth || 420;
    const x = Math.min(Math.max(8, left), Math.max(8, innerWidth - w - 8));
    const y = Math.min(Math.max(8, top), Math.max(8, innerHeight - 48));
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto', maxHeight: `${Math.max(120, innerHeight - y - 8)}px` });
    return { left: x, top: y };
  }

  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    header.setPointerCapture(e.pointerId);
    header.classList.add('dragging');
    const move = (ev) => placePanel(ev.clientX - dx, ev.clientY - dy);
    const up = (ev) => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
      header.classList.remove('dragging');
      const pos = placePanel(ev.clientX - dx, ev.clientY - dy);
      chrome.storage.local.set({ panelPos: { left: pos.left, top: pos.top } });
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
  });

  header.addEventListener('dblclick', (e) => {
    if (!e.target.closest('button')) toggleCollapsed();
  });
  ui.collapse.addEventListener('click', toggleCollapsed);

  function toggleCollapsed() {
    const collapsed = panel.classList.toggle('collapsed');
    ui.collapse.textContent = collapsed ? '▢' : '–';
    ui.collapse.setAttribute('aria-expanded', String(!collapsed));
    ui.collapse.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    ui.collapse.title = collapsed ? 'Expand' : 'Collapse';
  }

  ui.setup.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openSetup' }));

  // ---- page context ----------------------------------------------------------

  function pageInfo() {
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, touch: matchMedia('(pointer: coarse)').matches };
  }

  function updateViewport() {
    const w = innerWidth;
    const kind = w < 768 ? 'phone' : w < 1024 ? 'tablet' : 'desktop';
    ui.viewport.textContent = `Viewing at ${w}×${innerHeight} · ${kind}`;
    ui.viewport.title = kind === 'phone'
      ? 'The agent will scope layout changes to small screens.'
      : 'To fix the phone layout, open the DevTools device toolbar (⌘⇧M / Ctrl+Shift+M) before picking.';
  }

  async function readErrors() {
    return (await chrome.runtime.sendMessage({ type: 'readPageErrors' }).catch(() => null)) || [];
  }

  // Split a captured error into a short kind label and its text.
  function errorKind(text) {
    const kinds = [
      ['console.error: ', 'console'],
      ['Unhandled promise rejection: ', 'promise'],
      ['Failed to load ', 'load', true],
    ];
    for (const [prefix, kind, keep] of kinds) {
      if (text.startsWith(prefix)) return { kind, text: keep ? text : text.slice(prefix.length) };
    }
    const http = text.match(/^HTTP (\d+) for /);
    if (http) return { kind: `HTTP ${http[1]}`, text: text.slice(http[0].length) };
    return { kind: 'uncaught', text };
  }

  async function refreshErrors() {
    const errors = await readErrors();
    ui.errors.hidden = errors.length === 0;
    ui.errorCount.textContent = `${errors.length} page error${errors.length === 1 ? '' : 's'}`;
    ui.errorList.replaceChildren(...errors.slice().reverse().map((raw) => {
      const { kind, text } = errorKind(raw);
      const [first, ...rest] = text.split('\n');
      const item = document.createElement('li');
      const details = document.createElement('details');
      details.className = 'error-item';
      const summary = document.createElement('summary');
      const badge = document.createElement('span');
      badge.className = 'kind';
      badge.textContent = kind;
      const line = document.createElement('span');
      line.className = 'first';
      line.textContent = first;
      summary.append(badge, line);
      details.append(summary);
      if (rest.length) {
        const pre = document.createElement('pre');
        pre.textContent = rest.join('\n');
        details.append(pre);
      }
      item.append(details);
      return item;
    }));
  }

  let errorRefreshTimer = 0;
  window.addEventListener('pointfix-error', () => {
    if (panel.style.display !== 'flex') return;
    clearTimeout(errorRefreshTimer);
    errorRefreshTimer = setTimeout(refreshErrors, 250);
  });

  // ---- element description -------------------------------------------------

  function cssSelector(el) {
    const unique = (sel) => {
      try {
        return document.querySelectorAll(sel).length === 1;
      } catch {
        return false;
      }
    };
    if (el.id && unique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      if (node !== el && node.id && unique(`#${CSS.escape(node.id)}`)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.localName + [...node.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.localName === node.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      if (unique(parts.join(' > '))) break;
    }
    return parts.join(' > ');
  }

  async function describeElement(el) {
    const r = el.getBoundingClientRect();
    const computed = getComputedStyle(el);
    const styles = {};
    for (const prop of STYLE_PROPS) styles[prop] = computed.getPropertyValue(prop);
    const html = el.outerHTML;
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ');

    el.setAttribute('data-pointfix-target', '');
    let hints = null;
    try {
      hints = await chrome.runtime.sendMessage({ type: 'sourceHints' });
    } finally {
      el.removeAttribute('data-pointfix-target');
    }

    return {
      selector: cssSelector(el),
      html: html.length > 4000 ? `${html.slice(0, 4000)}\n<!-- …truncated -->` : html,
      text: text.length > 300 ? `${text.slice(0, 300)}…` : text,
      styles,
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) },
      hints,
    };
  }

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function inViewport(r) {
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  // One screenshot per scroll position covers every element visible there.
  // Chrome allows about two captures per second, so pause between them.
  async function captureScreenshots(elements) {
    const shots = new Array(elements.length).fill(null);
    const todo = new Set(elements.map((_, i) => i));
    hostEl.style.visibility = 'hidden';
    try {
      let first = true;
      while (todo.size) {
        const i = todo.values().next().value;
        elements[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (!first) await wait(550);
        first = false;
        await nextFrame();
        const batch = [...todo].map((j) => [j, elements[j].getBoundingClientRect()]).filter(([, r]) => inViewport(r));
        if (!batch.length) batch.push([i, elements[i].getBoundingClientRect()]);
        const res = await chrome.runtime.sendMessage({
          type: 'capture',
          rects: batch.map(([, r]) => ({ left: r.left, top: r.top, width: r.width, height: r.height })),
          dpr: devicePixelRatio,
        });
        batch.forEach(([j], k) => {
          shots[j] = res?.images?.[k] ?? null;
          todo.delete(j);
        });
      }
    } finally {
      hostEl.style.visibility = '';
      drawSelection();
    }
    return shots; // aligned with `elements`; null where a capture failed
  }

  // ---- chat ----------------------------------------------------------------

  function addLog(kind, text, data) {
    const entry = { kind, text, data };
    history.push(entry);
    renderEntry(entry, history.length - 1);
  }

  function renderEntry(entry, index) {
    const div = document.createElement('div');
    div.className = `msg ${entry.kind}`;
    if (entry.kind === 'agent') div.append(renderMarkdown(entry.text));
    else if (entry.kind === 'changes') renderChanges(div, entry, index);
    else if (entry.kind === 'compare') renderCompare(div, entry);
    else div.textContent = entry.text;
    if (entry.kind === 'error' && entry.data?.setup) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = 'Open setup page';
      btn.style.marginTop = '6px';
      btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openSetup' }));
      div.append(document.createElement('br'), btn);
    }
    entryEls.set(index, div);
    ui.log.appendChild(div);
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function renderChanges(div, entry, index) {
    const { files, diff, undone } = entry.data;
    div.replaceChildren();
    const head = document.createElement('div');
    head.className = 'changes-head';
    const title = document.createElement('span');
    title.textContent = undone ? `Undone: ${files.length} file${files.length === 1 ? '' : 's'} restored` : `Changed ${files.length} file${files.length === 1 ? '' : 's'}`;
    head.append(title);
    if (!undone) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small undo';
      btn.textContent = 'Undo';
      btn.addEventListener('click', () => undoChange(index, btn));
      head.append(btn);
    }
    const list = document.createElement('ul');
    for (const f of files) {
      const li = document.createElement('li');
      li.textContent = `${f.path} (${FILE_STATUS[f.status[0]] || f.status})`;
      list.append(li);
    }
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Show diff';
    const pre = document.createElement('pre');
    pre.className = 'diff';
    for (const line of diff.split('\n')) {
      const span = document.createElement('span');
      if (line.startsWith('+') && !line.startsWith('+++')) span.className = 'add';
      else if (line.startsWith('-') && !line.startsWith('---')) span.className = 'del';
      else if (line.startsWith('@@')) span.className = 'hunk';
      span.textContent = `${line}\n`;
      pre.append(span);
    }
    details.append(summary, pre);
    div.append(head, list, details);
  }

  // Before/after screenshots of the selected elements around an edit.
  function renderCompare(div, entry) {
    const title = document.createElement('strong');
    title.textContent = 'Before and after';
    div.append(title);
    if (!entry.data?.pairs) {
      const note = document.createElement('div');
      note.className = 'missing';
      note.textContent = 'Screenshots are only kept for the latest changes.';
      div.append(note);
      return;
    }
    for (const pair of entry.data.pairs) {
      const grid = document.createElement('div');
      grid.className = 'compare-grid';
      for (const [caption, image] of [['Before', pair.before], ['After', pair.after]]) {
        const fig = document.createElement('figure');
        const cap = document.createElement('figcaption');
        cap.textContent = caption;
        fig.append(cap);
        if (image) fig.append(imageCanvas(image));
        else {
          const missing = document.createElement('div');
          missing.className = 'missing';
          missing.textContent = caption === 'After' && pair.found === false ? 'Element not found after the change' : 'No screenshot';
          fig.append(missing);
        }
        grid.append(fig);
      }
      div.append(grid);
    }
  }

  // Draw on a canvas rather than using <img src="data:…">, which a page's
  // Content-Security-Policy may block.
  function imageCanvas(base64) {
    const canvas = document.createElement('canvas');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    createImageBitmap(new Blob([bytes], { type: 'image/png' })).then((bitmap) => {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
    }, () => {});
    return canvas;
  }

  function undoChange(index, btn) {
    if (running) return;
    const { projectDir, before, after } = history[index].data;
    btn.disabled = true;
    btn.textContent = 'Undoing…';
    connect().postMessage({ type: 'undo', undoId: index, projectDir, before, after });
  }

  let workingTimer = null;

  function setRunning(value) {
    running = value;
    clearInterval(workingTimer);
    panel.classList.toggle('running', value);
    ui.working.classList.toggle('on', value);
    ui.send.textContent = value ? 'Working…' : 'Send';
    if (value) {
      const startedAt = Date.now();
      ui.workingText.textContent = `${AGENTS[ui.agent.value]} is working…`;
      ui.elapsed.textContent = '';
      workingTimer = setInterval(() => {
        ui.elapsed.textContent = `${Math.round((Date.now() - startedAt) / 1000)}s`;
      }, 1000);
    }
    ui.send.disabled = value;
    ui.stop.hidden = !value;
    ui.agent.disabled = value;
    ui.folder.disabled = value;
    ui.browse.disabled = value;
  }

  function connect() {
    if (port) return port;
    port = chrome.runtime.connect({ name: 'agent' });
    port.onMessage.addListener(onAgentMessage);
    port.onDisconnect.addListener(() => {
      port = null;
      if (running) {
        setRunning(false);
        addLog('error', 'Lost connection to the extension. Try sending again.');
      }
    });
    return port;
  }

  function onAgentMessage(msg) {
    switch (msg.type) {
      case 'session':
        chrome.storage.local.set({ [runSessionKey]: msg.sessionId });
        break;
      case 'text':
        addLog('agent', msg.text);
        break;
      case 'tool':
        addLog('tool', `▸ ${msg.text}`);
        break;
      case 'project':
        if (msg.projectDir && !ui.folder.value.trim()) {
          setFolder(msg.projectDir);
          ui.folderNote.textContent = `Detected from the dev server on port ${msg.port}.`;
        } else if (!ui.folder.value.trim()) {
          ui.folderNote.textContent = 'Couldn’t detect the folder. Click Browse… to choose it.';
        } else {
          ui.folderNote.textContent = '';
        }
        break;
      case 'folderChosen':
        ui.browse.disabled = running;
        ui.folderNote.textContent = '';
        if (msg.projectDir) {
          setFolder(msg.projectDir);
          ui.message.focus();
        }
        break;
      case 'changes':
        addLog('changes', '', { projectDir: msg.projectDir, before: msg.before, after: msg.after, files: msg.files, diff: msg.diff });
        break;
      case 'done':
        setRunning(false);
        if (msg.isError) {
          addLog('error', msg.message || 'The agent reported an error.');
          if (runUsedSession) chrome.storage.local.remove(runSessionKey);
        } else {
          contextSent = true;
          if (msg.edited && ui.mode.value === 'edit') {
            addLog('done', 'Done. Reloading the page to show the changes…');
            saveChat().finally(() => reloadKeepingChat(runBefore));
            break;
          }
          addLog('done', 'Done');
        }
        saveChat();
        break;
      case 'undone': {
        const entry = history[msg.undoId];
        if (msg.ok && entry) {
          entry.data.undone = true;
          renderChanges(entryEls.get(msg.undoId), entry, msg.undoId);
          addLog('done', 'Undid the change. Reloading the page…');
          saveChat().finally(() => reloadKeepingChat());
        } else {
          if (entry) renderChanges(entryEls.get(msg.undoId), entry, msg.undoId);
          addLog('error', msg.message || 'Undo failed.');
        }
        break;
      }
      case 'error':
        setRunning(false);
        if (runUsedSession) chrome.storage.local.remove(runSessionKey);
        ui.browse.disabled = false;
        if (ui.folderNote.textContent.endsWith('…')) ui.folderNote.textContent = '';
        if (msg.code === 'host') addLog('error', helperHelp(msg.message), { setup: true });
        else addLog('error', msg.message);
        saveChat();
        break;
    }
  }

  function reloadKeepingChat(compare = null) {
    chrome.runtime.sendMessage({
      type: 'reloadAfterEdit',
      state: {
        origin,
        history: compactHistory(2),
        selectors: selected.filter((el) => el.isConnected).map(cssSelector),
        contextSent,
        chatId,
        compare,
        collapsed: panel.classList.contains('collapsed'),
      },
    });
  }

  // History without bulky data: screenshots kept only for the newest
  // `keepImages` comparisons, and long diffs shortened.
  function compactHistory(keepImages, maxDiff = Infinity) {
    let images = 0;
    return history
      .slice()
      .reverse()
      .map((entry) => {
        if (entry.kind === 'compare') return images++ < keepImages ? entry : { ...entry, data: {} };
        if (entry.kind === 'changes' && entry.data.diff.length > maxDiff) {
          return { ...entry, data: { ...entry.data, diff: `${entry.data.diff.slice(0, maxDiff)}\n…(shortened)` } };
        }
        return entry;
      })
      .reverse();
  }

  async function captureAfter(compare) {
    await document.fonts?.ready;
    await wait(300);
    const els = compare.selectors.map((sel) => {
      try {
        return document.querySelector(sel);
      } catch {
        return null;
      }
    });
    const found = els.filter(Boolean);
    const shots = found.length ? await captureScreenshots(found).catch(() => []) : [];
    const pairs = compare.images.map((before, i) => ({
      before,
      after: els[i] ? shots[found.indexOf(els[i])] ?? null : null,
      found: Boolean(els[i]),
    }));
    if (pairs.some((p) => p.before || p.after)) {
      addLog('compare', '', { pairs });
      saveChat();
    }
  }

  function restore(state) {
    mount();
    state.history.forEach((entry) => addLog(entry.kind, entry.text, entry.data));
    const els = (state.selectors || []).map((sel) => {
      try {
        return document.querySelector(sel);
      } catch {
        return null; // Selector no longer valid on the reloaded page.
      }
    });
    finish(els.filter(Boolean));
    contextSent = state.contextSent && selected.length === els.length;
    chatId = state.chatId || null;
    if (state.collapsed) toggleCollapsed();
    if (state.compare?.images?.length) captureAfter(state.compare);
    // The log was filled while the panel was hidden, so scroll once it is visible.
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function helperHelp(chromeMessage) {
    return [
      `Couldn't reach the local helper (${chromeMessage}).`,
      'Install it once by running this in a terminal, then send again:',
      '',
      `npx ${HELPER_PACKAGE} install --extension-id ${chrome.runtime.id}`,
    ].join('\n');
  }

  async function send() {
    const message = ui.message.value.trim();
    const projectDir = ui.folder.value.trim();
    if (running || !message) return;
    if (!projectDir) {
      addLog('error', 'Enter the project folder that contains this site’s code.');
      ui.folder.focus();
      return;
    }
    setFolder(projectDir);

    setRunning(true);
    addLog('you', message);
    ui.message.value = '';
    try {
      runSessionKey = sessionKey();
      const sessionId = (await chrome.storage.local.get(runSessionKey))[runSessionKey] || null;
      runUsedSession = Boolean(sessionId);
      let elements = null;
      let screenshots = [];
      if (selected.length && (!contextSent || !sessionId)) {
        if (selected.some((el) => !el.isConnected)) throw new Error('A selected element is no longer on the page. Click “Pick another”.');
        elements = [];
        for (const el of selected) elements.push(await describeElement(el));
        screenshots = await captureScreenshots(selected).catch(() => []);
      } else if (selected.length && ui.mode.value === 'edit' && selected.every((el) => el.isConnected)) {
        screenshots = await captureScreenshots(selected).catch(() => []); // only for before/after
      }
      runBefore = ui.mode.value === 'edit' && screenshots.some(Boolean)
        ? { selectors: selected.map(cssSelector), images: screenshots }
        : null;
      const errors = ui.includeErrors.checked ? await readErrors() : [];
      connect().postMessage({
        type: 'run',
        agent: ui.agent.value,
        mode: ui.mode.value,
        projectDir,
        message,
        elements,
        screenshots: elements ? screenshots.filter(Boolean) : [],
        page: pageInfo(),
        errors,
        sessionId,
        pageUrl: location.href,
      });
    } catch (err) {
      setRunning(false);
      addLog('error', err.message);
    }
  }

  ui.send.addEventListener('click', send);
  ui.message.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  });
  ui.stop.addEventListener('click', () => port?.postMessage({ type: 'cancel' }));
  ui.repick.addEventListener('click', start);
  ui.newchat.addEventListener('click', () => {
    if (running) return;
    chrome.storage.local.remove(sessionKey());
    chatId = null;
    contextSent = false;
    clearLog();
    ui.message.focus();
  });

  function clearLog() {
    ui.log.replaceChildren();
    history.length = 0;
    entryEls.clear();
  }

  // ---- quick actions and copy ---------------------------------------------

  for (const chip of root.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      ui.message.value = chip.dataset.prompt;
      ui.message.focus();
      ui.message.setSelectionRange(ui.message.value.length, ui.message.value.length);
    });
  }

  ui.copy.addEventListener('click', async () => {
    const elements = [];
    for (const el of selected.filter((e) => e.isConnected)) elements.push(await describeElement(el));
    const text = await chrome.runtime.sendMessage({
      type: 'buildPrompt',
      payload: {
        message: ui.message.value.trim() || '(describe the change you want)',
        elements,
        page: pageInfo(),
        errors: ui.includeErrors.checked ? await readErrors() : [],
        pageUrl: location.href,
        mode: ui.mode.value,
      },
    });
    const ok = await copyText(text);
    ui.copy.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => (ui.copy.textContent = 'Copy prompt'), 2000);
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API unavailable (e.g. plain http pages): fall back to a hidden textarea.
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position: fixed; opacity: 0;';
      root.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }

  // ---- past chats -------------------------------------------------------------

  async function loadChats() {
    return (await chrome.storage.local.get(chatsKey))[chatsKey] || [];
  }

  async function saveChat() {
    const first = history.find((e) => e.kind === 'you');
    if (!first) return;
    chatId = chatId || crypto.randomUUID();
    const sessionId = (await chrome.storage.local.get(sessionKey()))[sessionKey()] || null;
    const chat = {
      id: chatId,
      title: first.text.slice(0, 80),
      agent: ui.agent.value,
      projectDir: ui.folder.value.trim(),
      sessionId,
      updatedAt: Date.now(),
      history: compactHistory(0, 20_000),
    };
    const chats = (await loadChats()).filter((c) => c.id !== chatId);
    chats.unshift(chat);
    await chrome.storage.local.set({ [chatsKey]: chats.slice(0, MAX_CHATS) });
  }

  function timeAgo(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }

  function showChats(show) {
    panel.classList.toggle('show-chats', show);
    ui.chatsView.hidden = !show;
    ui.chatsBtn.setAttribute('aria-pressed', String(show));
    if (show) renderChats();
  }

  async function renderChats() {
    const chats = await loadChats();
    ui.chatsList.replaceChildren();
    if (!chats.length) {
      const empty = document.createElement('li');
      empty.className = 'chats-empty';
      empty.textContent = 'No past chats on this site yet.';
      ui.chatsList.append(empty);
    }
    for (const chat of chats) {
      const li = document.createElement('li');
      li.className = 'chat-item';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'chat-open';
      const title = document.createElement('span');
      title.textContent = chat.title;
      const meta = document.createElement('span');
      meta.className = 'chat-meta';
      meta.textContent = `${AGENTS[chat.agent] || chat.agent} · ${timeAgo(chat.updatedAt)}${chat.id === chatId ? ' · current' : ''}`;
      open.append(title, meta);
      open.addEventListener('click', () => openChat(chat));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon';
      del.textContent = '×';
      del.setAttribute('aria-label', `Delete chat: ${chat.title}`);
      del.title = 'Delete chat';
      del.addEventListener('click', async () => {
        await chrome.storage.local.set({ [chatsKey]: (await loadChats()).filter((c) => c.id !== chat.id) });
        if (chat.id === chatId) chatId = null;
        renderChats();
      });
      li.append(open, del);
      ui.chatsList.append(li);
    }
  }

  async function openChat(chat) {
    if (running) return;
    if (chat.agent in AGENTS) {
      ui.agent.value = chat.agent;
      chrome.storage.local.set({ agent: chat.agent });
    }
    if (chat.projectDir) setFolder(chat.projectDir);
    // Follow-up messages continue the agent's own conversation.
    if (chat.sessionId) await chrome.storage.local.set({ [sessionKey()]: chat.sessionId });
    else await chrome.storage.local.remove(sessionKey());
    chatId = chat.id;
    contextSent = false;
    clearLog();
    chat.history.forEach((entry) => addLog(entry.kind, entry.text, entry.data));
    showChats(false);
    ui.log.scrollTop = ui.log.scrollHeight;
    ui.message.focus();
  }

  ui.chatsBtn.addEventListener('click', () => showChats(!panel.classList.contains('show-chats')));
  ui.chatsBack.addEventListener('click', () => showChats(false));
  ui.close.addEventListener('click', teardown);

  window.__pointfix = { start };
  chrome.runtime.sendMessage({ type: 'takeRestoreState' }).then(
    (state) => (state?.origin === origin ? restore(state) : start()),
    () => start()
  );
})();
