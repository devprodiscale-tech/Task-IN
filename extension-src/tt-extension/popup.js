// URL de la web app Task'in (seul endroit où l'on se connecte).
const TASKIN_APP_URL = 'https://task-in-rho.vercel.app/';
const SESSION_USER_KEY = 'taskin_supabase_user';

let currentUser = null;
let activeTimer = null; 
let timerInterval = null;
// Même liste par défaut que la web app (js/00-core-init.js) : utilisée tant
// qu'aucune liste personnalisée n'est enregistrée dans Supabase.
const TREATMENT_TYPES_DEFAULT = [
  '✅ Confirmation','🎫 Reservations','💡 Conseils/suggestions','🔄 Follow-up',
  '🔍 Lost and found','🚗 Car rental','➕ Additionnels services','🚆 Train',
  '🩺 Health','🎉 Activities','🚌 Transferts','🗺️ DMC','📋 Itinerary',
  '🏨 Accommodation','🧳 Luggage','✈️ Flights','📞 Welcome call','👋 Goodbye call'
];
let customTreatmentTypes = [...TREATMENT_TYPES_DEFAULT];

// Canaux : mêmes libellés, couleurs et icônes que la web app (js/20-agent-pole.js).
const PHONE_SVG = '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>';
const SOURCES = {
  inbound: { label: 'Appel entrant', color: '#E5484D', icon: '<path d="M16 2v6h6"/><path d="m22 2-6 6"/>' + PHONE_SVG },
  outbound: { label: 'Appel sortant', color: '#D97706', icon: '<path d="M22 8V2h-6"/><path d="m16 8 6-6"/>' + PHONE_SVG },
  chat: { label: 'Crisp Chat', color: '#0EA5E9', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>' },
  email: { label: 'Crisp Email', color: '#6366F1', icon: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>' },
  ticket: { label: 'Ticket / Manuel', color: '#16A34A', icon: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>' },
};
const SOURCE_ALIASES = { ringover: 'inbound', crisp: 'chat' };
const POLE_LABELS = { fo: 'FO', bo: 'BO', reconf: 'Reconf' };
function sourceInfo(src) {
  return SOURCES[SOURCE_ALIASES[src] || src] || { label: src || 'Non défini', color: '#64748B', icon: '<circle cx="12" cy="12" r="4"/>' };
}
function sourceIconSvg(src) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${sourceInfo(src).icon}</svg>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function setStepIndicator(step) {
  document.getElementById('wizard-step-indicator').textContent = `${step}/4`;
  document.querySelectorAll('#step-meter i').forEach((dot, i) => {
    dot.classList.toggle('on', i < step);
    dot.classList.toggle('current', i === step - 1);
  });
}

let pickerHour = "00", pickerMin = "00"; 
let isScrolling = false;
let currentWizardStep = 1;
let historyVisible = true;
const isPortablePopup = true;

const TIMER_PING_KEY = 'taskin_timer_ping';
const TIMER_SYNC_MS = 6000;
let timerSyncBusy = false;
let lastStoppedTimerStart = 0;

document.addEventListener('DOMContentLoaded', () => {
  initTimePickerUI();
  tryRestoreSession().then(success => {
    if (!success) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app').classList.add('hidden');
    } else {
      loadTeamLiveMini();
      setInterval(loadTeamLiveMini, 30000);
      setInterval(syncTimerFromServer, TIMER_SYNC_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) syncTimerFromServer(); });
      window.addEventListener('focus', () => syncTimerFromServer());
    }
  });
});

// Écoute des changements en temps réel (autres fenêtres de l'extension, web app via le bridge)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;
  // Connexion, changement de compte ou déconnexion depuis la web app.
  if (changes[SESSION_USER_KEY] && (changes[SESSION_USER_KEY].newValue?.id || null) !== (currentUser?.id || null)) {
    window.location.reload();
    return;
  }
  if (!currentUser) return;
  // La web app a démarré / arrêté un timer : relecture immédiate.
  if (changes[TIMER_PING_KEY]?.newValue?.from === 'app') syncTimerFromServer();
  const key = 'activeTimer_' + currentUser.id;
  if (changes[key]) {
    activeTimer = changes[key].newValue || null;
    renderTimerState();
    if (!activeTimer) loadHistoryAndStats();
  }
});

