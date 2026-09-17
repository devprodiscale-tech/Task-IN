// ===== P3 : MOSAÏQUE KPI AGENTS =====
let mosaicPeriod = 'day';

function setMosaicPeriod(p, btn) {
  mosaicPeriod = p;
  document.querySelectorAll('.mosaic-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderMosaicKpis();
}

function getMosaicEntries(agentId) {
  const now = new Date();
  // Priorité aux filtres dates si appliqués
  const fromVal = document.getElementById('filter-date-from')?.value;
  const toVal   = document.getElementById('filter-date-to')?.value;
  let pool = agentId ? entries.filter(e => e.agent === agentId) : entries;
  if (dateFilterApplied && (fromVal || toVal)) {
    const fromDate = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const toDate   = toVal   ? new Date(toVal   + 'T23:59:59') : null;
    return pool.filter(e => {
      const d = getEntryDate(e.startTimeStr);
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }
  if (mosaicPeriod === 'day')   return pool.filter(e => isToday(e.startTimeStr));
  if (mosaicPeriod === 'week')  return pool.filter(e => isThisWeek(e.startTimeStr));
  if (mosaicPeriod === 'month') return pool.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  return pool;
}

function renderMosaicKpis(activeTimers) {
  const grid = document.getElementById('mosaic-grid');
  if (!grid) return;
  const agents = agentsOnly();
  if (!agents.length) { grid.innerHTML = '<div class="empty">Aucun agent.</div>'; return; }

  // activeTimers est optionnel pour conserver le rendu des vues sans supervision live.
  const timerByAgent = {};
  if (activeTimers) activeTimers.forEach(t => timerByAgent[t.agentId] = t);

  grid.innerHTML = agents.map(a => {
    const pool = getMosaicEntries(a.id);
    const kpi  = calcKpiSet(pool);
    const t    = timerByAgent[a.id];
    const isActive = !!t;

    // Timer live si actif
    let timerStr = '';
    if (isActive) {
      const elapsed = Math.floor((Date.now() - t.startTime) / 1000);
      const m = Math.floor(elapsed / 60), s = elapsed % 60;
      timerStr = m + ':' + String(s).padStart(2, '0');
    }

    const avatarStyle = a.photo
      ? `background-image:url(${a.photo});background-size:cover;background-color:transparent`
      : `background:${a.color}20;color:${a.color}`;
    const avatarContent = a.photo ? '' : a.initials;

    return `<div class="mosaic-card" onclick="viewAgentDetail('${a.id}')">
      ${currentUser.role === 'admin' ? `<button class="icon-btn" title="Gérer ce compte" onclick="event.stopPropagation();openAccountEditModal('${a.id}')" style="position:absolute;top:10px;right:10px;background:var(--surface2);border-radius:6px;width:26px;height:26px;font-size:13px">⚙</button>` : ''}
      <div class="mosaic-card-top">
        <div class="mosaic-avatar" style="${avatarStyle}">
          ${avatarContent}
          <span class="mosaic-status-dot ${isActive ? 'active' : 'idle'}"></span>
        </div>
        <div style="flex:1;min-width:0">
          <div class="mosaic-agent-name">${a.name}</div>
          <div class="mosaic-agent-task">${isActive ? (t.desc || t.source) : 'Inactif'}</div>
        </div>
        ${isActive ? `<span class="mosaic-timer">${timerStr}</span>` : ''}
      </div>
      <div class="mosaic-kpis">
        <div class="mosaic-kpi">
          <div class="mosaic-kpi-val">${kpi.total}</div>
          <div class="mosaic-kpi-label">Total</div>
        </div>
        <div class="mosaic-kpi">
          <div class="mosaic-kpi-val">${kpi.count}</div>
          <div class="mosaic-kpi-label">Tâches</div>
        </div>
        <div class="mosaic-kpi">
          <div class="mosaic-kpi-val">${kpi.dmt}</div>
          <div class="mosaic-kpi-label">DMT moy.</div>
        </div>
        <div class="mosaic-kpi">
          <div class="mosaic-kpi-val">${kpi.frt}</div>
          <div class="mosaic-kpi-label">FRT</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ===== FEAT 1 : EXPORT PDF LEADERBOARD =====
function exportLeaderboardPDF() {
  const periodLabels = { day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois", all: "Tout" };
  const sub = document.getElementById('lb-print-sub');
  if (sub) sub.textContent = `Période : ${periodLabels[lbPeriod] || lbPeriod} — Généré le ${new Date().toLocaleDateString('fr-FR')}`;
  const header = document.getElementById('lb-print-header');
  if (header) header.style.display = 'block';
  window.print();
  setTimeout(() => { if (header) header.style.display = 'none'; }, 1000);
}

// ===== FEAT 2 : HISTOGRAMME 7 JOURS AGENT =====
function renderAgentHistory() {
  const container = document.getElementById('agent-history-bars');
  if (!container || currentUser.role !== 'agent') return;
  const today = new Date();
  const buckets = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({ date: d, count: 0 });
  }
  entries.filter(e => e.agent === currentUser.id).forEach(e => {
    const d = getEntryDate(e.startTimeStr);
    const bucket = buckets.find(b => b.date.toDateString() === d.toDateString());
    if (bucket) bucket.count++;
  });
  const max = Math.max(...buckets.map(b => b.count), 1);
  container.innerHTML = buckets.map((b, i) => {
    const isToday = i === 6;
    const pct = Math.max((b.count / max) * 100, b.count > 0 ? 8 : 2);
    const label = b.date.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2);
    return `<div class="agent-hbar-col" title="${b.date.toLocaleDateString('fr-FR')} — ${b.count} tâche(s)">
      <span class="agent-hbar-val">${b.count > 0 ? b.count : ''}</span>
      <div class="agent-hbar ${isToday ? 'today' : ''} ${b.count > 0 ? 'has-data' : ''}" style="height:${pct}%"></div>
      <span class="agent-hbar-label">${label}</span>
    </div>`;
  }).join('');
}

// ===== FEAT 3 : BARRES KPI OBJECTIF =====
let agentGoals = { count: 20, total: 360, dmt: 8, frt: 3 };

async function loadGoals() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return;
  try {
    const setting = await supabase.getSetting('goals');
    const value = setting?.value || {};
    agentGoals = { count: Number(value.count ?? 20), total: Number(value.total ?? 360), dmt: Number(value.dmt ?? 8), frt: Number(value.frt ?? 3) };
    renderGoalInputs();
  } catch (e) { console.error('loadGoals Supabase:', e); }
}

function renderGoalInputs() {
  const gi = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  // Admin inputs
  gi('goal-count', agentGoals.count);
  gi('goal-total', agentGoals.total);
  gi('goal-dmt',   agentGoals.dmt);
  gi('goal-frt',   agentGoals.frt);
  // Sup inputs (même données)
  gi('goal-count-sup', agentGoals.count);
  gi('goal-total-sup', agentGoals.total);
  gi('goal-dmt-sup',   agentGoals.dmt);
  gi('goal-frt-sup',   agentGoals.frt);
}

// saveGoals pour le superviseur — lit les inputs -sup
async function saveGoalsSup() {
  if (!requireRoles('admin', 'supervisor')) return;
  agentGoals = {
    count: parseInt(document.getElementById('goal-count-sup')?.value || 20),
    total: parseInt(document.getElementById('goal-total-sup')?.value || 360),
    dmt:   parseInt(document.getElementById('goal-dmt-sup')?.value   || 8),
    frt:   parseInt(document.getElementById('goal-frt-sup')?.value   || 3),
  };
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try {
    await supabase.upsertSetting('goals', agentGoals, currentUser.id);
    renderGoalInputs();
    renderOpsVisuals();
    alert('Objectifs enregistrés ✓');
  } catch (e) { console.error('saveGoalsSup Supabase:', e); }
}

async function saveGoals() {
  if (!requireRoles('admin')) return;
  agentGoals = {
    count: parseInt(document.getElementById('goal-count')?.value || 20),
    total: parseInt(document.getElementById('goal-total')?.value || 360),
    dmt:   parseInt(document.getElementById('goal-dmt')?.value   || 8),
    frt:   parseInt(document.getElementById('goal-frt')?.value   || 3),
  };
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  try {
    await supabase.upsertSetting('goals', agentGoals, currentUser.id);
    alert('Objectifs enregistrés ✓');
    renderStats([]); // force refresh des barres
    renderOpsVisuals();
  } catch (e) { console.error('saveGoals Supabase:', e); }
}

function parseMinVal(str) {
  // Convertit "0h00" ou "Xmin" en minutes
  if (!str || str === '--') return null;
  if (str.includes('h')) {
    const [h, m] = str.split('h');
    return parseInt(h) * 60 + (parseInt(m) || 0);
  }
  return parseInt(str) || null;
}

function renderKpiProgressBars(totalMin, dmtMin, frtMin, countVal) {
  if (currentUser.role !== 'agent') return;
  // C6 : valeurs numériques reçues directement (minutes/entiers)
  totalMin = totalMin !== null && totalMin !== undefined ? Number(totalMin) : null;
  dmtMin   = dmtMin   !== null && dmtMin   !== undefined ? Number(dmtMin)   : null;
  frtMin   = frtMin   !== null && frtMin   !== undefined ? Number(frtMin)   : null;
  countVal = countVal !== null && countVal !== undefined ? Number(countVal) : 0;

  const setBar = (id, val, goal, invert, labelId, unit) => {
    const bar = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    if (!bar || val === null || !goal) return;
    const ratio = val / goal;
    const pct = Math.min(ratio * 100, 100);
    let cls = 'good';
    if (invert) { cls = ratio <= 1 ? 'good' : ratio <= 1.3 ? 'warn' : 'bad'; }
    else        { cls = ratio >= 1 ? 'good' : ratio >= 0.6 ? 'warn' : 'bad'; }
    bar.style.width = pct + '%';
    bar.className = 'kpi-progress-fill ' + cls;
    if (lbl) lbl.textContent = `${val}${unit} / objectif ${goal}${unit}`;
  };

  setBar('pb-total', totalMin, agentGoals.total, false, 'gl-total', 'min');
  setBar('pb-count', countVal, agentGoals.count, false, 'gl-count', '');
  setBar('pb-dmt',   dmtMin,   agentGoals.dmt,   true,  'gl-dmt',   'min');
  setBar('pb-frt',   frtMin,   agentGoals.frt,   true,  'gl-frt',   'min');
}

// ===== FEAT 8 : DONUT CHART TYPES DE TRAITEMENT =====
const DONUT_COLORS = ['#2B4C7E','#E98A7D','#3B8C6E','#DCAE1D','#7B68EE','#FF7F50','#20B2AA','#9370DB','#4169E1','#CD853F'];

function renderDonutChart() {
  const svg = document.getElementById('donut-svg');
  const legend = document.getElementById('donut-legend');
  if (!svg || !legend) return;

  const period = document.getElementById('donut-period')?.value || 'week';
  const agentScope = document.getElementById('donut-agent')?.value || 'team';
  const now = new Date();
  let pool = agentScope === 'team' ? entries : entries.filter(e => e.agent === agentScope);
  if (period === 'week')  pool = pool.filter(e => isThisWeek(e.startTimeStr));
  else if (period === 'month') pool = pool.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  else pool = pool.filter(e => isToday(e.startTimeStr));

  // Compter par type (extrait du début de desc ou treatment)
  const counts = {};
  pool.forEach(e => {
    const key = e.treatment || (e.desc ? e.desc.split(' - ')[0].trim() : 'Autre');
    const label = key.length > 20 ? key.slice(0, 18) + '…' : key;
    counts[label] = (counts[label] || 0) + 1;
  });

  let sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  if (total === 0) { svg.innerHTML = ''; legend.innerHTML = '<div style="color:var(--text3);font-size:12px">Aucune donnée</div>'; return; }

  // Regrouper les < 3% en "Autres"
  const main = sorted.filter(([, v]) => v / total >= 0.03);
  const others = sorted.filter(([, v]) => v / total < 0.03);
  if (others.length) {
    const othersTotal = others.reduce((s, [, v]) => s + v, 0);
    main.push(['Autres', othersTotal]);
  }

  // Dessiner le donut SVG
  const cx = 70, cy = 70, r = 54, innerR = 30;
  let angle = -Math.PI / 2;
  let paths = '';
  main.forEach(([label, val], i) => {
    const slice = (val / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + slice), y2 = cy + r * Math.sin(angle + slice);
    const xi1 = cx + innerR * Math.cos(angle), yi1 = cy + innerR * Math.sin(angle);
    const xi2 = cx + innerR * Math.cos(angle + slice), yi2 = cy + innerR * Math.sin(angle + slice);
    const large = slice > Math.PI ? 1 : 0;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    paths += `<path d="M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${innerR},${innerR} 0 ${large},0 ${xi1},${yi1}" fill="${color}" stroke="var(--surface)" stroke-width="2" />`;
    angle += slice;
  });
  // Total au centre
  paths += `<text x="${cx}" y="${cy}" text-anchor="middle" dy="0.35em" font-size="14" font-weight="700" fill="var(--text)" font-family="var(--display)">${total}</text>`;
  svg.innerHTML = paths;

  // Légende
  legend.innerHTML = main.map(([label, val], i) => {
    const pct = Math.round((val / total) * 100);
    return `<div class="donut-legend-item">
      <div class="donut-legend-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></div>
      <span>${label}</span>
      <span class="donut-legend-pct">${val} · ${pct}%</span>
    </div>`;
  }).join('');
}
