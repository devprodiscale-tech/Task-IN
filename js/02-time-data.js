// ===== TIMER LOGIC =====
function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-desc').value = '';
  selectSource('inbound');
  const d = new Date();
  d.setMinutes(d.getMinutes() + 1);
  pickerHour = String(d.getHours()).padStart(2, '0');
  pickerMin = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('inbound-time-input').value = `${pickerHour}:${pickerMin}`;
  document.getElementById('modal-desc').focus();
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
function closeModalOutside(e) { if (e.target === document.getElementById('modal-overlay')) closeModal(); }

function selectSource(s) {
  selectedSource = s;
  document.querySelectorAll('.source-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('src-' + s).classList.add('selected');
}

function quickStart(source) {
  if (activeTimer) { alert('Un timer est déjà actif. Arrête-le avant d\'en démarrer un autre.'); return; }
  openModal();
  selectSource(source);
}

function startTimer() {
  // Point 7 : lecture depuis #modal-desc (renommé pour éviter le conflit avec #f-desc du filtre tableau)
  const desc = document.getElementById('modal-desc').value.trim() || (selectedSource==='ticket'?'Tâche manuelle':selectedSource);
  const now = Date.now();
  activeTimer = {
    id: String(now),
    source: selectedSource,
    desc,
    treatment: '',
    startTime: now,
    inboundTime: `${pickerHour}:${pickerMin}`,
    synced: false
  };
  closeModal();
  persistLocalTimer();
  renderTimerBanner();
  saveActiveTimer().then(ok => { if (ok) notifyTimerChanged(); });
}

// ===== TIMER PARTAGÉ WEB APP ↔ EXTENSION =====
// Source de vérité : la ligne active_timers de l'agent (une seule par agent).
// La web app et l'extension l'écrivent au démarrage / à l'arrêt et la relisent
// régulièrement : un timer lancé d'un côté apparaît de l'autre, et s'arrête partout.
const TIMER_SYNC_MS = 6000;
const TIMER_SOURCES = ['inbound', 'outbound', 'chat', 'email', 'ticket'];
let timerSyncInterval = null;
let timerSyncBusy = false;
let lastStoppedTimerStart = 0;

function persistLocalTimer() {
  if (!currentUser?.id) return;
  const key = 'activeTimer_' + currentUser.id;
  if (activeTimer) localStorage.setItem(key, JSON.stringify(activeTimer));
  else localStorage.removeItem(key);
}

function timerFromRow(row) {
  const startTime = Date.parse(row.started_at);
  const meta = row.metadata || {};
  return {
    id: String(meta.timer_id || startTime),
    source: row.source || 'ticket',
    desc: row.description || '',
    treatment: meta.treatment || '',
    startTime,
    inboundTime: meta.inbound_time || '--:--',
    synced: true
  };
}

function renderTimerBanner() {
  const banner = document.getElementById('timer-banner');
  const clock = document.getElementById('timer-clock');
  const task = document.getElementById('timer-task');
  if (!banner || !clock || !task) return;
  const running = !!activeTimer;
  banner.classList.toggle('active', running);
  clock.classList.toggle('active', running);
  clock.classList.toggle('idle', !running);
  task.classList.toggle('placeholder', !running);
  document.getElementById('play-btn')?.classList.toggle('hidden', running);
  document.getElementById('stop-btn')?.classList.toggle('hidden', !running);
  if (running) {
    task.textContent = activeTimer.desc || 'Saisie en cours dans l’extension…';
    if (!timerInterval) timerInterval = setInterval(updateClock, 1000);
    updateClock();
  } else {
    clearInterval(timerInterval);
    timerInterval = null;
    clock.textContent = '00:00:00';
    task.textContent = 'Aucun timer actif — démarre une tâche ci-dessous';
  }
}

function notifyTimerChanged() {
  if (typeof taskinExtensionPost === 'function') taskinExtensionPost('timer-changed');
}

async function saveActiveTimer() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled() || !activeTimer) return false;
  const timer = activeTimer;
  try {
    await supabase.upsertActiveTimer({
      agent_id: currentUser.id,
      source: timer.source,
      description: timer.desc,
      started_at: new Date(timer.startTime).toISOString(),
      metadata: { timer_id: String(timer.id || timer.startTime), treatment: timer.treatment || '', inbound_time: timer.inboundTime || '--:--' }
    });
    if (activeTimer === timer) { timer.synced = true; persistLocalTimer(); }
    return true;
  } catch (e) { console.error('Enregistrement timer Supabase impossible:', e); return false; }
}

