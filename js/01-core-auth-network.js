// ======================= RÉSEAU FIABILISÉ =======================
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
let networkState = { online: navigator.onLine, lastError: null };

function updateNetworkStatus() {
  const el = document.getElementById('network-status');
  if (!el) return;
  const hasIssue = !networkState.online || !!networkState.lastError;
  el.classList.toggle('hidden', !hasIssue);
  el.classList.toggle('offline', !networkState.online);
  el.textContent = !networkState.online ? 'Hors ligne — reprise en attente' : (networkState.lastError || 'Synchronisation à vérifier');
}

function networkHeaders(headers = {}) {
  const merged = new Headers(headers);
  const token = window.taskinDataProviders?.supabase?.getSession()?.access_token;
  if (token) merged.set('Authorization', `Bearer ${token}`);
  merged.set('Accept', 'application/json');
  return merged;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function apiFetch(url, options = {}, config = {}) {
  const { retries = 2, timeoutMs = 15000, label = 'Requête réseau' } = config;
  const method = String(options.method || 'GET').toUpperCase();
  const maxRetries = method === 'POST' ? 0 : retries;
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, headers: networkHeaders(options.headers), signal: options.signal || controller.signal });
      if (response.ok || !RETRYABLE_HTTP_STATUS.has(response.status) || attempt === maxRetries) {
        networkState.online = true;
        if (!response.ok) networkState.lastError = `${label} (${response.status})`;
        updateNetworkStatus();
        return response;
      }
      lastError = new Error(`${label} (${response.status})`);
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error(`${label} : délai dépassé`) : error;
      networkState.online = false;
      networkState.lastError = lastError.message;
      updateNetworkStatus();
      if (attempt === maxRetries) throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
    await sleep(300 * (attempt + 1));
  }
  throw lastError || new Error(`${label} impossible`);
}

window.addEventListener('online', () => { networkState.online = true; networkState.lastError = null; updateNetworkStatus(); });
window.addEventListener('offline', () => { networkState.online = false; updateNetworkStatus(); });

const ROLE_LABELS = { admin: 'Admin', supervisor: 'Superviseur', formateur: 'Formateur', agent: 'Agent' };
function requireRoles(...allowedRoles) {
  if (currentUser && allowedRoles.includes(currentUser.role)) return true;
  const label = allowedRoles.map(role => ROLE_LABELS[role] || role).join(' ou ');
  console.warn(`Action refusée : rôle requis ${label}`);
  return false;
}
function currentRoleIs(...roles) { return !!currentUser && roles.includes(currentUser.role); }

// ======================= AUTH =======================
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Entre ton email et ton mot de passe.'; return; }
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
    const session = await supabase.signIn(email, password);
    const user = await supabase.getCurrentProfile();
    if (!user) { err.textContent = "Ce compte n'a pas encore de profil Supabase."; supabase.signOut(); return; }
    enterApp(user);
  } catch(e) { err.textContent = 'Erreur de connexion. Réessaie.'; console.error(e); }
}

// ===== PORTAIL DIRECTIONNEL : CONNEXION NATIVE ET SITE DE PRÉSENTATION =====
// La page de présentation est locale au dépôt : elle reste accessible même si
// un domaine externe, un tunnel ou une session Google devient indisponible.
// La propriété window.TASKIN_PRESENTATION_URL permet toujours de la surcharger.
const TASKIN_PRESENTATION_URL = window.TASKIN_PRESENTATION_URL || 'presentation.html?v=20260827d';
let portalPointerStartX = null;
function ensurePortalPresentation() {
  const frame = document.getElementById('portal-site-frame');
  if (frame && !frame.src) frame.src = TASKIN_PRESENTATION_URL;
}
function showPortalPanel(panel) {
  const frame = document.getElementById('portal-frame');
  const slider = document.getElementById('portal-slider');
  if (!frame) return;
  const next = ['login','split','presentation'].includes(panel) ? panel : 'split';
  frame.classList.remove('login-active','split-active','presentation-active');
  frame.classList.add(`${next}-active`);
  frame.dataset.active = next;
  if (next === 'presentation') ensurePortalPresentation();
  if (slider) slider.setAttribute('aria-pressed', String(next === 'presentation'));
}
function togglePortalPanel() {
  const frame = document.getElementById('portal-frame');
  const active = frame?.dataset.active || 'split';
  showPortalPanel(active === 'presentation' ? 'login' : active === 'login' ? 'presentation' : 'presentation');
}
function togglePortalPreviewTheme() {
  const frame = document.getElementById('portal-frame');
  if (frame) frame.classList.toggle('portal-night');
}
function openTaskinPresentation() {
  showPortalPanel('presentation');
  openPortalFullscreen();
}
function openPortalFullscreen() {
  const site = document.getElementById('portal-live-site');
  if (!site) return;
  const request = site.requestFullscreen || site.webkitRequestFullscreen || site.msRequestFullscreen;
  if (request) {
    const result = request.call(site);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }
}
function exitPortalFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) exit.call(document);
}
function initPortalDirectionalGesture() {
  const frame = document.getElementById('portal-frame');
  if (!frame) return;
  frame.addEventListener('pointerdown', event => { portalPointerStartX = event.clientX; });
  frame.addEventListener('pointerup', event => {
    if (portalPointerStartX === null) return;
    const distance = event.clientX - portalPointerStartX;
    portalPointerStartX = null;
    if (Math.abs(distance) < 64) return;
    // Glisser vers la gauche révèle la présentation ; vers la droite révèle la connexion native.
    showPortalPanel(distance < 0 ? 'presentation' : 'login');
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') showPortalPanel('presentation');
    if (event.key === 'ArrowRight') showPortalPanel('login');
    if (event.key === 'Escape') {
      exitPortalFullscreen();
      showPortalPanel('split');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && frame.dataset.active === 'presentation') showPortalPanel('split');
  });
}
initPortalDirectionalGesture();

