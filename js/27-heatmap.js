// ======================= HEATMAP D'ACTIVITÉ 7h–23h (composant commun) =======================
// Une seule heatmap, réutilisée dans Vue d'ensemble, Stat (admin) et Reporting (superviseur) :
// jours × heures (7h → 23h, pas d'une heure), filtres période / pôle / agent / canal / mesure,
// totaux par heure et par jour, créneau de pointe. Source : les traitements chronométrés (entries).

const HM_HOURS = Array.from({ length: 16 }, (_, i) => 7 + i); // 7h … 22h (dernier créneau 22h–23h)
const HM_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HM_SOURCES = { inbound: 'Appel entrant', outbound: 'Appel sortant', chat: 'Chat', email: 'E-mail', ticket: 'Ticket', wati: 'WATI', manual: 'Manuel' };
const hmState = {};

function hmDefaults(id, preset = {}) {
  if (!hmState[id]) hmState[id] = { period: '7d', pole: 'all', agent: 'all', source: 'all', measure: 'count', from: '', to: '', ...preset };
  return hmState[id];
}

function hmLocalDay(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

function hmRange(st) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (st.period === 'today') { /* aujourd'hui seulement */ }
  else if (st.period === '7d') start.setDate(start.getDate() - 6);
  else if (st.period === '28d') start.setDate(start.getDate() - 27);
  else if (st.period === 'month') start.setDate(1);
  else if (st.period === 'prev-month') { start.setMonth(start.getMonth() - 1, 1); end.setDate(0); }
  else if (st.period === 'custom' && st.from && st.to) {
    const [a, b] = st.from <= st.to ? [st.from, st.to] : [st.to, st.from];
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return [new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2, 23, 59, 59, 999)];
  }
  return [start, end];
}

function hmAgents() { return typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(u => u.role === 'agent'); }

function hmCompute(st) {
  const [start, end] = hmRange(st);
  const agentPole = Object.fromEntries(hmAgents().map(a => [a.id, a.pole || '']));
  const grid = HM_DAYS.map(() => HM_HOURS.map(() => 0));
  let outside = 0, total = 0;
  (typeof entries !== 'undefined' ? entries : []).forEach(e => {
    const d = typeof getEntryDate === 'function' ? getEntryDate(e.startTimeStr) : new Date(e.startTimeStr);
    if (!d || d < start || d > end) return;
    if (st.agent !== 'all' && e.agent !== st.agent) return;
    if (st.pole !== 'all' && agentPole[e.agent] !== st.pole) return;
    if (st.source !== 'all' && (e.source || 'manual') !== st.source) return;
    const value = st.measure === 'time' ? Number(e.durationSec || 0) / 60 : 1;
    const h = d.getHours();
    if (h < 7 || h > 22) { outside += value; return; }
    grid[(d.getDay() + 6) % 7][h - 7] += value;
    total += value;
  });
  const byHour = HM_HOURS.map((_, j) => grid.reduce((s, row) => s + row[j], 0));
  const byDay = grid.map(row => row.reduce((s, v) => s + v, 0));
  const max = Math.max(0, ...grid.flat());
  let peak = null;
  grid.forEach((row, i) => row.forEach((v, j) => { if (v > 0 && (!peak || v > peak.v)) peak = { v, day: HM_DAYS[i], hour: HM_HOURS[j] }; }));
  const peakHour = byHour.reduce((best, v, j) => (v > best.v ? { v, hour: HM_HOURS[j] } : best), { v: 0, hour: null });
  return { grid, byHour, byDay, max, total, outside, peak, peakHour, start, end };
}

function hmFormat(v, measure) {
  if (!v) return '';
  if (measure === 'time') return v >= 60 ? `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v)}m`;
  return String(Math.round(v));
}

function hmLevel(v, max) { return v && max ? Math.max(1, Math.min(5, Math.ceil(v / max * 5))) : 0; }

