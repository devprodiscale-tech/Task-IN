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
      <span class="hm-legend">Flux très faible ${[1, 2, 3, 4, 5].map(l => `<i class="hm-l${l}"></i>`).join('')} très fort</span>
      <span>${data.total ? `Pointe : <b>${opts.compact ? `${data.peakHour.hour}h–${data.peakHour.hour + 1}h` : `${data.peak.day} ${data.peak.hour}h–${data.peak.hour + 1}h`}</b> (${hmFormat(opts.compact ? data.peakHour.v : data.peak.v, st.measure)})` : 'Aucun traitement sur la période.'}${data.outside ? ` · ${hmFormat(data.outside, st.measure)} hors 7h–23h non affiché${data.outside > 1 ? 's' : ''}` : ''}</span>
    </div>
  </div>`;
  el.querySelectorAll('[data-hm]').forEach(input => input.addEventListener('change', () => {
    st[input.dataset.hm] = input.value;
    if (input.dataset.hm === 'pole') st.agent = 'all';
    if (input.dataset.hm === 'period' && st.period === 'custom' && !st.from) { const t = new Date(); st.to = hmLocalDay(t); t.setDate(t.getDate() - 6); st.from = hmLocalDay(t); }
    if (st.period === 'custom' && st.from && typeof taskinEnsureEntriesFrom === 'function') taskinEnsureEntriesFrom(st.from).then(added => { if (added) taskinHeatmapRender(el, opts); });
    taskinHeatmapRender(el, opts);
  }));
}
window.taskinHeatmapRender = taskinHeatmapRender;

// ======================= COURBE D'ÉVOLUTION (composant commun) =======================
// Traitements de l'équipe dans le temps, filtrables (granularité, période, pôle, agent, mesure), pour
// repérer tout de suite les mois de forte activité. Une seule échelle : sans agent choisi, le total de
// l'équipe ; avec un agent, l'agent comparé à la moyenne par agent actif de l'équipe (même unité).
// Couleurs fixes par entité (équipe = bleu, agent = orange), palette validée clair / sombre.
const trState = {};
const TR_GRAN = { day: 'Jour', week: 'Semaine', month: 'Mois' };
const TR_SPAN = { '3m': '3 mois', '6m': '6 mois', '12m': '12 mois', all: 'Tout l’historique' };

function trDefaults(id, preset = {}) {
  if (!trState[id]) trState[id] = { gran: 'month', span: '12m', pole: 'all', agent: 'all', measure: 'count', ...preset };
  return trState[id];
}
function trBucketStart(date, gran) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (gran === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  if (gran === 'month') d.setDate(1);
  return d;
}
function trNext(d, gran) { const n = new Date(d); if (gran === 'day') n.setDate(n.getDate() + 1); else if (gran === 'week') n.setDate(n.getDate() + 7); else n.setMonth(n.getMonth() + 1); return n; }
function trLabel(d, gran, long = false) {
  if (gran === 'month') return d.toLocaleDateString('fr-FR', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }).replace('.', '');
  if (gran === 'week') return (long ? 'semaine du ' : '') + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace('.', '');
  return d.toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' }).replace('.', '');
}

// Agrégats journaliers serveur (agent × jour) : la courbe couvre 12 mois / tout l'historique sans
// télécharger chaque traitement. Tant qu'ils ne sont pas arrivés, on calcule sur les traitements chargés.
const trDaily = { rows: null, at: 0, loading: null };
async function trLoadDaily() {
  if (trDaily.loading) return trDaily.loading;
  if (trDaily.rows && Date.now() - trDaily.at < 5 * 60000) return trDaily.rows;
  if (typeof dispatchRest !== 'function') return null;
  trDaily.loading = (async () => {
    const all = [];
    for (let offset = 0; offset < 200000; ) {
      const page = await dispatchRest(`rpc/taskin_entries_daily?order=day.asc,agent_id.asc&limit=1000&offset=${offset}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!Array.isArray(page) || !page.length) break;
      all.push(...page);
      if (page.length < 1000) break;
      offset += page.length;
    }
    trDaily.rows = all; trDaily.at = Date.now();
    return all;
  })().catch(e => { console.warn('Agrégats journaliers indisponibles:', e); return null; }).finally(() => { trDaily.loading = null; });
  return trDaily.loading;
}
function trPoints() {
  if (trDaily.rows?.length) return trDaily.rows.map(r => { const [y, m, d] = String(r.day).split('-').map(Number); return { agent: r.agent_id, d: new Date(y, m - 1, d), n: Number(r.n) || 0, secs: Number(r.seconds) || 0 }; });
  return (typeof entries !== 'undefined' ? entries : []).map(e => ({ agent: e.agent, d: typeof getEntryDate === 'function' ? getEntryDate(e.startTimeStr) : new Date(e.startTimeStr), n: 1, secs: Number(e.durationSec || 0) })).filter(x => x.d && !Number.isNaN(x.d.getTime()));
}