// ROUTEUR D'ÉVÉNEMENTS
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'startTimerImmediate') startTimerImmediate();
  else if (action === 'setSource') setSource(el.dataset.source);
  else if (action === 'setTreatment') setTreatment(el.dataset.treatment);
  else if (action === 'setTime') setTime();
  else if (action === 'finishWizard') finishWizard();
  else if (action === 'goBackWizard') goBackWizard();
  
  else if (action === 'toggleHistory') toggleHistory();
  else if (action === 'stopTimer') stopTimer();
  else if (action === 'clickTimeOpt') clickTimeOpt(el.dataset.col, el.dataset.index);
  else if (action === 'openWebDashboard') openWebDashboard();
  else if (action === 'openComplexCases') openComplexCases();
  else if (action === 'focusPortable') focusPortablePopup();
});

document.addEventListener('keydown', (e) => {
  if (e.target.dataset.keydown === 'finishWizard' && e.key === 'Enter') finishWizard();
});

document.addEventListener('scroll', (e) => {
  if (e.target.id === 'col-hours') handleTimeScroll(e.target, 'h');
  if (e.target.id === 'col-mins') handleTimeScroll(e.target, 'm');
}, true);

// ==========================================
// AUTHENTIFICATION ET INIT
// ==========================================
async function tryRestoreSession() {
  const user = await supabaseClient.getUser();
  if (!user?.id) return false;
  await enterApp(user.id);
  return true;
}

async function enterApp(uid) {
  currentUser = { id: uid, initials: '??', name: 'Chargement...', color: '#2563EB' };
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  await checkActiveTimer();
  document.getElementById('app-loading').classList.add('hidden');
  fetchAccountProfile(uid).then(() => updateTopbarUI());
  loadTreatments();
  loadHistoryAndStats();
}

async function fetchAccountProfile(uid) {
  try {
    const profile = await supabaseClient.getProfile(uid);
    if (profile) {
      currentUser.name = profile.name || 'Utilisateur';
      currentUser.initials = profile.initials || '??';
      currentUser.color = profile.color || '#2563EB';
      currentUser.role = profile.role || 'agent';
      currentUser.pole = profile.pole || '';
    }
  } catch (e) {}
}

function updateTopbarUI() {
  document.getElementById('tb-avatar').textContent = currentUser.initials;
  document.getElementById('tb-avatar').style.background = currentUser.color;
  document.getElementById('tb-name').textContent = currentUser.name;
  const pole = currentUser.role === 'agent' && POLE_LABELS[currentUser.pole] ? currentUser.pole : '';
  if (pole) document.body.dataset.pole = pole; else delete document.body.dataset.pole;
  document.getElementById('tb-pole').textContent = pole ? POLE_LABELS[pole] : '';
}

// ==========================================
// MINI DASHBOARD (STATS & HISTORIQUE)
// ==========================================
function toggleHistory() {
  historyVisible = !historyVisible;
  const btn = document.getElementById('toggle-history-btn');
  const list = document.getElementById('history-list');
  if (historyVisible) {
    btn.textContent = "Historique ▴";
    list.classList.remove('hidden');
  } else {
    btn.textContent = "Historique ▾";
    list.classList.add('hidden');
  }
}

function openWebDashboard() {
  chrome.tabs.create({ url: TASKIN_APP_URL });
}

function focusPortablePopup() {
  chrome.runtime.sendMessage({ type: 'onspot:focusPortable' }, () => {
    void chrome.runtime.lastError;
    if (window.parent === window) window.close();
  });
}

function openComplexCases() {
  chrome.windows.create({
    url: chrome.runtime.getURL('documentation.html#cases'),
    type: 'popup',
    width: 500,
    height: 680
  });
}

