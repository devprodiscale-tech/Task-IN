const FIREBASE_PROJECT_ID = "trackingcallro";
const FIREBASE_API_KEY = "AIzaSyD1Weyc2zdtdaO7JgrMRskXZaDOGTIbyqc";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1`;

let currentUser = null;
let activeTimer = null; 
let timerInterval = null;
let customTreatmentTypes = [];

let pickerHour = "00", pickerMin = "00"; 
let isScrolling = false;
let currentWizardStep = 1;
let historyVisible = true;
const isPortablePopup = true;

document.addEventListener('DOMContentLoaded', () => {
  initTimePickerUI();
  tryRestoreSession().then(success => {
    if (!success) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app').classList.add('hidden');
    } else {
      loadTeamLiveMini();
      setInterval(loadTeamLiveMini, 30000);
    }
  });
});

// Écoute des changements en temps réel (background -> popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && currentUser) {
    const key = 'activeTimer_' + currentUser.id;
    if (changes[key]) {
      const newVal = changes[key].newValue;
      if (newVal) {
        activeTimer = newVal;
        if (!activeTimer.desc || activeTimer.desc === '') {
          // Wizard en cours (étape 4)
        } else {
          showDoneView();
        }
        if (!timerInterval) { timerInterval = setInterval(updateClock, 1000); }
        updateClock();
      } else {
        // Timer arrêté
        activeTimer = null;
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('done-view').classList.add('hidden');
        document.getElementById('wizard-view').classList.add('hidden');
        document.getElementById('idle-view').classList.remove('hidden');
        loadHistoryAndStats();
      }
    }
  }
});

// ROUTEUR D'ÉVÉNEMENTS
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'doLogin') doLogin();
  else if (action === 'logout') logout();
  
  else if (action === 'startTimerImmediate') startTimerImmediate();
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
  if (e.target.dataset.keydown === 'doLogin' && e.key === 'Enter') doLogin();
  if (e.target.dataset.keydown === 'finishWizard' && e.key === 'Enter') finishWizard();
});

document.addEventListener('scroll', (e) => {
  if (e.target.id === 'col-hours') handleTimeScroll(e.target, 'h');
  if (e.target.id === 'col-mins') handleTimeScroll(e.target, 'm');
}, true);

// ==========================================
// AUTHENTIFICATION ET INIT
// ==========================================
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Remplissez les champs.'; return; }

  try {
    const res = await fetch(`${AUTH_BASE}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await res.json();
    if (data.error) { err.textContent = 'Identifiants incorrects.'; return; }
    
    await chrome.storage.local.set({ onspot_idToken: data.idToken, onspot_uid: data.localId });
    enterApp(data.localId);
  } catch(e) { err.textContent = 'Erreur réseau.'; }
}

async function tryRestoreSession() {
  const data = await chrome.storage.local.get(['onspot_uid']);
  if (!data.onspot_uid) return false;
  await enterApp(data.onspot_uid);
  return true;
}

async function enterApp(uid) {
  currentUser = { id: uid, initials: '??', name: 'Chargement...', color: '#3B8C6E' };
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  
  await checkActiveTimer();
  document.getElementById('app-loading').classList.add('hidden');

  fetchAccountProfile(uid).then(() => updateTopbarUI());
  loadTreatmentsFromFirestore();
  loadHistoryAndStats();
}

async function fetchAccountProfile(uid) {
  try {
    const res = await fetch(`${BASE_URL}/accounts/${uid}?key=${FIREBASE_API_KEY}`);
    if (res.ok) {
      const doc = await res.json();
      if (doc.fields) {
        currentUser.name = doc.fields.name?.stringValue || 'Utilisateur';
        currentUser.initials = doc.fields.initials?.stringValue || '??';
        currentUser.color = doc.fields.color?.stringValue || '#3B8C6E';
      }
    }
  } catch(e) {}
}

function updateTopbarUI() {
  document.getElementById('tb-avatar').textContent = currentUser.initials;
  document.getElementById('tb-avatar').style.background = currentUser.color;
  document.getElementById('tb-name').textContent = currentUser.name;
}