async function clearActiveTimer() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return false;
  try { await supabase.removeActiveTimer(currentUser.id); return true; } catch (e) { console.error('Suppression timer Supabase impossible:', e); return false; }
}

// Relit le timer partagé et aligne l'affichage (timer lancé ou arrêté depuis l'extension).
async function syncOwnTimer() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!currentUser?.id || currentUser.role !== 'agent' || !supabase?.enabled() || timerSyncBusy || document.hidden) return;
  timerSyncBusy = true;
  try {
    const rows = await supabase.getActiveTimer(currentUser.id);
    let remote = rows?.[0] ? timerFromRow(rows[0]) : null;
    if (remote && !Number.isFinite(remote.startTime)) remote = null; // ligne incomplète : ignorée
    if (remote && remote.startTime === lastStoppedTimerStart) return; // arrêt local en cours d'envoi
    if (remote) {
      const same = activeTimer && activeTimer.startTime === remote.startTime
        && activeTimer.desc === remote.desc && activeTimer.source === remote.source;
      if (same) {
        if (!activeTimer.synced) { activeTimer.synced = true; persistLocalTimer(); }
        return;
      }
      // Timer local plus récent pas encore envoyé : il gagne.
      if (activeTimer && !activeTimer.synced && activeTimer.startTime > remote.startTime) { await saveActiveTimer(); return; }
      activeTimer = remote;
      persistLocalTimer();
      renderTimerBanner();
    } else if (activeTimer) {
      if (!activeTimer.synced) { await saveActiveTimer(); return; }
      // Arrêté ailleurs (extension) : l'entrée a été enregistrée de l'autre côté.
      activeTimer = null;
      persistLocalTimer();
      renderTimerBanner();
      await loadEntries(true);
    }
  } catch (e) {
    console.error('Synchronisation du timer impossible:', e);
  } finally {
    timerSyncBusy = false;
  }
}
window.syncOwnTimer = syncOwnTimer;

function startTimerSync() {
  if (timerSyncInterval) return;
  timerSyncInterval = setInterval(syncOwnTimer, TIMER_SYNC_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncOwnTimer(); });
  window.addEventListener('focus', () => syncOwnTimer());
}

function updateClock() {
  if (!activeTimer) return;
  const ms = Date.now() - activeTimer.startTime;
  const isFuture = ms < 0;
  const elapsed = Math.floor(Math.abs(ms) / 1000);
  const h = String(Math.floor(elapsed/3600)).padStart(2,'0');
  const m = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
  const s = String(elapsed%60).padStart(2,'0');
  document.getElementById('timer-clock').textContent = (isFuture ? '-' : '') + `${h}:${m}:${s}`;
}

async function stopTimer() {
  if (!activeTimer) return;
  const stopped = activeTimer;
  lastStoppedTimerStart = stopped.startTime;
  const durationSec = Math.max(0, Math.floor((Date.now() - stopped.startTime)/1000));
  // Même identifiant des deux côtés : un double arrêt (web app + extension) ne crée pas de doublon.
  const entry = {
    id: String(stopped.id || stopped.startTime),
    source: TIMER_SOURCES.includes(stopped.source) ? stopped.source : 'ticket',
    desc: stopped.desc || stopped.treatment || 'Tâche',
    treatment: stopped.treatment || '',
    agent: currentUser.id, inboundTime: stopped.inboundTime || '--:--',
    startTimeStr: new Date(stopped.startTime).toISOString(), durationSec
  };
  if (!entries.some(e => String(e.id) === entry.id)) entries.unshift(entry);
  if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
  activeTimer = null;
  persistLocalTimer();
  renderTimerBanner();
  renderAll();
  try { await saveTimeEntry(entry); }
  catch (e) { if (!/duplicate|23505|409/i.test(String(e?.message || e))) console.error('Enregistrement de la tâche impossible:', e); }
  await clearActiveTimer();
  notifyTimerChanged();
  fetchPermanentLiveAgents();
}

function checkActiveTimer() {
  const saved = localStorage.getItem('activeTimer_'+currentUser.id);
  if (saved) {
    try {
      activeTimer = JSON.parse(saved);
      // Anciennes versions : le timer était toujours envoyé à Supabase au démarrage.
      if (activeTimer && activeTimer.synced === undefined) activeTimer.synced = true;
    } catch (e) { activeTimer = null; }
  } else {
    activeTimer = null;
  }
  renderTimerBanner();
  startTimerSync();
  syncOwnTimer();
}

