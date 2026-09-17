const FLOAT_ENABLED_KEY = 'onspotFloatEnabled';

function transferButtonHere() {
  chrome.runtime.sendMessage({ type: 'onspot:transferFloatHere' }, () => {
    void chrome.runtime.lastError;
    window.close();
  });
}

document.getElementById('open-window').addEventListener('click', transferButtonHere);

document.getElementById('open-doc').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('documentation.html'),
    type: 'popup',
    width: 500,
    height: 680,
  });
  window.close();
});

const toggle = document.getElementById('float-toggle');
const status = document.getElementById('toggle-status');

function applyStatus(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? 'Activé' : 'Désactivé';
}

chrome.storage.local.get([FLOAT_ENABLED_KEY], res => {
  const enabled = res[FLOAT_ENABLED_KEY] !== false;
  applyStatus(enabled);
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  applyStatus(enabled);
  chrome.runtime.sendMessage({ type: 'onspot:setFloatEnabled', enabled }, () => {
    void chrome.runtime.lastError;
  });
});