async function logout() {
  if (activeTimer) { alert('Arrêtez le timer en cours avant de vous déconnecter.'); return; }
  await chrome.storage.local.remove(['onspot_idToken', 'onspot_uid']);
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.add('hidden');
}

// ==========================================
// MINI DASHBOARD (STATS & HISTORIQUE)
// ==========================================
function toggleHistory() {
  historyVisible = !historyVisible;
  const btn = document.getElementById('toggle-history-btn');
  const list = document.getElementById('history-list');
  
  if (historyVisible) {
    btn.textContent = "Masquer le détail ▲";
    list.classList.remove('hidden');
  } else {
    btn.textContent = "Afficher le détail ▼";
    list.classList.add('hidden');
  }
}

function openWebDashboard() {
  chrome.tabs.create({ url: "https://onspot-time-tracker.web.app/" });
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
    const res = await fetch(`${BASE_URL}/active_timers?key=${FIREBASE_API_KEY}&pageSize=50`);
    const data = await res.json();
    const docs = data.documents || [];
    if (docs.length === 0) {
      el.innerHTML = '<div class="mini-empty">Aucun agent actif pour le moment.</div>';
      return;
    }
    el.innerHTML = `<div class="mini-team-count">${docs.length} agent${docs.length > 1 ? 's' : ''} actif${docs.length > 1 ? 's' : ''}</div>`;
  } catch (e) {
    el.innerHTML = '<div class="mini-empty">—</div>';
  }
}