let teamLiveCache = null;
async function loadTeamLiveMini() {
  const el = document.getElementById('team-live-mini');
  if (!el) return;
  try {
    const rows = await supabaseClient.request('/rest/v1/active_timers?select=agent_id&limit=50');
    if (!rows.length) {
      el.innerHTML = '<div class="mini-empty">Aucun agent actif pour le moment.</div>';
      return;
    }
    el.innerHTML = `<div class="mini-team-count">${rows.length} agent${rows.length > 1 ? 's' : ''} actif${rows.length > 1 ? 's' : ''}</div>`;
  } catch (e) {
    el.innerHTML = '<div class="mini-empty">—</div>';
  }
}

async function loadHistoryAndStats() {
  const list = document.getElementById('history-list');
  try {
    const rows = await supabaseClient.request('/rest/v1/time_entries?select=*&order=started_at.desc&limit=1000');
    const now = new Date();
    const todayEntries = rows.map(row => ({
      source: row.source || 'ticket',
      treatment: row.treatment || '',
      desc: row.description || '',
      agent: row.agent_id || '',
      startTimeDate: new Date(row.started_at),
      durationSec: Number(row.duration_seconds || 0)
    })).filter(e => {
      // SOLUTION : Filtrage de sécurité ultra strict sur l'ID de l'agent et vérification de la date du jour locale
      const isMyTask = String(e.agent).trim() === String(currentUser.id).trim();
      const isToday = e.startTimeDate.getDate() === now.getDate() &&
                      e.startTimeDate.getMonth() === now.getMonth() &&
                      e.startTimeDate.getFullYear() === now.getFullYear();
      return isMyTask && isToday;
    }).sort((a,b) => b.startTimeDate - a.startTimeDate);
      
    // Mise à jour des stats
    const totalSec = todayEntries.reduce((s, e) => s + e.durationSec, 0);
    const durH = Math.floor(totalSec / 3600);
    const durM = Math.floor((totalSec % 3600) / 60);
    const totalStr = durH > 0 ? `${durH}h${String(durM).padStart(2,'0')}` : `${durM}m`;
    
    document.getElementById('stat-tasks').textContent = todayEntries.length;
    document.getElementById('stat-total').textContent = totalStr;

    // Rendu de la liste
    if (todayEntries.length === 0) {
      list.innerHTML = '<div class="mini-empty-row">Aucune tâche aujourd\'hui.</div>';
      return;
    }
    
    list.innerHTML = todayEntries.map(e => {
      const info = sourceInfo(e.source);
      const title = escapeHtml(e.desc || e.treatment || info.label);
      const itemDurM = Math.ceil(e.durationSec / 60);
      const itemDurH = Math.floor(e.durationSec / 3600);
      const itemDurStr = itemDurH > 0 ? `${itemDurH}h${String(Math.floor((e.durationSec % 3600) / 60)).padStart(2,'0')}` : `${itemDurM}min`;
      
      return `
      <div class="history-item">
          <div class="history-item-left">
              <div class="h-icon-box" style="--c:${info.color}" title="${escapeHtml(info.label)}">${sourceIconSvg(e.source)}</div>
              <span class="history-item-title">${title}</span>
          </div>
          <span class="history-item-dur">${itemDurStr}</span>
      </div>`;
    }).join('');
    
  } catch (e) {
    list.innerHTML = '<div class="mini-empty-row error">Erreur réseau ou chargement.</div>';
  }
}