function trCompute(st) {
  const poleOf = Object.fromEntries(hmAgents().map(a => [a.id, a.pole || '']));
  const scoped = trPoints().filter(x => poleOf[x.agent] !== undefined && (st.pole === 'all' || poleOf[x.agent] === st.pole));
  const now = new Date();
  let start = new Date(now);
  if (st.span === 'all') start = scoped.length ? new Date(scoped.reduce((m, x) => Math.min(m, x.d.getTime()), Infinity)) : new Date(now.getFullYear(), now.getMonth(), 1);
  else start.setMonth(start.getMonth() - Number(st.span.replace('m', '')) + 1, 1);
  if (st.span !== 'all') start.setDate(1);
  const buckets = [];
  for (let b = trBucketStart(start, st.gran); b <= now && buckets.length < 800; b = trNext(b, st.gran)) buckets.push({ start: b, team: 0, agents: new Set(), agent: 0 });
  const index = new Map(buckets.map((b, i) => [b.start.getTime(), i]));
  scoped.forEach(({ agent, d, n, secs }) => {
    const i = index.get(trBucketStart(d, st.gran).getTime());
    if (i === undefined) return;
    const v = st.measure === 'time' ? secs / 3600 : n;
    buckets[i].team += v; buckets[i].agents.add(agent);
    if (agent === st.agent) buckets[i].agent += v;
  });
  const solo = st.agent !== 'all';
  const series = solo
    ? [{ key: 'team', name: 'Moyenne par agent (équipe)', short: 'Moy. équipe', values: buckets.map(b => (b.agents.size ? b.team / b.agents.size : 0)) },
       { key: 'agent', name: (TEAM || []).find(u => u.id === st.agent)?.name || 'Agent', values: buckets.map(b => b.agent) }]
    : [{ key: 'team', name: st.pole === 'all' ? 'Équipe (total)' : `Pôle ${String(st.pole).toUpperCase()} (total)`, values: buckets.map(b => b.team) }];
  return { buckets, series, solo };
}
function trFmt(v, measure) { return measure === 'time' ? `${(Math.round(v * 10) / 10).toString().replace('.', ',')} h` : String(Math.round(v * 10) / 10).replace('.', ','); }