async function fetchAccountProfile(uid) {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled() || !uid) return null;
  return supabase.getCurrentProfile();
}

function enterApp(user) {
  currentUser = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  applyUserTheme();
  renderTopbarIdentity();
  // Point 2 : populateFilters et applyRoleUI appelés après que refreshApp sera terminé
  applyRoleUI();
  checkActiveTimer();
  refreshApp();
}

function renderTopbarIdentity() {
  const av = document.getElementById('topbar-avatar');
  if (currentUser.photo) {
    av.style.backgroundImage = `url(${currentUser.photo})`; av.style.backgroundSize = 'cover';
    av.style.backgroundPosition = 'center'; av.textContent = '';
  } else {
    av.style.backgroundImage = ''; av.textContent = currentUser.initials;
    av.style.background = currentUser.color+'20'; av.style.color = currentUser.color;
  }
  document.getElementById('topbar-name').textContent = currentUser.name;
}

function applyUserTheme() {
  const saved = localStorage.getItem('onspot_theme_' + currentUser.id) || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeToggleIcon(saved);
}

function toggleTheme() {
  if (!currentUser) return;
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('onspot_theme_' + currentUser.id, next);
  updateThemeToggleIcon(next);
}

function updateThemeToggleIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

async function tryRestoreSession() {
  const supabase = window.taskinDataProviders?.supabase;
  if (supabase?.enabled()) {
    try {
      const user = await supabase.getCurrentProfile();
      if (!user) { supabase.signOut(); return false; }
      enterApp(user);
      return true;
    } catch (error) {
      console.error('Restauration session Supabase impossible:', error);
      supabase.signOut();
      return false;
    }
  }
  return false;
}