// Rendu dans un conteneur. opts.compact : une seule ligne (somme des jours) pour la vue d'ensemble.
function taskinHeatmapRender(container, opts = {}) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;
  const id = opts.id || el.id || 'heatmap';
  const st = hmDefaults(id, opts.preset);
  const data = hmCompute(st);
  const agents = hmAgents().filter(a => st.pole === 'all' || a.pole === st.pole);
  const sources = [...new Set((typeof entries !== 'undefined' ? entries : []).map(e => e.source || 'manual'))].sort();
  const sel = (key, options) => `<select class="form-input hm-select" data-hm="${key}">${options.map(([v, l]) => `<option value="${v}" ${String(st[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const unit = st.measure === 'time' ? 'temps traité' : 'traitements';
  const cell = (v, title) => `<span class="hm-cell hm-l${hmLevel(v, data.max)}" title="${title}">${hmFormat(v, st.measure)}</span>`;
  const rows = opts.compact
    ? `<div class="hm-row"><b>Total</b>${data.byHour.map((v, j) => cell(v, `${HM_HOURS[j]}h–${HM_HOURS[j] + 1}h : ${hmFormat(v, st.measure) || 0} ${unit}`)).join('')}</div>`
    : data.grid.map((row, i) => `<div class="hm-row"><b>${HM_DAYS[i]}</b>${row.map((v, j) => cell(v, `${HM_DAYS[i]} ${HM_HOURS[j]}h–${HM_HOURS[j] + 1}h : ${hmFormat(v, st.measure) || 0} ${unit}`)).join('')}<em>${hmFormat(data.byDay[i], st.measure) || '·'}</em></div>`).join('')
      + `<div class="hm-row hm-total"><b>Total</b>${data.byHour.map(v => `<span>${hmFormat(v, st.measure) || '·'}</span>`).join('')}<em>${hmFormat(data.total, st.measure) || '0'}</em></div>`;
  el.innerHTML = `<div class="hm ${opts.compact ? 'hm-compact' : ''}">
    <div class="hm-filters">
      ${sel('period', [['today', 'Aujourd’hui'], ['7d', '7 derniers jours'], ['28d', '4 dernières semaines'], ['month', 'Mois en cours'], ['prev-month', 'Mois précédent'], ['custom', 'Période…']])}
      ${st.period === 'custom' ? `<input type="date" class="form-input hm-date" data-hm="from" value="${st.from}"><input type="date" class="form-input hm-date" data-hm="to" value="${st.to}">` : ''}
      ${sel('pole', [['all', 'Tous les pôles'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']])}
      ${sel('agent', [['all', 'Tous les agents'], ...agents.map(a => [a.id, escHtml(a.name)])])}
      ${sel('source', [['all', 'Tous les canaux'], ...sources.map(s => [s, HM_SOURCES[s] || escHtml(s)])])}
      ${sel('measure', [['count', 'Nombre de traitements'], ['time', 'Temps traité']])}
    </div>
    <div class="hm-scroll"><div class="hm-grid">
      <div class="hm-row hm-head"><b></b>${HM_HOURS.map(h => `<small>${h}h</small>`).join('')}${opts.compact ? '' : '<em>Total</em>'}</div>
      ${rows}
    </div></div>
    <div class="hm-foot">
      <span class="hm-legend">Faible ${[1, 2, 3, 4, 5].map(l => `<i class="hm-l${l}"></i>`).join('')} Fort</span>
      <span>${data.total ? `Pointe : <b>${opts.compact ? `${data.peakHour.hour}h–${data.peakHour.hour + 1}h` : `${data.peak.day} ${data.peak.hour}h–${data.peak.hour + 1}h`}</b> (${hmFormat(opts.compact ? data.peakHour.v : data.peak.v, st.measure)})` : 'Aucun traitement sur la période.'}${data.outside ? ` · ${hmFormat(data.outside, st.measure)} hors 7h–23h non affiché${data.outside > 1 ? 's' : ''}` : ''}</span>
    </div>
  </div>`;
  el.querySelectorAll('[data-hm]').forEach(input => input.addEventListener('change', () => {
    st[input.dataset.hm] = input.value;
    if (input.dataset.hm === 'pole') st.agent = 'all';
    if (input.dataset.hm === 'period' && st.period === 'custom' && !st.from) { const t = new Date(); st.to = hmLocalDay(t); t.setDate(t.getDate() - 6); st.from = hmLocalDay(t); }
    taskinHeatmapRender(el, opts);
  }));
}
window.taskinHeatmapRender = taskinHeatmapRender;
