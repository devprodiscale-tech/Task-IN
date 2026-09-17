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
  activeTimer = {
    source: selectedSource,
    desc,
    startTime: Date.now(),
    inboundTime: `${pickerHour}:${pickerMin}`
  };
  closeModal();
  document.getElementById('timer-banner').classList.add('active');
  document.getElementById('timer-clock').classList.remove('idle');
  document.getElementById('timer-clock').classList.add('active');
  document.getElementById('timer-task').textContent = desc;
  document.getElementById('timer-task').classList.remove('placeholder');
  document.getElementById('play-btn').classList.add('hidden');
  document.getElementById('stop-btn').classList.remove('hidden');
  localStorage.setItem('activeTimer_'+currentUser.id, JSON.stringify(activeTimer));
  saveActiveTimer();
  timerInterval = setInterval(updateClock, 1000);
  updateClock();
}

async function saveActiveTimer() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try {
    await supabase.upsertActiveTimer({
      agent_id: currentUser.id,
      source: activeTimer.source,
      description: activeTimer.desc,
      started_at: new Date(activeTimer.startTime).toISOString(),
      metadata: { inbound_time: activeTimer.inboundTime || '--:--' }
    });
  } catch (e) { console.error('Enregistrement timer Supabase impossible:', e); }
}

async function clearActiveTimer() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try { await supabase.removeActiveTimer(currentUser.id); } catch (e) { console.error('Suppression timer Supabase impossible:', e); }
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
  clearInterval(timerInterval);
  const durationSec = Math.floor((Date.now() - activeTimer.startTime)/1000);
  const entry = {
    id: Date.now().toString(), source: activeTimer.source, desc: activeTimer.desc,
    agent: currentUser.id, inboundTime: activeTimer.inboundTime || '--:--',
    startTimeStr: new Date(activeTimer.startTime).toISOString(), durationSec
  };
  entries.unshift(entry);
  if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
  activeTimer = null;
  localStorage.removeItem('activeTimer_'+currentUser.id);
  document.getElementById('timer-banner').classList.remove('active');
  document.getElementById('timer-clock').classList.add('idle');
  document.getElementById('timer-clock').classList.remove('active');
  document.getElementById('timer-clock').textContent = '00:00:00';
  document.getElementById('timer-task').textContent = 'Aucun timer actif — démarre une tâche ci-dessous';
  document.getElementById('timer-task').classList.add('placeholder');
  document.getElementById('play-btn').classList.remove('hidden');
  document.getElementById('stop-btn').classList.add('hidden');
  renderAll();
  saveTimeEntry(entry);
  clearActiveTimer();
  fetchPermanentLiveAgents();
}

function checkActiveTimer() {
  const saved = localStorage.getItem('activeTimer_'+currentUser.id);
  if (saved) {
    activeTimer = JSON.parse(saved);
    document.getElementById('timer-banner').classList.add('active');
    document.getElementById('timer-clock').classList.remove('idle'); document.getElementById('timer-clock').classList.add('active');
    document.getElementById('timer-task').textContent = activeTimer.desc; document.getElementById('timer-task').classList.remove('placeholder');
    document.getElementById('play-btn').classList.add('hidden');
    document.getElementById('stop-btn').classList.remove('hidden');
    timerInterval = setInterval(updateClock, 1000);
    updateClock();
  }
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
        <span class="live-agent-name">👤 ${agentName}</span>
        <span class="live-agent-time" style="color:${timeColor}">${elapsedMin} min</span>
      </div>
      <div class="live-agent-task"><strong>${t.source}</strong><br>${t.desc}</div>
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
      rawId: row.raw_id || '', source: row.source || 'ticket', desc: row.description || '',
      treatment: row.treatment || '', agent: row.agent_id, inboundTime: row.inbound_time || '--:--',
      startTimeStr: row.started_at, durationSec: Number(row.duration_seconds || 0)
    })).filter(e => e.startTimeStr).sort((a,b)=> getEntryDate(b.startTimeStr)-getEntryDate(a.startTimeStr));
    if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
    if (shouldRender) renderCurrentView();
  } catch (e) { console.error('Lecture entrées Supabase impossible:', e); }
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
  entries = entries.filter(e=>e.id!==id);
  renderAll();
  await window.taskinDataProviders.supabase.deleteTimeEntry(id);
}