// Point 6 : applyRoleUI renforcé — masquage strict timer/quickstart pour sup/admin,
// Point 5 : masquage strict admin-panel et tab-admin si rôle !== admin
function applyRoleUI() {
  const role = currentUser.role;
  const badge = document.getElementById('role-badge');
  const app = document.getElementById('app');
  const isOpsRole = role === 'admin' || role === 'supervisor';
  document.body.classList.toggle('ops-dashboard', isOpsRole);
  const opsHeading = document.getElementById('ops-page-heading');
  if (opsHeading) {
    opsHeading.classList.toggle('hidden', !isOpsRole);
    document.getElementById('ops-page-title').textContent = role === 'admin' ? 'Vue d’ensemble' : 'Supervision opérationnelle';
    document.getElementById('ops-page-subtitle').textContent = role === 'admin' ? 'Dashboard Admin · Hub central de l’activité et de la performance.' : 'Suis les performances, les cas complexes et les alertes de l’équipe.';
    document.getElementById('ops-context-label').textContent = role === 'admin' ? 'Contrôle global' : 'Équipe en direct';
  }
  app.classList.remove('role-agent','role-supervisor','role-formateur','role-admin');
  app.classList.add('role-' + role);
  const adminSidebar = document.getElementById('admin-sidebar');
  if (adminSidebar) adminSidebar.classList.toggle('hidden', role !== 'admin');
  document.body.classList.toggle('admin-shell-active', role === 'admin');
  document.querySelector('.tabs')?.classList.toggle('hidden', role === 'admin');
  if (role === 'admin' && typeof toggleAdminSidebar === 'function') {
    let collapsed = false;
    try { collapsed = localStorage.getItem('taskin_admin_sidebar_collapsed') === '1'; } catch (_) {}
    toggleAdminSidebar(collapsed);
  }

  if (role === 'agent') badge.textContent = 'Agent';
  if (role === 'supervisor') badge.textContent = 'Superviseur · Vue élargie';
  if (role === 'formateur') badge.textContent = 'Formateur · Learning & Knowledge';
  if (role === 'admin') badge.textContent = 'Admin · Contrôle total';
  badge.classList.toggle('hidden', role === 'agent');

  // Onglets
  document.getElementById('tab-team').classList.toggle('hidden', role !== 'admin' && role !== 'supervisor');
  document.getElementById('tab-admin').classList.toggle('hidden', role !== 'admin');
  document.querySelectorAll('.admin-only-tab').forEach(el => el.classList.toggle('hidden', role !== 'admin'));
  document.getElementById('tab-home').classList.toggle('hidden', role !== 'admin' && role !== 'agent');
  document.getElementById('tab-week-role').classList.toggle('hidden', role !== 'admin' && role !== 'agent');
  document.getElementById('tab-leaderboard').classList.toggle('hidden', role !== 'admin' && role !== 'supervisor');
  document.getElementById('tab-supervision').classList.toggle('hidden', role !== 'admin' && role !== 'supervisor');
  document.getElementById('tab-training').classList.toggle('hidden', role !== 'admin' && role !== 'formateur' && role !== 'agent');
  document.querySelectorAll('.team-live-edit-only').forEach(el => el.classList.toggle('hidden', role === 'agent'));
  document.querySelector('.tab.agent-only').classList.toggle('hidden', role !== 'agent');

  // Point 6 : Timer et Quickstart stritement réservés aux agents
  document.getElementById('timer-banner').classList.toggle('hidden', role !== 'agent');
  document.querySelector('.quickstart').classList.toggle('hidden', role !== 'agent');

  // Banners rôle — le superviseur n'utilise plus ce bandeau générique (remplacé par Supervision > Vue d'ensemble)
  document.getElementById('supervisor-banner').classList.add('hidden');
  document.getElementById('admin-banner').classList.toggle('hidden', role !== 'admin');

  // Stats
  document.getElementById('stats-grid-agent').classList.toggle('hidden', role !== 'agent');
  document.getElementById('team-accordion')?.classList.add('hidden');
  // C4 : agent-history-bar uniquement pour agent
  const histBar = document.getElementById('agent-history-bar');
  if (histBar) histBar.classList.toggle('hidden', role !== 'agent');
  // C5 : objectifs — goals-admin-card visible Admin seulement, goals-sup-card visible Sup+Admin
  const goalsAdmin = document.getElementById('goals-admin-card');
  if (goalsAdmin) goalsAdmin.classList.toggle('hidden', role !== 'admin');
  const goalsSup = document.getElementById('goals-sup-card');
  if (goalsSup) goalsSup.classList.toggle('hidden', role === 'agent');
  const adminOpsHome = document.getElementById('ops-viz-admin-home');
  if (adminOpsHome) adminOpsHome.classList.add('hidden');
  const supervisorOpsOverview = document.getElementById('ops-viz-supervision-overview');
  if (supervisorOpsOverview) supervisorOpsOverview.classList.toggle('hidden', role !== 'admin' && role !== 'supervisor');

  // Dashboard live permanent (Admin seulement — le superviseur a désormais Supervision > Vue d'ensemble)
  document.getElementById('permanent-live-panel').classList.add('hidden');

  // L’ancien arbre Administration est désactivé : les panneaux admin-* sont la source unique.
  document.getElementById('admin-panel')?.classList.add('hidden');
  document.getElementById('leaderboard-panel').classList.add('hidden');
  document.getElementById('channel-matrix-panel').classList.add('hidden');
  document.getElementById('team-live-panel').classList.add('hidden');
  document.getElementById('training-panel').classList.add('hidden');
  const svPanel = document.getElementById('supervision-panel');
  if (svPanel) svPanel.classList.add('hidden');

  // Ligne de filtres tableau (Sup/Admin seulement)
  document.getElementById('table-filters').classList.toggle('hidden', role === 'agent');

  const agentFilter = document.getElementById('filter-agent');
  if (role === 'agent') {
    agentFilter.value = currentUser.id;
    agentFilter.disabled = true;
  } else {
    agentFilter.disabled = false;
  }

  // Point 1 : currentView initialisé correctement selon le rôle
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (role === 'agent') {
    currentView = getPersistedTaskinView('agent') || 'today';
    const agentTab = document.querySelector('.tab.agent-only');
    if (agentTab) agentTab.classList.add('active');
  } else if (role === 'supervisor') {
    currentView = getPersistedTaskinView('supervisor') || 'supervision';
    const svTab = document.getElementById('tab-supervision');
    if (svTab) svTab.classList.add('active');
    document.querySelector('.toolbar').classList.add('hidden');
    document.querySelector('.entries-table-wrap').classList.add('hidden');
    document.getElementById('date-filter-bar').classList.add('hidden');

    startLiveRefresh();
  } else if (role === 'formateur') {
    currentView = getPersistedTaskinView('formateur') || 'training';
    const trainingTab = document.getElementById('tab-training');
    if (trainingTab) trainingTab.classList.add('active');
    document.querySelector('.toolbar').classList.add('hidden');
    document.querySelector('.entries-table-wrap').classList.add('hidden');
    document.getElementById('date-filter-bar').classList.add('hidden');
  } else if (role === 'admin') {
    currentView = getPersistedTaskinView('admin') || 'admin';
    const adminTab = document.getElementById('tab-admin');
    if (adminTab) adminTab.classList.add('active');
    setAdminSidebarActive(currentView);
    document.querySelector('.toolbar').classList.add('hidden');
    document.querySelector('.entries-table-wrap').classList.add('hidden');
    document.getElementById('date-filter-bar').classList.add('hidden');
  } else {
    currentView = 'home';
    const homeTab = document.getElementById('tab-home');
    if (homeTab) homeTab.classList.add('active');
    document.querySelector('.toolbar').classList.add('hidden');
    document.querySelector('.entries-table-wrap').classList.add('hidden');

    startLiveRefresh();
  }
  if (role === 'supervisor') {
    document.getElementById('supervision-panel').classList.remove('hidden');
  }
  if (role === 'formateur') {
    document.getElementById('training-panel').classList.remove('hidden');
  }
  if (typeof rememberTaskinView === 'function') rememberTaskinView(currentView, true);
}

