// Task'in extension - pont avec la web app.
// Injecté uniquement sur les domaines de la web app (voir manifest.json) : relaie la
// connexion faite sur la web app vers l'extension, et annonce à la page l'utilisateur
// actuellement connecté dans l'extension.
(function () {
  const EXT_SOURCE = 'taskin-extension';
  const APP_SOURCE = 'taskin-app';
  const USER_KEY = 'taskin_supabase_user';

  function announce(userId) {
    window.postMessage({ source: EXT_SOURCE, type: 'state', userId: userId || null }, window.location.origin);
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
    if (data.type === 'signout') {
      chrome.runtime.sendMessage({ type: 'taskin:signOut' }, () => {
        void chrome.runtime.lastError;
        announceFromStorage();
      });
    }
  });

  announceFromStorage();
})();
