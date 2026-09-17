// ===== P2 : LEADERBOARD =====
let lbPeriod = 'day';
let lbSortKey = 'volume';
let lbSortAsc = false;

function setLbPeriod(p, btn) {
  lbPeriod = p;
  // Synchroniser aussi l'accordéon Vue Globale
  supPeriod = p;
  document.querySelectorAll('.sup-period-btn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  renderSupKpis();
  document.querySelectorAll('.lb-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLeaderboard();
}

function sortLeaderboard(key) {
  if (lbSortKey === key) lbSortAsc = !lbSortAsc;
  else { lbSortKey = key; lbSortAsc = key === 'name'; }
  document.querySelectorAll('.lb-table th').forEach(th => {
    th.classList.remove('sorted');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '↕';
  });
  const th = document.getElementById('lbth-' + key);
  if (th) { th.classList.add('sorted'); const a = th.querySelector('.sort-arrow'); if(a) a.textContent = lbSortAsc ? '↑' : '↓'; }
  renderLeaderboard();
}

function getLbEntries() {
  // P1 : Si un filtre date est appliqué, il prime sur la période du leaderboard
  const fromVal = document.getElementById('filter-date-from')?.value;
  const toVal   = document.getElementById('filter-date-to')?.value;
  if (dateFilterApplied && (fromVal || toVal)) {
    const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const toDate   = toVal   ? new Date(toVal   + 'T23:59:59') : null;
    return entries.filter(e => {
      const d = getEntryDate(e.startTimeStr);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }
  // Sinon : filtre par période standard (défaut = jour)
  const now = new Date();
  return entries.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    if (lbPeriod === 'day')   return isToday(e.startTimeStr);
    if (lbPeriod === 'week')  return isThisWeek(e.startTimeStr);
    if (lbPeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  });
}

let qualityReviewsLoadedForLb = false;
async function renderLeaderboard() {
  if (!qualityReviewsLoadedForLb) {
    qualityReviews = await svFetchCollection('qualityReviews');
    qualityReviewsLoadedForLb = true;
  }
  const pool = getLbEntries();
  const agents = agentsOnly();
  const rows = agents.map(a => {
    const ae = pool.filter(e => e.agent === a.id);
    const kpi = calcKpiSet(ae);
    const frtMin = ae.reduce((acc, e) => {
      if (e.inboundTime && e.inboundTime !== '--:--') {
        const [ih, im] = e.inboundTime.split(':').map(Number);
        if (!isNaN(ih) && !isNaN(im)) {
          const sd = new Date(e.startTimeStr); const ind = new Date(sd);
          ind.setHours(ih, im, 0, 0);
          const diff = Math.floor((sd - ind) / 1000);
          if (diff >= 0 && diff < 86400) acc.push(diff);
        }
      }
      return acc;
    }, []);
    const frtAvgMin = frtMin.length ? Math.floor(frtMin.reduce((s,v)=>s+v,0)/frtMin.length/60) : null;
    const dmtMin = ae.length ? Math.floor(ae.reduce((s,e)=>s+e.durationSec,0)/ae.length/60) : 0;
    const review = svLatestReview(a.id);
    const quality = review ? svReviewPct(review) : null;
    return { agent: a, volume: ae.length, dmt: dmtMin, frt: frtAvgMin, quality };
  });

  rows.sort((a, b) => {
    let va, vb;
    if (lbSortKey === 'name') return lbSortAsc ? a.agent.name.localeCompare(b.agent.name) : b.agent.name.localeCompare(a.agent.name);
    if (lbSortKey === 'volume') { va = a.volume; vb = b.volume; }
    else if (lbSortKey === 'dmt') { va = a.dmt; vb = b.dmt; }
    else if (lbSortKey === 'frt') { va = a.frt ?? 9999; vb = b.frt ?? 9999; }
    else if (lbSortKey === 'quality') { va = a.quality ?? -1; vb = b.quality ?? -1; }
    else { va = a.volume; vb = b.volume; }
    return lbSortAsc ? va - vb : vb - va;
  });

  const avgDmt = rows.filter(r=>r.volume>0).reduce((s,r)=>s+r.dmt,0) / (rows.filter(r=>r.volume>0).length || 1);

  const body = document.getElementById('leaderboard-body');
  if (!body) return;
  if (!rows.length) { body.innerHTML = '<tr><td colspan="6"><div class="empty">Aucun agent.</div></td></tr>'; return; }

  const medals = ['🥇','🥈','🥉'];
  body.innerHTML = rows.map((r, i) => {
    const rank = i + 1;
    const rankDisplay = rank <= 3 ? `<span class="lb-medal">${medals[rank-1]}</span>` : `<span class="lb-rank">${rank}</span>`;
    const dmtClass = r.dmt === 0 ? '' : r.dmt <= avgDmt * 0.9 ? 'good' : r.dmt > avgDmt * 1.2 ? 'bad' : 'warn';
    const qualityClass = r.quality === null ? '' : r.quality >= 75 ? 'good' : r.quality >= 55 ? 'warn' : 'bad';
    return `<tr>
      <td>${rankDisplay}</td>
      <td><div class="agent-cell"><div class="mini-avatar" style="background:${r.agent.color}20;color:${r.agent.color}">${r.agent.initials}</div>${r.agent.name}</div></td>
      <td><span class="lb-val">${r.volume}</span></td>
      <td><span class="lb-val">${r.frt !== null ? r.frt + 'min' : '—'}</span></td>
      <td><span class="lb-val ${dmtClass}">${r.dmt ? r.dmt + 'min' : '—'}</span></td>
      <td><span class="lb-val ${qualityClass}">${r.quality !== null ? r.quality + '%' : '—'}</span></td>
    </tr>`;
  }).join('');
}

// ===== P3 : MATRICE CANAUX =====
let matrixPeriod = 'day';
let matrixChannel = 'all';

function setMatrixPeriod(p, btn) {
  matrixPeriod = p;
  document.querySelectorAll('.matrix-toggle').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderChannelMatrix();
}

function setChannelFilter(ch, btn) {
  matrixChannel = ch;
  document.querySelectorAll('.channel-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderChannelMatrix();
}

function getMatrixEntries() {
  const now = new Date();
  return entries.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    if (matrixPeriod === 'day') return isToday(e.startTimeStr);
    if (matrixPeriod === 'week') return isThisWeek(e.startTimeStr);
    if (matrixPeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  });
}

const CHANNEL_META = {
  inbound:  { label: 'Appel entrant',  icon: '📞↘', color: 'var(--ocean)' },
  outbound: { label: 'Appel sortant',  icon: '📞↗', color: '#D6A848' },
  chat:     { label: 'Crisp Chat',     icon: '💬',  color: '#84A9DE' },
  email:    { label: 'Crisp Email',    icon: '✉️',  color: '#2A61A3' },
  ticket:   { label: 'Ticket / Manuel',icon: '🎫',  color: 'var(--green)' },
};

function calcChannelKpi(pool) {
  const volume = pool.length;
  let totalSec = 0, frtSec = 0, frtCount = 0;
  pool.forEach(e => {
    totalSec += e.durationSec;
    if (e.inboundTime && e.inboundTime !== '--:--') {
      const [ih, im] = e.inboundTime.split(':').map(Number);
      if (!isNaN(ih) && !isNaN(im)) {
        const sd = new Date(e.startTimeStr); const ind = new Date(sd);
        ind.setHours(ih, im, 0, 0);
        const diff = Math.floor((sd - ind) / 1000);
        if (diff >= 0 && diff < 86400) { frtSec += diff; frtCount++; }
      }
    }
  });
  return {
    volume,
    dmt: volume ? Math.floor(totalSec / volume / 60) : 0,
    frt: frtCount ? Math.floor(frtSec / frtCount / 60) : null
  };
}

function renderChannelMatrix() {
  const grid = document.getElementById('channel-matrix-grid');
  if (!grid) return;
  const pool = getMatrixEntries();
  const channels = matrixChannel === 'all' ? Object.keys(CHANNEL_META) : [matrixChannel];

  grid.innerHTML = channels.map(ch => {
    const meta = CHANNEL_META[ch];
    const chPool = pool.filter(e => {
      if (ch === 'inbound') return e.source === 'inbound' || e.source === 'ringover';
      if (ch === 'outbound') return e.source === 'outbound';
      if (ch === 'chat') return e.source === 'chat' || e.source === 'crisp';
      if (ch === 'email') return e.source === 'email';
      return e.source === 'ticket' || e.source === 'manual';
    });
    const kpi = calcChannelKpi(chPool);
    return `<div class="channel-card">
      <div class="channel-card-header">
        <span style="font-size:20px">${meta.icon}</span>
        <span class="channel-card-title" style="color:${meta.color}">${meta.label}</span>
      </div>
      <div class="channel-kpis">
        <div class="channel-kpi">
          <div class="channel-kpi-val" style="color:${meta.color}">${kpi.volume}</div>
          <div class="channel-kpi-label">Volume</div>
        </div>
        <div class="channel-kpi">
          <div class="channel-kpi-val">${kpi.frt !== null ? kpi.frt + 'min' : '—'}</div>
          <div class="channel-kpi-label">FRT</div>
        </div>
        <div class="channel-kpi">
          <div class="channel-kpi-val">${kpi.dmt ? kpi.dmt + 'min' : '—'}</div>
          <div class="channel-kpi-label">DMT</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Pleine largeur si 1 canal
  grid.style.gridTemplateColumns = channels.length === 1 ? '1fr' : '1fr 1fr';
}

// ===== P4 : TRI TRAITEMENTS (flèches + drag & drop) =====
function renderTreatmentList() {
  document.getElementById('treatment-count').textContent = customTreatmentTypes.length + ' types';
  const MAX_QUICK = 5; // Les X premiers = accès rapide agents
  document.getElementById('treatment-list').innerHTML = customTreatmentTypes.map((t, i) => {
    const isQuick = i < MAX_QUICK;
    return `<div class="treatment-row" draggable="true" data-index="${i}"
      ondragstart="onTreatDragStart(event,${i})"
      ondragover="onTreatDragOver(event,${i})"
      ondragleave="onTreatDragLeave(event)"
      ondrop="onTreatDrop(event,${i})">
      <span class="treat-drag-handle" title="Glisser pour réordonner">⠿</span>
      <div class="treat-order-btns">
        <button class="treat-order-btn" onclick="moveTreatment(${i},-1)" ${i===0?'disabled':''} title="Monter">▲</button>
        <button class="treat-order-btn" onclick="moveTreatment(${i},1)" ${i===customTreatmentTypes.length-1?'disabled':''} title="Descendre">▼</button>
      </div>
      <span style="flex:1">${t}</span>
      ${isQuick ? `<span class="treat-priority-badge">Accès rapide</span>` : ''}
      <button class="icon-btn" onclick="removeTreatmentType(${i})" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

let dragSrcIndex = null;

function onTreatDragStart(e, i) {
  dragSrcIndex = i;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onTreatDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.treatment-row').forEach(r => r.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

function onTreatDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function onTreatDrop(e, targetIndex) {
  e.preventDefault();
  document.querySelectorAll('.treatment-row').forEach(r => { r.classList.remove('drag-over'); r.classList.remove('dragging'); });
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
  const item = customTreatmentTypes.splice(dragSrcIndex, 1)[0];
  customTreatmentTypes.splice(targetIndex, 0, item);
  dragSrcIndex = null;
  renderTreatmentList();
  populateFilters();
  await saveTreatments();
}

async function moveTreatment(i, dir) {
  const newIndex = i + dir;
  if (newIndex < 0 || newIndex >= customTreatmentTypes.length) return;
  const tmp = customTreatmentTypes[i];
  customTreatmentTypes[i] = customTreatmentTypes[newIndex];
  customTreatmentTypes[newIndex] = tmp;
  renderTreatmentList();
  populateFilters();
  await saveTreatments();
}

// ===== P5 : SNIPPET GOOGLE APPS SCRIPT =====
// Ce bloc génère un export Google Sheets basé sur Supabase.
function showGASModal() {
  const script = `// ============================================================
// Task'in → Google Sheets — Script de synchronisation nocturne
// Coller dans : Extensions > Apps Script > Code.gs
// Déclencher : Déclencheurs > Quotidien (ex: 06:00–07:00)
// ============================================================
const SUPABASE_URL = "${window.TASKIN_SUPABASE_CONFIG?.url || ''}";
const SUPABASE_ANON_KEY = "${window.TASKIN_SUPABASE_CONFIG?.anonKey || ''}";
const SUPABASE_ACCESS_TOKEN = "COLLER_ICI_UN_JETON_UTILISATEUR_SUPABASE";

function syncTaskinToSheets() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName("Données brutes") || ss.insertSheet("Données brutes");
  
  // En-têtes (première fois uniquement)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Date","Inbound Time","Start Time","Source","Description","Agent","Durée (min)"]);
    sheet.getRange(1,1,1,7).setFontWeight("bold").setBackground("#2B4C7E").setFontColor("#FFFFFF");
  }
  
  // Calcul de la plage : hier (00:00 → 23:59)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const dayStart  = new Date(yesterday); dayStart.setHours(0,0,0,0);
  const dayEnd    = new Date(yesterday); dayEnd.setHours(23,59,59,999);
  
  // Récupération Supabase avec un jeton utilisateur soumis aux policies RLS
  const url = \`\${SUPABASE_URL}/rest/v1/time_entries?select=id,source,description,agent_id,inbound_time,started_at,duration_seconds&order=started_at.desc&limit=1000\`;
  const res  = UrlFetchApp.fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: \`Bearer \${SUPABASE_ACCESS_TOKEN}\` } });
  const docs  = JSON.parse(res.getContentText());
  
  let newRows = 0;
  docs.forEach(doc => {
    const rawTime = doc.started_at || "";
    if (!rawTime) return;
    const dt = new Date(rawTime);
    if (dt < dayStart || dt > dayEnd) return;
    
    const d       = dt;
    const start   = Utilities.formatDate(d, "Indian/Antananarivo", "HH:mm");
    const source  = doc.source || "";
    const desc    = doc.description || "";
    const agent   = doc.agent_id || "";
    const dur     = Math.ceil(Number(doc.duration_seconds || 0)/60);
    const inbound = doc.inbound_time || "--:--";
    
    sheet.appendRow([
      Utilities.formatDate(d,"Indian/Antananarivo","dd/MM/yyyy"),
      inbound, start, source, desc, agent, dur
    ]);
    newRows++;
  });
  
  // Log dans une feuille dédiée
  const logSheet = ss.getSheetByName("Sync Log") || ss.insertSheet("Sync Log");
  logSheet.appendRow([new Date(), \`\${newRows} ligne(s) ajoutée(s) pour \${Utilities.formatDate(yesterday,"Indian/Antananarivo","dd/MM/yyyy")}\`]);
}`;

  // Créer une modale dynamique
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(30,42,58,.6);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:85vh;overflow-y:auto">
      <div class="modal-header">
        <div class="modal-title">📊 Script Google Apps Script</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text2);margin-bottom:12px">
          Copie ce script dans <strong>Extensions → Apps Script</strong> de ton Google Sheets, puis configure un déclencheur quotidien (ex: 06h00).
        </p>
        <textarea readonly style="width:100%;height:340px;font-family:var(--mono);font-size:11px;padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);resize:vertical;outline:none">${script}</textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Fermer</button>
        <button class="btn btn-primary" onclick="navigator.clipboard.writeText(this.closest('.modal').querySelector('textarea').value).then(()=>{this.textContent='✓ Copié !';setTimeout(()=>this.textContent='Copier le script',2000)})">Copier le script</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