// ==========================================
// FORMATTAGE COULEURS MOSAÏQUE
// ==========================================
function getTreatmentColors(emoji) {
  const colorMap = {
    '🌍': { bg: '#E1F0FF', border: '#3B99FC' }, '🗺️': { bg: '#E8F2EC', border: '#4E8A63' },
    '🏨': { bg: '#FDECEF', border: '#E85D75' }, '💼': { bg: '#F6EFEB', border: '#9E7455' },
    '✈️': { bg: '#EAF1F8', border: '#5C82A6' }, '👋': { bg: '#FFF6E5', border: '#F2A640' },
    '🚗': { bg: '#FDEEEB', border: '#E26D5A' }, '🚆': { bg: '#EBEFF2', border: '#607D8B' },
    '🩺': { bg: '#E0F4F5', border: '#26A69A' }, '💡': { bg: '#FFFCE0', border: '#FBC02D' },
    '✅': { bg: '#E8F5E9', border: '#4CAF50' }, '❌': { bg: '#FFEBEE', border: '#F44336' },
    '⚠️': { bg: '#FFF8E1', border: '#FFCA28' }, '📝': { bg: '#FFF8E6', border: '#DCAE1D' }
  };
  if (colorMap[emoji]) return colorMap[emoji];
  const fallbackPalette = [ { bg: '#E6EDF6', border: '#2B4C7E' }, { bg: '#FBE9E6', border: '#E98A7D' }, { bg: '#FCF1D6', border: '#DCAE1D' }, { bg: '#E1F3EC', border: '#3B8C6E' } ];
  return fallbackPalette[(emoji ? emoji.charCodeAt(0) : 0) % fallbackPalette.length];
}

async function loadTreatments() {
  renderTreatmentList();
  try {
    const rows = await supabaseClient.request('/rest/v1/settings?select=value&key=eq.treatments&limit=1');
    const values = rows[0]?.value?.list || [];
    if (values.length) {
      customTreatmentTypes = values.map(String);
      renderTreatmentList();
    }
  } catch(e) {}
}

function renderTreatmentList() {
  const list = document.getElementById('treatment-list');
  list.innerHTML = customTreatmentTypes.map(t => {
    const match = String(t).match(/^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)\s*(.*)$/u);
    const emoji = match ? match[1] : '📝';
    const text = match ? match[2] : String(t);
    const colors = getTreatmentColors(emoji.replace(/\u{FE0F}/gu, '')) ;
    return `<button type="button" class="treatment-btn" data-action="setTreatment" data-treatment="${escapeHtml(t)}" style="--btn-border:${colors.border}">
              <span class="trt-emoji">${emoji}</span>
              <span class="trt-label">${escapeHtml(text || t).replace(/\//g, "/<wbr>")}</span>
            </button>`;
  }).join('');
}

// ==========================================
// WIZARD CONTRÔLE
// ==========================================
function hideAllWizardSteps() {
  document.getElementById('step-source').classList.add('hidden');
  document.getElementById('step-treatment').classList.add('hidden');
  document.getElementById('step-time').classList.add('hidden');
  document.getElementById('step-ref').classList.add('hidden');
}

// Écrit le timer localement (toutes les fenêtres de l'extension) puis dans Supabase (web app).
let timerSaveChain = Promise.resolve();
async function persistTimer() {
  if (!activeTimer) return;
  activeTimer.rev = (activeTimer.rev || 0) + 1;
  activeTimer.synced = false;
  await chrome.storage.local.set({ ['activeTimer_' + currentUser.id]: activeTimer });
  // Envois à la suite : l'état final arrive toujours en dernier dans Supabase.
  timerSaveChain = timerSaveChain.then(() => saveActiveTimer());
  return timerSaveChain;
}

async function startTimerImmediate() {
  if (activeTimer) { renderTimerState(); return; }
  const now = Date.now();
  activeTimer = { id: String(now), startTime: now, source: 'Non défini', treatment: '', desc: '', inboundTime: '', synced: false };
  document.getElementById('wizard-view').classList.add('hidden');
  renderTimerState();
  await persistTimer();
}

async function goBackWizard() {
  if (currentWizardStep === 1) {
    // Annulation : le timer disparaît aussi de la web app.
    lastStoppedTimerStart = activeTimer?.startTime || 0;
    activeTimer = null;
    await chrome.storage.local.remove('activeTimer_' + currentUser.id);
    renderTimerState();
    await clearActiveTimer();
    pingWebApp();
  } else {
    showWizardStep(currentWizardStep - 1);
  }
}

async function setSource(src) {
  activeTimer.source = src;
  showWizardStep(2);
  await persistTimer();
}

async function setTreatment(trt) {
  activeTimer.treatment = trt;
  showWizardStep(3);
  await persistTimer();
}

