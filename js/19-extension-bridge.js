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

let taskinExtensionVersion = '';   // version annoncée par l'extension installée
let taskinExtensionLatest = null;  // dernière version publiée (downloads/extension-latest.json)

async function taskinExtensionSync(attempt = 0) {
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
    // Coupure réseau passagère : deux nouvelles tentatives rapprochées.
    if (attempt < 2) setTimeout(() => taskinExtensionSync(attempt + 1), attempt ? 4000 : 1200);
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
  if (data.version) taskinExtensionVersion = String(data.version);
  taskinExtensionSync();
  taskinExtensionBanner();
});

// Retour sur l'onglet : si l'extension n'a pas la même session que la web app, nouvelle synchro.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser && taskinExtensionUserId !== currentUser.id) taskinExtensionPost('hello');
});

// ---------- Version publiée, bandeau et installation guidée ----------
function taskinVersionNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
async function taskinLoadExtensionLatest() {
  if (taskinExtensionLatest) return taskinExtensionLatest;
  try { const r = await fetch(`downloads/extension-latest.json?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) taskinExtensionLatest = await r.json(); } catch (_) {}
  return taskinExtensionLatest;
}
function taskinExtensionStatus() {
  const latest = taskinExtensionLatest?.version || '';
  if (taskinExtensionUserId === undefined) return { state: 'missing', latest };
  if (latest && taskinExtensionVersion && taskinVersionNewer(latest, taskinExtensionVersion)) return { state: 'outdated', latest, current: taskinExtensionVersion };
  return { state: 'ok', latest, current: taskinExtensionVersion };
}
async function taskinExtensionBanner() {
  await taskinLoadExtensionLatest();
  let bar = document.getElementById('taskin-ext-banner');
  const st = taskinExtensionStatus();
  // Bandeau : mise à jour pour tous ; extension absente seulement pour un agent (après 4 s, le temps de la détection).
  const dismissed = (() => { try { return sessionStorage.getItem('taskin_ext_banner_dismissed') === st.state + st.latest; } catch (_) { return false; } })();
  const show = currentUser && !dismissed && (st.state === 'outdated' || (st.state === 'missing' && currentUser.role === 'agent' && Date.now() - (window.__taskinEnteredAt || 0) > 4000));
  if (!show) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'taskin-ext-banner'; bar.className = 'ext-banner';
    const topbar = document.querySelector('#app .topbar');
    if (topbar) topbar.after(bar); else document.getElementById('app')?.prepend(bar);
  }
  bar.innerHTML = st.state === 'outdated'
    ? `<span>🧩 <b>Nouvelle version de l’extension : ${escHtml(st.latest)}</b> (tu as la ${escHtml(st.current)}). ${escHtml((taskinExtensionLatest?.notes || [])[0] || '')}</span><button type="button" class="btn btn-primary" onclick="taskinOpenExtensionInstaller()">Mettre à jour</button><button type="button" class="ext-banner-x" aria-label="Masquer" onclick="taskinDismissExtensionBanner()">×</button>`
    : `<span>🧩 <b>Extension Task’in non détectée</b> sur ce navigateur : le timer flottant et le dispatch rapide ne sont pas disponibles.</span><button type="button" class="btn btn-primary" onclick="taskinOpenExtensionInstaller()">Installer l’extension</button><button type="button" class="ext-banner-x" aria-label="Masquer" onclick="taskinDismissExtensionBanner()">×</button>`;
}
function taskinDismissExtensionBanner() {
  const st = taskinExtensionStatus();
  try { sessionStorage.setItem('taskin_ext_banner_dismissed', st.state + st.latest); } catch (_) {}
  document.getElementById('taskin-ext-banner')?.remove();
}

async function taskinOpenExtensionInstaller() {
  const latest = await taskinLoadExtensionLatest();
  let overlay = document.getElementById('ext-install-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ext-install-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.body.appendChild(overlay);
  }
  const zip = latest?.zip || document.querySelector('.extension-download-topbar')?.getAttribute('href') || 'downloads/';
  const paint = () => {
    const st = taskinExtensionStatus();
    const status = st.state === 'ok' ? `<span class="ext-status ok">✓ Extension détectée${st.current ? ` · v${escHtml(st.current)}` : ''} · à jour</span>`
      : st.state === 'outdated' ? `<span class="ext-status warn">Extension v${escHtml(st.current)} détectée · mise à jour ${escHtml(st.latest)} à faire</span>`
      : '<span class="ext-status">Extension pas encore détectée sur ce navigateur</span>';
    overlay.innerHTML = `<div class="modal ext-install" role="dialog" aria-modal="true" aria-labelledby="ext-install-title">
      <div class="modal-header"><div class="modal-title" id="ext-install-title">${st.state === 'outdated' ? 'Mettre à jour' : 'Installer'} l’extension Task’in ${latest?.version ? `<small>v${escHtml(latest.version)}</small>` : ''}</div><button class="modal-close" type="button" onclick="document.getElementById('ext-install-overlay').classList.add('hidden')" aria-label="Fermer">×</button></div>
      <div class="modal-body">
        <div class="ext-install-status">${status}</div>
        ${latest?.notes?.length ? `<ul class="ext-install-notes">${latest.notes.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>` : ''}
        <ol class="ext-install-steps">
          <li><b>Télécharge</b> l’extension <a class="btn btn-primary" href="${escHtml(zip)}" download>⬇ Télécharger${latest?.version ? ` v${escHtml(latest.version)}` : ''}</a></li>
          <li><b>Décompresse</b> le fichier : clic droit sur le .zip › « Extraire tout… ». ${st.state === 'outdated' ? 'Remplace le dossier de l’ancienne version (même emplacement).' : 'Garde le dossier dans « Documents » : il ne faut pas le supprimer.'}</li>
          <li><b>Ouvre la page des extensions</b> de Chrome : colle cette adresse dans la barre d’adresse <span class="ext-copy"><code>chrome://extensions</code><button type="button" class="dr-edit-btn" onclick="navigator.clipboard?.writeText('chrome://extensions').then(()=>{this.textContent='Copié ✓'})">Copier</button></span> puis active le <b>Mode développeur</b> (en haut à droite).</li>
          <li>${st.state === 'outdated' ? 'Sur la carte <b>Task’in</b>, clique sur la flèche <b>↻ Recharger</b>.' : 'Clique sur <b>« Charger l’extension non empaquetée »</b> et choisis le dossier décompressé.'}</li>
          <li>Reviens sur cet onglet : la connexion est reprise automatiquement, cette fenêtre affiche <b>✓ Extension détectée</b>.</li>
        </ol>
        <p class="ext-install-store">Bientôt : installation et mises à jour en un clic depuis le Chrome Web Store, sans manipuler de fichiers.</p>
      </div>
    </div>`;
  };
  paint();
  overlay.classList.remove('hidden');
  // Détection en direct pendant que la fenêtre est ouverte.
  clearInterval(overlay._timer);
  overlay._timer = setInterval(() => { if (overlay.classList.contains('hidden')) { clearInterval(overlay._timer); return; } taskinExtensionPost('hello'); setTimeout(paint, 300); }, 3000);
}
window.taskinOpenExtensionInstaller = taskinOpenExtensionInstaller;

// Lien direct (pop-up de l'extension) : …/#installer-extension
function taskinExtensionDeepLink() {
  if (location.hash !== '#installer-extension') return;
  history.replaceState(null, '', location.pathname + location.search);
  taskinOpenExtensionInstaller();
}
window.addEventListener('hashchange', taskinExtensionDeepLink);
setTimeout(taskinExtensionDeepLink, 0);

// Au cas où le bridge de l'extension s'est chargé avant ce script.
taskinExtensionPost('hello');