// ===== ACTIVE TIMERS / LIVE PERMANENT =====
async function loadActiveTimers() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return [];
  try {
    const rows = await supabase.listActiveTimers(100);
    return (rows || []).map(row => ({ agentId: row.agent_id, source: row.source || 'ticket', desc: row.description || '', startTime: new Date(row.started_at).getTime() }));
  } catch (e) { console.error('Lecture timers Supabase impossible:', e); return []; }
}

function startLiveRefresh() {
  if (liveRefreshInterval || !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) return;
  liveRefreshInterval = setInterval(fetchPermanentLiveAgents, 15000);
  fetchPermanentLiveAgents();
}

function stopLiveRefresh() {
  if (liveRefreshInterval) {
    clearInterval(liveRefreshInterval);
    liveRefreshInterval = null;
  }
}

async function fetchPermanentLiveAgents() {
  if (currentUser.role === 'agent') return;
  const activeTimers = await loadActiveTimers();
  const grid = document.getElementById('live-agents-grid');
  if (activeTimers.length === 0) {
    grid.innerHTML = '<div style="opacity:0.6; padding:10px;">Aucun agent actif pour le moment.</div>';
    return;
  }
  let html = '';
  activeTimers.forEach(t => {
    const agentObj = TEAM.find(u => u.id === t.agentId);
    const agentName = agentObj ? agentObj.name : 'Agent';
    const elapsedMin = Math.floor((Date.now() - t.startTime) / 60000);
    const timeColor = elapsedMin > 15 ? '#C9604F' : '#84A9DE';
    html += `<div class="live-agent-card">
      <div class="live-agent-top">
        <span class="live-agent-name">👤 ${escHtml(agentName)}</span>
        <span class="live-agent-time" style="color:${timeColor}">${elapsedMin} min</span>
      </div>
      <div class="live-agent-task"><strong>${escHtml(t.source)}</strong><br>${escHtml(t.desc)}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

// ===== RINGOVER SYNC =====
async function syncRingover() {
  alert('Synchronisation désactivée pour cette version de démonstration.');
}

async function loadEntries(shouldRender = true) {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return;
  try {
    const rows = await supabase.listTimeEntries(1000);
    entries = (rows || []).map(row => ({
      id: row.id,
      rawId: row.raw_id || '', source: /^[a-z_-]{1,24}$/.test(row.source || '') ? row.source : 'ticket', desc: row.description || '',
      treatment: row.treatment || '', agent: row.agent_id, inboundTime: /^(\d{2}:\d{2}|--:--)$/.test(row.inbound_time || '') ? row.inbound_time : '--:--',
      startTimeStr: row.started_at, durationSec: Number(row.duration_seconds || 0)
    })).filter(e => e.startTimeStr && /^[A-Za-z0-9_.:-]{1,80}$/.test(String(e.id))).sort((a,b)=> getEntryDate(b.startTimeStr)-getEntryDate(a.startTimeStr));
    if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
    if (shouldRender) renderCurrentView();
  } catch (e) { window.taskinLastLoadError = e; console.error('Lecture entrées Supabase impossible:', e); }
}

async function saveTimeEntry(entry) {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  await supabase.insertTimeEntry({
    id: String(entry.id), raw_id: entry.rawId || '', source: entry.source,
    description: entry.desc, treatment: entry.treatment || '', agent_id: entry.agent,
    inbound_time: entry.inboundTime || '--:--', started_at: entry.startTimeStr,
    duration_seconds: Number(entry.durationSec || 0), metadata: {}
  });
}

async function deleteEntry(id) {
  if (!confirm('Supprimer cette entrée ?')) return;
  const index = entries.findIndex(e => e.id === id);
  if (index < 0) return;
  const [removed] = entries.splice(index, 1);
  if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
  renderAll();
  try {
    await window.taskinDataProviders.supabase.deleteTimeEntry(id);
  } catch (error) {
    // Échec côté serveur : l'entrée revient à sa place et l'utilisateur est prévenu.
    console.error('Suppression impossible:', error);
    entries.splice(Math.min(index, entries.length), 0, removed);
    if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
    renderAll();
    alert('La suppression n’a pas pu être enregistrée. Vérifie ta connexion puis réessaie.');
  }
}
