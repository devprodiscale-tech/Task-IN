// ======================= PONT WEB APP → EXTENSION =======================
// La connexion se fait uniquement sur la web app. Si l'extension Task'in est installée,
// son script « bridge » annonce l'utilisateur qu'elle a en session ; si ce n'est pas
// l'utilisateur connecté ici, la web app lui transmet un ticket à usage unique
// (/api/extension-session) qu'elle échange contre sa propre session Supabase.
// La déconnexion de la web app déconnecte aussi l'extension.

const TASKIN_EXT_SOURCE = 'taskin-extension';
const TASKIN_APP_SOURCE = 'taskin-app';
const TASKIN_EXT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let taskinExtensionUserId; // undefined = extension non détectée, null = extension sans session
let taskinExtensionSyncing = false;

function taskinExtensionPost(type, payload = {}) {
  window.postMessage({ source: TASKIN_APP_SOURCE, type, ...payload }, window.location.origin);
}

async function taskinExtensionSync() {
  if (taskinExtensionUserId === undefined || taskinExtensionSyncing) return;
  const supabase = window.taskinDataProviders?.supabase;
  const accessToken = supabase?.enabled() ? supabase.getSession()?.access_token : '';
  if (!accessToken || !currentUser?.id || !TASKIN_EXT_UUID.test(currentUser.id)) return;
  if (taskinExtensionUserId === currentUser.id) return;
  taskinExtensionSyncing = true;
  try {
    const res = await supabase.authFetch('/api/extension-session', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.tokenHash) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.userId !== currentUser?.id) return;
    taskinExtensionPost('session-ticket', { tokenHash: data.tokenHash, userId: data.userId });
  } catch (error) {
    console.error('Synchronisation extension impossible:', error);
  } finally {
    taskinExtensionSyncing = false;
  }
}

function taskinExtensionSignOut() {
  if (taskinExtensionUserId) taskinExtensionPost('signout');
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== TASKIN_EXT_SOURCE) return;
  // Timer lancé / arrêté dans l'extension : relecture immédiate du timer partagé.
  if (data.type === 'timer-changed') { window.syncOwnTimer?.(); return; }
  if (data.type !== 'state') return;
  taskinExtensionUserId = data.userId || null;
  taskinExtensionSync();
});

// Au cas où le bridge de l'extension s'est chargé avant ce script.
taskinExtensionPost('hello');
