// Setup page: checks the local helper and the agents it can run, and shows
// the one-time install command for this extension's ID.

const HOST_NAME = 'com.pointfix.bridge';
const INSTALL_CMD = `npx pointfix install --extension-id ${chrome.runtime.id}`;

const $ = (id) => document.getElementById(id);
$('install-cmd').textContent = INSTALL_CMD;

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(INSTALL_CMD);
  $('copied').textContent = 'Copied';
  setTimeout(() => ($('copied').textContent = ''), 2000);
});

chrome.commands.getAll().then((commands) => {
  const shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut;
  $('shortcut').textContent = shortcut || 'not set (chrome://extensions/shortcuts)';
});

function setStep(id, ok, text) {
  const step = $(id);
  step.classList.toggle('ok', ok === true);
  step.classList.toggle('bad', ok === false);
  step.querySelector('.icon').textContent = ok === true ? '✓' : ok === false ? '!' : step.dataset.number;
  step.querySelector('.state').textContent = text;
}
for (const id of ['helper-step', 'agent-step']) $(id).dataset.number = $(id).querySelector('.icon').textContent;

function checkHelper() {
  return new Promise((resolve) => {
    let port;
    try {
      port = chrome.runtime.connectNative(HOST_NAME);
    } catch (err) {
      resolve({ error: err.message });
      return;
    }
    const timer = setTimeout(() => {
      port.disconnect();
      resolve({ error: 'The helper did not answer.' });
    }, 30_000);
    port.onMessage.addListener((msg) => {
      if (msg.type !== 'status') return;
      clearTimeout(timer);
      port.disconnect();
      resolve(msg);
    });
    port.onDisconnect.addListener(() => {
      clearTimeout(timer);
      resolve({ error: chrome.runtime.lastError?.message || 'The helper closed unexpectedly.' });
    });
    port.postMessage({ type: 'status' });
  });
}

let pollTimer = null;

async function refresh() {
  clearTimeout(pollTimer);
  setStep('helper-step', null, 'Checking…');
  const result = await checkHelper();

  if (result.error) {
    setStep('helper-step', false, 'Not installed yet');
    setStep('agent-step', null, 'Waiting for the helper…');
    pollTimer = setTimeout(refresh, 4000); // pick up the install as soon as it's done
    return;
  }
  setStep('helper-step', true, `Installed (v${result.version})`);

  const label = { claude: 'Claude Code', codex: 'Codex' };
  const ready = [];
  const notes = [];
  for (const [name, a] of Object.entries(result.agents)) {
    if (a.installed && a.signedIn) ready.push(label[name]);
    else if (a.installed) notes.push(`${label[name]} is installed but not signed in`);
  }
  if (ready.length) setStep('agent-step', true, `Ready: ${ready.join(' and ')}`);
  else setStep('agent-step', false, notes.length ? `${notes.join('; ')}.` : 'None found');
  if (!ready.length) pollTimer = setTimeout(refresh, 6000);
}

$('recheck').addEventListener('click', refresh);
refresh();