async function loadHistoryAndStats() {
  const list = document.getElementById('history-list');
  
  try {
    // SOLUTION : "cache: 'no-store'" force Chrome à télécharger les vraies données au lieu d'utiliser le cache vide.
    const res = await fetch(`${BASE_URL}/time_entries?key=${FIREBASE_API_KEY}&pageSize=1000`, { cache: 'no-store' });
    const data = await res.json();
    const docs = data.documents || [];
    
    const now = new Date();
    
    let todayEntries = docs.map(doc => {
      const f = doc.fields || {};
      
      // Parseur de date robuste
      let stRaw = f.startTime?.stringValue || f.startTime?.integerValue || '';
      let d = new Date(stRaw);
      if (isNaN(d.getTime())) d = new Date(parseInt(stRaw, 10));
      if (isNaN(d.getTime())) d = new Date(); // Sécurité ultime

      return {
        source: f.source?.stringValue || 'ticket',
        treatment: f.treatment?.stringValue || '',
        desc: f.desc?.stringValue || '',
        agent: f.agent?.stringValue || '',
        startTimeDate: d,
        durationSec: parseInt(f.durationSec?.integerValue || 0)
      };
    }).filter(e => {
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
      list.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text3); font-size:11px;">Aucune tâche aujourd\'hui.</div>';
      return;
    }
    
    list.innerHTML = todayEntries.map(e => {
      let dotColor = '#E26D5A'; let dotBg = '#FDEEEB';
      if(e.source === 'inbound' || e.source === 'outbound' || e.source === 'ringover') { dotColor = '#DCAE1D'; dotBg = '#FCF1D6'; }
      else if(e.source === 'chat' || e.source === 'email' || e.source === 'crisp') { dotColor = '#3B99FC'; dotBg = '#E1F0FF'; }
      
      const title = e.desc || e.treatment || e.source;
      const itemDurM = Math.ceil(e.durationSec / 60);
      const itemDurH = Math.floor(e.durationSec / 3600);
      const itemDurStr = itemDurH > 0 ? `${itemDurH}h${String(Math.floor((e.durationSec % 3600) / 60)).padStart(2,'0')}` : `${itemDurM}min`;
      
      return `
      <div class="history-item">
          <div class="history-item-left">
              <div class="h-icon-box" style="background:${dotBg}; color:${dotColor}">●</div>
              <span class="history-item-title">${title}</span>
          </div>
          <span class="history-item-dur">${itemDurStr}</span>
      </div>`;
    }).join('');
    
  } catch(e) {
    list.innerHTML = '<div style="text-align:center; padding:10px; color:var(--red); font-size:11px;">Erreur réseau ou chargement.</div>';
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

async function loadTreatmentsFromFirestore() {
  try {
    const res = await fetch(`${BASE_URL}/settings/treatments?key=${FIREBASE_API_KEY}`, { cache: 'no-store' });
    if (res.status === 404) return;
    const data = await res.json();
    const values = data.fields?.list?.arrayValue?.values || [];
    if (values.length > 0) {
      customTreatmentTypes = values.map(v => v.stringValue);
      renderTreatmentList();
    }
  } catch(e) {}
}

function renderTreatmentList() {
  const list = document.getElementById('treatment-list');
  list.innerHTML = customTreatmentTypes.map(t => {
    const emojiMatch = t.match(/[\p{Emoji}\u200d]+/gu);
    const emoji = emojiMatch ? emojiMatch[0] : '📝';
    const text = t.replace(emoji, '').trim();
    const colors = getTreatmentColors(emoji);
    return `<button class="treatment-btn" data-action="setTreatment" data-treatment="${t.replace(/"/g,'&quot;')}"
              style="--btn-bg: ${colors.bg}; --btn-border: ${colors.border};">
              <span style="font-size:16px">${emoji}</span>
              <span>${text || t}</span>
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

async function startTimerImmediate() {
  activeTimer = { id: Date.now().toString(), startTime: Date.now(), source: 'Non défini', treatment: '', desc: '', inboundTime: '' };
  await chrome.storage.local.set({ ['activeTimer_'+currentUser.id]: activeTimer });
  
  document.getElementById('idle-view').classList.add('hidden');
  document.getElementById('wizard-view').classList.remove('hidden');
  
  timerInterval = setInterval(updateClock, 1000);
  updateClock();
  
  currentWizardStep = 1;
  document.getElementById('wizard-step-indicator').textContent = "1/4";
  hideAllWizardSteps();
  document.getElementById('step-source').classList.remove('hidden');
}

async function goBackWizard() {
  if (currentWizardStep === 1) {
    clearInterval(timerInterval);
    activeTimer = null;
    await chrome.storage.local.remove('activeTimer_'+currentUser.id);
    clearActiveTimerFromFirestore();
    
    document.getElementById('wizard-view').classList.add('hidden');
    document.getElementById('idle-view').classList.remove('hidden');
  } 
  else if (currentWizardStep === 2) {
    currentWizardStep = 1;
    document.getElementById('wizard-step-indicator').textContent = "1/4";
    hideAllWizardSteps();
    document.getElementById('step-source').classList.remove('hidden');
  } 
  else if (currentWizardStep === 3) {
    currentWizardStep = 2;
    document.getElementById('wizard-step-indicator').textContent = "2/4";
    hideAllWizardSteps();
    document.getElementById('step-treatment').classList.remove('hidden');
  } 
  else if (currentWizardStep === 4) {
    currentWizardStep = 3;
    document.getElementById('wizard-step-indicator').textContent = "3/4";
    hideAllWizardSteps();
    document.getElementById('step-time').classList.remove('hidden');
  }
}

async function setSource(src) {
  activeTimer.source = src;
  await chrome.storage.local.set({ ['activeTimer_'+currentUser.id]: activeTimer });
  currentWizardStep = 2;
  document.getElementById('wizard-step-indicator').textContent = "2/4";
  hideAllWizardSteps();
  document.getElementById('step-treatment').classList.remove('hidden');
}

async function setTreatment(trt) {
  activeTimer.treatment = trt;
  await chrome.storage.local.set({ ['activeTimer_'+currentUser.id]: activeTimer });
  currentWizardStep = 3;
  document.getElementById('wizard-step-indicator').textContent = "3/4";
  hideAllWizardSteps();
  document.getElementById('step-time').classList.remove('hidden');
  
  const d = new Date(activeTimer.startTime);
  pickerHour = String(d.getHours()).padStart(2, '0');
  pickerMin = String(d.getMinutes()).padStart(2, '0');
  syncPickerScroll();
}

async function setTime() {
  activeTimer.inboundTime = `${pickerHour}:${pickerMin}`;
  await chrome.storage.local.set({ ['activeTimer_'+currentUser.id]: activeTimer });
  currentWizardStep = 4;
  document.getElementById('wizard-step-indicator').textContent = "4/4";
  hideAllWizardSteps();
  document.getElementById('step-ref').classList.remove('hidden');
  document.getElementById('wizard-ref').focus();
}

async function finishWizard() {
  const ref = document.getElementById('wizard-ref').value.trim();
  let fullDesc = activeTimer.treatment;
  if (ref) fullDesc += (activeTimer.treatment ? ' - ' : '') + ref;
  if (!fullDesc) fullDesc = 'Tâche en cours';
  
  activeTimer.desc = fullDesc;
  await chrome.storage.local.set({ ['activeTimer_'+currentUser.id]: activeTimer });
  saveActiveTimerToFirestore();
  
  document.getElementById('wizard-view').classList.add('hidden');
  showDoneView();
}

// ==========================================
// GESTION DU TIMER
// ==========================================
async function stopTimer() {
  if (!activeTimer) return;
  clearInterval(timerInterval);
  const durationSec = Math.floor((Date.now() - activeTimer.startTime)/1000);
  
  const entry = {
    id: activeTimer.id, source: activeTimer.source, desc: activeTimer.desc, treatment: activeTimer.treatment || '',
    inboundTime: activeTimer.inboundTime || '', agent: currentUser.id, startTime: new Date(activeTimer.startTime).toISOString(), durationSec: Math.max(0, durationSec)
  };

  activeTimer = null;
  await chrome.storage.local.remove('activeTimer_'+currentUser.id);
  
  document.getElementById('done-view').classList.add('hidden');
  document.getElementById('wizard-view').classList.add('hidden');
  document.getElementById('idle-view').classList.remove('hidden');

  await saveEntryToFirestore(entry);
  await clearActiveTimerFromFirestore();
  
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
  const saved = data[key];
  
  if (saved) {
    activeTimer = saved;
    if (!activeTimer.desc || activeTimer.desc === '') {
      document.getElementById('wizard-view').classList.remove('hidden');
      currentWizardStep = 4;
      document.getElementById('wizard-step-indicator').textContent = "Reprise";
      hideAllWizardSteps();
      document.getElementById('step-ref').classList.remove('hidden');
    } else {
      showDoneView();
    }
    timerInterval = setInterval(updateClock, 1000);
    updateClock();
  } else {
    document.getElementById('done-view').classList.add('hidden');
    document.getElementById('wizard-view').classList.add('hidden');
    document.getElementById('idle-view').classList.remove('hidden');
  }
}

function showDoneView() {
  document.getElementById('done-view').classList.remove('hidden');
  const sourceNames = { 'inbound': '📞↘ Appel entrant', 'outbound': '📞↗ Appel sortant', 'chat': '💬 Crisp Chat', 'email': '✉️ Crisp Email', 'ticket': '🎫 Traitement ticket' };
  document.getElementById('run-source').textContent = sourceNames[activeTimer.source] || activeTimer.source;
  document.getElementById('run-desc').textContent = activeTimer.desc;
}

async function saveActiveTimerToFirestore() {
  const body = { fields: { source: { stringValue: activeTimer.source }, desc: { stringValue: activeTimer.desc }, treatment: { stringValue: activeTimer.treatment || '' }, startTime: { integerValue: String(activeTimer.startTime) } }};
  try { await fetch(`${BASE_URL}/active_timers/${currentUser.id}?key=${FIREBASE_API_KEY}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); } catch(e) {}
}
async function clearActiveTimerFromFirestore() {
  try { await fetch(`${BASE_URL}/active_timers/${currentUser.id}?key=${FIREBASE_API_KEY}`, { method:'DELETE' }); } catch(e) {}
}
async function saveEntryToFirestore(entry) {
  const body = { fields: { rawId: { stringValue: '' }, source: { stringValue: entry.source }, desc: { stringValue: entry.desc }, treatment: { stringValue: entry.treatment || '' }, inboundTime: { stringValue: entry.inboundTime || '' }, agent: { stringValue: entry.agent }, startTime: { stringValue: entry.startTime }, durationSec: { integerValue: String(entry.durationSec) } }};
  await fetch(`${BASE_URL}/time_entries/${entry.id}?key=${FIREBASE_API_KEY}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
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