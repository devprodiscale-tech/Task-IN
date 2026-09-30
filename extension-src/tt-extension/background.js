importScripts('supabase-client.js');

const FLOAT_ENABLED_KEY = 'onspotFloatEnabled';
const FLOAT_OWNER_TAB_KEY = 'onspotFloatOwnerTabId';
const CONTENT_VERSION = '1.10.4';

// Domaines de la web app autorisés à transmettre la connexion à l'extension.
// À garder aligné avec content_scripts[bridge.js].matches dans manifest.json.
const TASKIN_APP_HOSTS = ['task-in-rho.vercel.app', 'localhost', '127.0.0.1'];

function isTaskinAppSender(sender) {
  if (sender?.id !== chrome.runtime.id || !sender?.url) return false;
  try { return TASKIN_APP_HOSTS.includes(new URL(sender.url).hostname); } catch (_) { return false; }
}

function sendToTab(tabId, message) {
  if (!Number.isInteger(tabId)) return Promise.resolve(null);
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      const unavailable = Boolean(chrome.runtime.lastError);
      resolve(unavailable ? null : (response || { ok: true }));
    });
  });
}

async function ensureContentScript(tabId) {
  if (!Number.isInteger(tabId)) return false;
  const ping = await sendToTab(tabId, { type: 'onspot:ping' });
  if (ping?.version === CONTENT_VERSION) return true;

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (_) {
    return false;
  }
}

async function getActiveTab() {
  const win = await chrome.windows.getLastFocused({ populate: false });
  if (!Number.isInteger(win?.id)) return null;
  const tabs = await chrome.tabs.query({ windowId: win.id, active: true });
  return tabs[0] || null;
}

async function getFloatState() {
  const stored = await chrome.storage.local.get([FLOAT_ENABLED_KEY, FLOAT_OWNER_TAB_KEY]);
  const ownerTabId = Number.isInteger(stored[FLOAT_OWNER_TAB_KEY]) ? stored[FLOAT_OWNER_TAB_KEY] : null;
  return {
    enabled: stored[FLOAT_ENABLED_KEY] !== false,
    ownerTabId,
  };
}

function isWidgetVisibleInTab(tabId, state) {
  return state.enabled && (state.ownerTabId === null || state.ownerTabId === tabId);
}

async function syncWidgetVisibility(tabs = null) {
  const state = await getFloatState();
  const targetTabs = tabs || await chrome.tabs.query({});

  await Promise.all(targetTabs.map(async tab => {
    if (!Number.isInteger(tab?.id)) return;
    const visible = isWidgetVisibleInTab(tab.id, state);
    if (visible) await ensureContentScript(tab.id);
    await sendToTab(tab.id, { type: 'onspot:toggleFloat', enabled: visible });
  }));
}

async function openPanelInActiveTab() {
  const tab = await getActiveTab();
  if (!Number.isInteger(tab?.id)) return false;
  if (!await ensureContentScript(tab.id)) return false;
  await sendToTab(tab.id, { type: 'onspot:openPanel' });
  return true;
}

async function transferFloatToActiveTab() {
  const tab = await getActiveTab();
  if (!Number.isInteger(tab?.id)) return false;

  const enabled = (await getFloatState()).enabled;
  if (!enabled) return false;
  if (!await ensureContentScript(tab.id)) return false;

  await chrome.storage.local.set({ [FLOAT_OWNER_TAB_KEY]: tab.id });
  await syncWidgetVisibility();
  return true;
}

async function setFloatEnabled(enabled, openPanel = false) {
  await chrome.storage.local.set({ [FLOAT_ENABLED_KEY]: enabled });
  if (!enabled) await chrome.storage.local.remove(FLOAT_OWNER_TAB_KEY);
  await syncWidgetVisibility();
  if (enabled && openPanel) await openPanelInActiveTab();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return undefined;

  if (message.type === 'taskin:sessionTicket' || message.type === 'taskin:signOut') {
    if (!isTaskinAppSender(sender)) { sendResponse({ ok: false, error: 'Origine non autorisée.' }); return undefined; }
    const task = message.type === 'taskin:signOut'
      ? supabaseClient.signOut()
      : supabaseClient.signInWithTicket(message.tokenHash).then(session => {
          if (message.userId && session?.user?.id !== message.userId) return supabaseClient.signOut().then(() => { throw new Error('Utilisateur inattendu.'); });
        });
    task
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'onspot:openPanel' || message.type === 'onspot:openLauncherWindow' || message.type === 'onspot:openTrackerWindow' || message.type === 'onspot:openStandalone' || message.type === 'onspot:focusPortable') {
    openPanelInActiveTab()
      .then(opened => sendResponse({ ok: opened }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'onspot:transferFloatHere') {
    transferFloatToActiveTab()
      .then(transferred => sendResponse({ ok: transferred }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'onspot:setFloatEnabled') {
    setFloatEnabled(message.enabled === true, false)
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'onspot:requestFloatState') {
    getFloatState()
      .then(state => sendToTab(sender.tab?.id, {
        type: 'onspot:toggleFloat',
        enabled: isWidgetVisibleInTab(sender.tab?.id, state),
      }))
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return undefined;
});

if (chrome.tabs.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener(async tabId => {
    const state = await getFloatState();
    if (state.ownerTabId !== tabId) return;
    await chrome.storage.local.remove(FLOAT_OWNER_TAB_KEY);
    await syncWidgetVisibility();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void removeOldNativeArtifacts();
});

async function removeOldNativeArtifacts() {
  const keys = ['onspotButtonWindowId', 'onspotTrackerWindowId', 'onspotLauncherWindowId'];
  const stored = await chrome.storage.local.get(keys);
  await Promise.all(keys.map(async key => {
    const windowId = stored[key];
    if (Number.isInteger(windowId)) {
      try { await chrome.windows.remove(windowId); } catch (_) {}
    }
  }));
  await chrome.storage.local.remove(keys);
}