function logout() {
  if (activeTimer) { alert('Arrête le timer en cours avant de te déconnecter.'); return; }
  stopLiveRefresh();
  if (window.taskinDataProviders?.supabase?.enabled()) window.taskinDataProviders.supabase.signOut();
  currentUser = null; entries = [];
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-email').value = ''; document.getElementById('login-password').value = '';
}

function populateFilters() {
  const sel = document.getElementById('filter-agent');
  sel.innerHTML = '<option value="">Tous les agents</option>' + agentsOnly().map(u=>`<option value="${u.id}">${u.name}</option>`).join('');

  // Sélecteur agent de l'accordéon Vue Globale
  const supSel = document.getElementById('sup-agent-filter');
  if (supSel) {
    supSel.innerHTML = '<option value="">Équipe entière</option>' + agentsOnly().map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  }

  // Point 3 : remplissage dynamique du select Agent dans les filtres du tableau
  const fAgt = document.getElementById('f-agt');
  if (fAgt) {
    fAgt.innerHTML = '<option value="">Tous</option>' + agentsOnly().map(u=>`<option value="${u.id}">${u.name}</option>`).join('');
  }

  const tSel = document.getElementById('filter-treatment');
  if (tSel) tSel.innerHTML = '<option value="">Tous traitements</option>' + customTreatmentTypes.map(t=>`<option value="${t}">${t}</option>`).join('');
}

// Point 2 : refreshApp entièrement séquentiel avec await
async function refreshApp() {
  // Toutes les ressources indépendantes partent ensemble. On attend ensuite
  // leur arrivée avant le premier rendu pour éviter les écrans qui se repeignent
  // plusieurs fois avec des données partielles.
  await Promise.all([
    loadAccounts(),
    loadTreatments(),
    loadDMT(),
    loadGoals(),
    loadEntries(false),
  ]);
  populateFilters();
  await renderCurrentView();
  if (currentUser?.role === 'admin') preloadAdminInterfaces().catch(error => console.warn('Préchargement Admin partiel:', error));
  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor')) {
    startLiveRefresh();
  }
  const warmup = () => preloadRoleModules(currentUser?.role);
  if ('requestIdleCallback' in window) requestIdleCallback(warmup, { timeout: 1200 });
  else setTimeout(warmup, 250);
}

async function renderCurrentView() {
  if (!currentUser) return;
  if (currentView === 'home' || currentView === 'team') renderRoleHome();
  else if (currentView === 'admin' || (currentUser.role === 'admin' && ['workflow-kpi','stat','quality','admin-training','admin-settings'].includes(currentView))) await switchTab(currentView, document.querySelector(`[data-admin-nav="${currentView}"], #tab-${currentView}`), { history: false });
  else if (currentView === 'supervision') {
    await loadModule('09-documentation.js');
    await loadModule('10-supervision.js');
    svInit();
  } else if (currentView === 'training') {
    await loadModule('05-training.js');
    await loadModule('09-documentation.js');
    renderTrainingHub();
  } else if (currentView === 'documentation') {
    await loadModule('09-documentation.js');
    docRenderList();
  } else if (currentView === 'leaderboard') renderLeaderboard();
  else renderAll();
}
