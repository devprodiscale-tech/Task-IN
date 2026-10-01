// Task'in extension - pont avec la web app.
// Injecté uniquement sur les domaines de la web app (voir manifest.json) : relaie la
// connexion faite sur la web app vers l'extension, et annonce à la page l'utilisateur
// actuellement connecté dans l'extension.
(function () {
  const EXT_SOURCE = 'taskin-extension';
  const APP_SOURCE = 'taskin-app';
  const USER_KEY = 'taskin_supabase_user';
  const TIMER_PING_KEY = 'taskin_timer_ping';

  // Déjà injecté (au chargement de la page ou par l'extension après installation / mise à jour) : rien à refaire.
  if (window.__taskinBridge) { window.__taskinBridge(); return; }
  const VERSION = chrome.runtime.getManifest().version;

  function announce(userId) {
    window.postMessage({ source: EXT_SOURCE, type: 'state', userId: userId || null, version: VERSION }, window.location.origin);
  }

  function announceFromStorage() {
    chrome.storage.local.get([USER_KEY], result => announce(result[USER_KEY]?.id));
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== APP_SOURCE) return;
    if (data.type === 'hello') announceFromStorage();
    if (data.type === 'session-ticket' && typeof data.tokenHash === 'string') {
      chrome.runtime.sendMessage({ type: 'taskin:sessionTicket', tokenHash: data.tokenHash, userId: data.userId }, () => {
        void chrome.runtime.lastError;
        announceFromStorage();
      });
    }
    // Timer démarré / arrêté dans la web app : l'extension relit le timer partagé.
    if (data.type === 'timer-changed') {
      chrome.storage.local.set({ [TIMER_PING_KEY]: { from: 'app', at: Date.now() } });
    }
    if (data.type === 'signout') {
      chrome.runtime.sendMessage({ type: 'taskin:signOut' }, () => {
        void chrome.runtime.lastError;
        announceFromStorage();
      });
    }
  });

  // Timer démarré / arrêté dans l'extension : la web app relit le timer partagé.
  // Session de l'extension modifiée (connexion, déconnexion) : la web app est prévenue tout de suite.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[TIMER_PING_KEY]?.newValue?.from === 'ext') {
      window.postMessage({ source: EXT_SOURCE, type: 'timer-changed' }, window.location.origin);
    }
    if (changes[USER_KEY]) announce(changes[USER_KEY].newValue?.id);
  });

  window.__taskinBridge = announceFromStorage;
  announceFromStorage();
})();