async function setTime() {
  activeTimer.inboundTime = `${pickerHour}:${pickerMin}`;
  showWizardStep(4);
  await persistTimer();
}

async function finishWizard() {
  const ref = document.getElementById('wizard-ref').value.trim();
  let fullDesc = activeTimer.treatment;
  if (ref) fullDesc += (activeTimer.treatment ? ' - ' : '') + ref;
  if (!fullDesc) fullDesc = 'Tâche en cours';
  activeTimer.desc = fullDesc;
  document.getElementById('wizard-ref').value = '';
  renderTimerState();
  await persistTimer();
}

const WIZARD_STEPS = ['step-source', 'step-treatment', 'step-time', 'step-ref'];
function showWizardStep(step) {
  currentWizardStep = step;
  setStepIndicator(step);
  hideAllWizardSteps();
  document.getElementById(WIZARD_STEPS[step - 1]).classList.remove('hidden');
  if (step === 3) {
    const d = activeTimer?.inboundTime && /^\d{2}:\d{2}$/.test(activeTimer.inboundTime) ? null : new Date(activeTimer?.startTime || Date.now());
    if (d) { pickerHour = String(d.getHours()).padStart(2, '0'); pickerMin = String(d.getMinutes()).padStart(2, '0'); }
    else [pickerHour, pickerMin] = activeTimer.inboundTime.split(':');
    requestAnimationFrame(syncPickerScroll);
  }
  if (step === 4) setTimeout(() => document.getElementById('wizard-ref').focus(), 50);
}

// Affiche la bonne vue selon le timer : accueil, assistant (saisie en cours) ou timer en cours.
function renderTimerState() {
  const idle = document.getElementById('idle-view');
  const wizard = document.getElementById('wizard-view');
  const done = document.getElementById('done-view');
  if (!activeTimer) {
    clearInterval(timerInterval);
    timerInterval = null;
    wizard.classList.add('hidden');
    done.classList.add('hidden');
    idle.classList.remove('hidden');
    return;
  }
  idle.classList.add('hidden');
  if (!activeTimer.desc) {
    done.classList.add('hidden');
    if (wizard.classList.contains('hidden')) {
      wizard.classList.remove('hidden');
      // Reprend l'assistant à la première étape non renseignée.
      const hasSource = activeTimer.source && activeTimer.source !== 'Non défini';
      showWizardStep(!hasSource ? 1 : !activeTimer.treatment ? 2 : !activeTimer.inboundTime ? 3 : 4);
    }
  } else {
    wizard.classList.add('hidden');
    showDoneView();
  }
  if (!timerInterval) timerInterval = setInterval(updateClock, 1000);
  updateClock();
}

// ==========================================
// GESTION DU TIMER
// ==========================================
async function stopTimer() {
  if (!activeTimer) return;
  const stopped = activeTimer;
  lastStoppedTimerStart = stopped.startTime;
  const durationSec = Math.floor((Date.now() - stopped.startTime) / 1000);
  // Même identifiant que la web app : un double arrêt ne crée pas de doublon.
  const entry = {
    id: String(stopped.id || stopped.startTime), source: SOURCES[stopped.source] ? stopped.source : 'ticket',
    desc: stopped.desc || stopped.treatment || 'Tâche', treatment: stopped.treatment || '',
    inboundTime: stopped.inboundTime || '', agent: currentUser.id, startTime: new Date(stopped.startTime).toISOString(), durationSec: Math.max(0, durationSec)
  };

  activeTimer = null;
  await chrome.storage.local.remove('activeTimer_' + currentUser.id);
  renderTimerState();

  try { await saveTimeEntry(entry); }
  catch (e) { if (!/duplicate|23505|409/i.test(String(e?.message || e))) console.error('Enregistrement de la tâche impossible:', e); }
  await clearActiveTimer();
  pingWebApp();

  // Rafraîchit l'historique après sauvegarde pour inclure cette tâche
  loadHistoryAndStats();
}