function taskinTrendRender(container, opts = {}) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;
  const id = opts.id || el.id || 'trend';
  const st = trDefaults(id, opts.preset);
  if (!trDaily.rows || Date.now() - trDaily.at >= 5 * 60000) trLoadDaily().then(rows => { if (rows && el.isConnected) taskinTrendRender(el, opts); });
  if (st.agent !== 'all' && !hmAgents().some(a => a.id === st.agent && (st.pole === 'all' || a.pole === st.pole))) st.agent = 'all';
  const { buckets, series, solo } = trCompute(st);
  const agents = hmAgents().filter(a => st.pole === 'all' || a.pole === st.pole);
  const sel = (key, options) => `<select class="form-input hm-select" data-tr="${key}" aria-label="${{ gran: 'Granularité', span: 'Période', pole: 'Pôle', agent: 'Agent', measure: 'Mesure' }[key]}">${options.map(([v, l]) => `<option value="${v}" ${String(st[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  // Dessiné à la largeur réelle : le texte reste à sa taille, quelle que soit la largeur de l'écran.
  const W = Math.max(320, Math.round(el.clientWidth || 800)), H = W < 560 ? 220 : 250, L = 44, R = W < 560 ? 90 : 130, T = 18, B = 30, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const step = (() => { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw); })();
  const top = Math.ceil(max / step) * step;
  const x = i => L + (buckets.length > 1 ? i / (buckets.length - 1) * iw : iw / 2);
  const y = v => T + ih - v / top * ih;
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(3, Math.floor(iw / 80))));
  const grid = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step).map(v => `<line x1="${L}" x2="${L + iw}" y1="${y(v)}" y2="${y(v)}" class="tr-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="tr-axis" text-anchor="end">${trFmt(v, st.measure)}</text>`).join('');
  const xlabels = buckets.map((b, i) => (i % every === 0 || i === buckets.length - 1) && !(i !== buckets.length - 1 && buckets.length - 1 - i < every) ? `<text x="${x(i)}" y="${H - 8}" class="tr-axis" text-anchor="middle">${escHtml(trLabel(b.start, st.gran))}</text>` : '').join('');
  const path = s => s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  // Étiquettes directes en bout de courbe, écartées si elles se chevauchent.
  const ends = series.map(s => ({ s, y: y(s.values[s.values.length - 1] || 0) }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 16) { const mid = (ends[0].y + ends[1].y) / 2, up = ends[0].y <= ends[1].y ? 0 : 1; ends[up].y = mid - 8; ends[1 - up].y = mid + 8; }
  const lines = series.map(s => `<path d="${path(s)}" class="tr-line tr-${s.key}"/>`).join('');
  const labels = ends.map(({ s, y: yy }) => `<text x="${L + iw + 8}" y="${yy + 4}" class="tr-end">${escHtml((n => n.length > (W < 560 ? 12 : 17) ? n.slice(0, W < 560 ? 11 : 16) + '…' : n)(s.short || s.name))}</text>`).join('');
  // Pics : les 3 périodes les plus chargées (équipe), pour lire tout de suite les mois de forte activité.
  const teamVals = series[0].values;
  const peaks = teamVals.map((v, i) => ({ v, i })).filter(p => p.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const peakDots = peaks.length && peaks[0].v ? `<circle cx="${x(peaks[0].i)}" cy="${y(peaks[0].v)}" r="5" class="tr-peak"/><text x="${x(peaks[0].i)}" y="${Math.max(T + 10, y(peaks[0].v) - 10)}" text-anchor="middle" class="tr-peak-label">pic · ${trFmt(peaks[0].v, st.measure)}</text>` : '';
  const total = teamVals.reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="tr">
    <div class="hm-filters">
      ${sel('gran', Object.entries(TR_GRAN))}${sel('span', Object.entries(TR_SPAN))}
      ${sel('pole', [['all', 'Tous les pôles'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']])}
      ${sel('agent', [['all', 'Équipe (sans comparaison)'], ...agents.map(a => [a.id, `${escHtml(a.name)} vs équipe`])])}
      ${sel('measure', [['count', 'Nombre de traitements'], ['time', 'Temps traité (heures)']])}
    </div>
    ${solo ? `<div class="tr-legend">${series.map(s => `<span><i class="tr-key tr-${s.key}"></i>${escHtml(s.name)}</span>`).join('')}</div>` : ''}
    ${total ? `<div class="tr-plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe d'évolution : ${escHtml(series.map(s => s.name).join(' et '))}">${grid}${xlabels}${lines}${peakDots}${labels}
      <g class="tr-hover" visibility="hidden"><line class="tr-cross" y1="${T}" y2="${T + ih}" x1="0" x2="0"/>${series.map(s => `<circle r="4.5" class="tr-dot tr-${s.key}" cx="0" cy="0"/>`).join('')}</g>
      <rect x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent" class="tr-hit"/></svg><div class="tr-tip" hidden></div></div>
    <div class="tr-foot"><span>${peaks.length ? `Périodes les plus chargées : ${peaks.map(p => `<b>${escHtml(trLabel(buckets[p.i].start, st.gran, true))}</b> (${trFmt(p.v, st.measure)})`).join(' · ')}` : ''}</span>
      <details><summary>Voir les données</summary><div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>${TR_GRAN[st.gran]}</th>${series.map(s => `<th>${escHtml(s.name)}</th>`).join('')}</tr></thead><tbody>${buckets.map((b, i) => `<tr><td>${escHtml(trLabel(b.start, st.gran, true))}</td>${series.map(s => `<td>${trFmt(s.values[i], st.measure)}</td>`).join('')}</tr>`).reverse().join('')}</tbody></table></div></details></div>`
    : '<p class="hm-foot">Aucun traitement sur la période choisie.</p>'}
  </div>`;
  el.querySelectorAll('[data-tr]').forEach(input => input.addEventListener('change', () => {
    st[input.dataset.tr] = input.value;
    if (input.dataset.tr === 'gran' && input.value === 'day' && ['12m', 'all'].includes(st.span)) st.span = '3m'; // lisibilité
    taskinTrendRender(el, opts);
  }));
  // Survol : réticule + infobulle avec les valeurs de chaque série.
  const svg = el.querySelector('svg'), tip = el.querySelector('.tr-tip');
  if (!svg) return;
  const move = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
    const i = Math.max(0, Math.min(buckets.length - 1, Math.round((px - L) / (buckets.length > 1 ? iw / (buckets.length - 1) : 1))));
    svg.querySelector('.tr-hover').setAttribute('visibility', 'visible');
    svg.querySelector('.tr-cross').setAttribute('x1', x(i)); svg.querySelector('.tr-cross').setAttribute('x2', x(i));
    svg.querySelectorAll('.tr-dot').forEach((dot, k) => { dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(series[k].values[i])); });
    tip.hidden = false;
    tip.innerHTML = `<b>${escHtml(trLabel(buckets[i].start, st.gran, true))}</b>${series.map(s => `<span><i class="tr-key tr-${s.key}"></i>${escHtml(s.name)} <strong>${trFmt(s.values[i], st.measure)}</strong></span>`).join('')}${solo ? '' : `<small>${buckets[i].agents.size} agent${buckets[i].agents.size > 1 ? 's' : ''} actif${buckets[i].agents.size > 1 ? 's' : ''}</small>`}`;
    const left = x(i) / W * r.width;
    tip.style.left = `${Math.min(Math.max(left, 80), r.width - 80)}px`;
  };
  const leave = () => { tip.hidden = true; svg.querySelector('.tr-hover').setAttribute('visibility', 'hidden'); };
  const hit = svg.querySelector('.tr-hit');
  hit.addEventListener('mousemove', move); hit.addEventListener('mouseleave', leave);
  hit.addEventListener('touchstart', ev => move(ev.touches[0]), { passive: true });
  // Redessin quand la largeur change (fenêtre, menu replié…).
  if (!el._trResize && typeof ResizeObserver === 'function') {
    let last = el.clientWidth, timer = 0;
    el._trResize = new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) < 8) return; last = el.clientWidth; clearTimeout(timer); timer = setTimeout(() => el.isConnected && taskinTrendRender(el, opts), 120); });
    el._trResize.observe(el);
  }
}
window.taskinTrendRender = taskinTrendRender;