function updateClock() {
  if (!activeTimer) return;
  const elapsed = Math.floor((Date.now() - activeTimer.startTime) / 1000);
  const h = String(Math.floor(elapsed/3600)).padStart(2,'0');
  const m = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
  const s = String(elapsed%60).padStart(2,'0');
  
  const timeStr = `${h}:${m}:${s}`;
  document.getElementById('wizard-clock').textContent = timeStr;
  document.getElementById('final-clock').textContent = timeStr;
}

async function checkActiveTimer() {
  const key = 'activeTimer_' + currentUser.id;
  const data = await chrome.storage.local.get(key);
  activeTimer = data[key] || null;
  // Anciennes versions : seul un timer finalisé (avec description) était envoyé à Supabase.
  if (activeTimer && activeTimer.synced === undefined) activeTimer.synced = !!activeTimer.desc;
  renderTimerState();
  syncTimerFromServer();
}

function timerFromRow(row) {
  const startTime = Date.parse(row.started_at);
  const meta = row.metadata || {};
  return {
    id: String(meta.timer_id || startTime), startTime,
    source: row.source || 'ticket', desc: row.description || '',
    treatment: meta.treatment || '', inboundTime: meta.inbound_time && meta.inbound_time !== '--:--' ? meta.inbound_time : '',
    synced: true
  };
}

// Relit le timer partagé (Supabase) : un timer lancé ou arrêté depuis la web app apparaît ici.
async function syncTimerFromServer() {
  if (!currentUser?.id || timerSyncBusy || document.hidden) return;
  timerSyncBusy = true;
  try {
    const rows = await supabaseClient.request(`/rest/v1/active_timers?select=*&agent_id=eq.${encodeURIComponent(currentUser.id)}&limit=1`);
    const remote = Array.isArray(rows) && rows[0] ? timerFromRow(rows[0]) : null;
    const key = 'activeTimer_' + currentUser.id;
    if (remote && remote.startTime === lastStoppedTimerStart) return; // arrêt local en cours d'envoi
    if (remote) {
      const same = activeTimer && activeTimer.startTime === remote.startTime
        && activeTimer.desc === remote.desc && activeTimer.source === remote.source && activeTimer.treatment === remote.treatment;
      if (same) {
        if (!activeTimer.synced) { activeTimer.synced = true; await chrome.storage.local.set({ [key]: activeTimer }); }
        return;
      }
      if (activeTimer && !activeTimer.synced && activeTimer.startTime >= remote.startTime) { await saveActiveTimer(); return; }
      activeTimer = remote;
      await chrome.storage.local.set({ [key]: activeTimer });
      renderTimerState();
    } else if (activeTimer) {
      if (!activeTimer.synced) { await saveActiveTimer(); return; }
      // Arrêté depuis la web app : l'entrée y a déjà été enregistrée.
      activeTimer = null;
      await chrome.storage.local.remove(key);
      renderTimerState();
      loadHistoryAndStats();
    }
  } catch (e) {
    console.error('Synchronisation du timer impossible:', e);
  } finally {
    timerSyncBusy = false;
  }
}

// Prévient la web app ouverte dans ce navigateur (via bridge.js) qu'un timer a changé.
function pingWebApp() {
  chrome.storage.local.set({ [TIMER_PING_KEY]: { from: 'ext', at: Date.now() } });
}

function showDoneView() {
  document.getElementById('done-view').classList.remove('hidden');
  const info = sourceInfo(activeTimer.source);
  document.getElementById('run-source').textContent = info.label;
  const icon = document.getElementById('run-icon');
  icon.style.setProperty('--c', info.color);
  icon.innerHTML = sourceIconSvg(activeTimer.source);
  document.getElementById('run-desc').textContent = activeTimer.desc;
}

async function saveActiveTimer() {
  if (!activeTimer || !currentUser) return false;
  const timer = { ...activeTimer };
  try {
    await supabaseClient.request('/rest/v1/active_timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        agent_id: currentUser.id,
        source: timer.source,
        description: timer.desc || '',
        started_at: new Date(timer.startTime).toISOString(),
        metadata: { timer_id: String(timer.id || timer.startTime), treatment: timer.treatment || '', inbound_time: timer.inboundTime || '', wizard: !timer.desc }
      })
    });
    if (activeTimer && activeTimer.startTime === timer.startTime && (activeTimer.rev || 0) === (timer.rev || 0) && !activeTimer.synced) {
      activeTimer.synced = true;
      await chrome.storage.local.set({ ['activeTimer_' + currentUser.id]: activeTimer });
    }
    pingWebApp();
    return true;
  } catch (e) {
    console.error('Enregistrement du timer impossible:', e);
    return false;
  }
}
async function clearActiveTimer() {
  try {
    await supabaseClient.request(`/rest/v1/active_timers?agent_id=eq.${encodeURIComponent(currentUser.id)}`, { method: 'DELETE' });
    return true;
  } catch (e) {
    console.error('Suppression du timer impossible:', e);
    return false;
  }
}
async function saveTimeEntry(entry) {
  await supabaseClient.request('/rest/v1/time_entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      id: String(entry.id),
      raw_id: '',
      source: entry.source,
      description: entry.desc,
      treatment: entry.treatment || '',
      agent_id: entry.agent,
      inbound_time: entry.inboundTime || '',
      started_at: entry.startTime,
      duration_seconds: Number(entry.durationSec || 0),
      metadata: {}
    })
  });
}

// ==========================================
// ROULETTE TIME PICKER
// ==========================================
function initTimePickerUI() {
  const hCol = document.getElementById('col-hours'); const mCol = document.getElementById('col-mins');
  let hHtml = '<div class="time-spacer"></div>', mHtml = '<div class="time-spacer"></div>';
  for(let i=0; i<24; i++) hHtml += `<div class="time-opt" data-action="clickTimeOpt" data-col="col-hours" data-index="${i}" data-val="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</div>`;
  for(let i=0; i<60; i++) mHtml += `<div class="time-opt" data-action="clickTimeOpt" data-col="col-mins" data-index="${i}" data-val="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</div>`;
  hHtml += '<div class="time-spacer"></div>'; mHtml += '<div class="time-spacer"></div>';
  hCol.innerHTML = hHtml; mCol.innerHTML = mHtml;
}

function handleTimeScroll(col, type) {
  if (isScrolling) return;
  const opts = col.querySelectorAll('.time-opt'); const center = col.scrollTop + col.clientHeight / 2;
  let closest = null, minDiff = Infinity;
  opts.forEach(opt => { const optCenter = opt.offsetTop + opt.offsetHeight / 2; const diff = Math.abs(center - optCenter); if (diff < minDiff) { minDiff = diff; closest = opt; } });
  if (closest) {
    opts.forEach(o => o.classList.remove('active')); closest.classList.add('active');
    if (type === 'h') pickerHour = closest.dataset.val; else pickerMin = closest.dataset.val;
  }
}

function syncPickerScroll() {
  isScrolling = true;
  const hCol = document.getElementById('col-hours'); const mCol = document.getElementById('col-mins');
  hCol.querySelectorAll('.time-opt').forEach(o => o.classList.remove('active'));
  mCol.querySelectorAll('.time-opt').forEach(o => o.classList.remove('active'));

  const hTarget = hCol.querySelector(`[data-val="${pickerHour}"]`); const mTarget = mCol.querySelector(`[data-val="${pickerMin}"]`);
  if (hTarget) { hTarget.classList.add('active'); hCol.scrollTop = hTarget.offsetTop - hCol.clientHeight/2 + hTarget.offsetHeight/2; }
  if (mTarget) { mTarget.classList.add('active'); mCol.scrollTop = mTarget.offsetTop - mCol.clientHeight/2 + mTarget.offsetHeight/2; }
  setTimeout(() => isScrolling = false, 50);
}

function clickTimeOpt(colId, index) { const col = document.getElementById(colId); const target = col.querySelectorAll('.time-opt')[index]; col.scrollTo({ top: target.offsetTop - col.clientHeight/2 + target.offsetHeight/2, behavior: 'smooth' }); }