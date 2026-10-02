// ===== P2 : LEADERBOARD =====
let lbPeriod = 'day';
// Période libre du classement (« Période… ») : dates De / À propres au classement.
let lbCustom = { from: '', to: '' };
// Classement : l'encadrant choisit les KPI qui le composent et le critère de tri.
// Les évaluations (production et qualité) diffèrent d'une équipe à l'autre : chaque agent est donc noté
// PAR RAPPORT AUX AGENTS DE SON PÔLE, KPI par KPI (note 0–100 : 100 = meilleur du pôle sur la période,
// 0 = le moins bon ; sens « plus haut » ou « plus bas » propre à chaque KPI). Score global = moyenne des
// notes. « Production » compte les canaux propres au pôle (FO : entrants, chat, e-mails ; BO : tickets,
// e-mails ; Reconf : appels sortants) ; le FRT ne s'applique pas au BO (pas de première réponse).
const LB_KPIS = [
  { key: 'prod', label: 'Production du pôle', better: 'high', fmt: v => String(v) },
  { key: 'volume', label: 'Traitements', better: 'high', fmt: v => String(v) },
  { key: 'time', label: 'Temps traité', better: 'high', fmt: v => `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}` },
  { key: 'dmt', label: 'DMT moy.', better: 'low', fmt: v => `${v} min` },
  { key: 'frt', label: 'FRT moy.', better: 'low', fmt: v => `${v} min` },
  { key: 'sla', label: '% in SLA', better: 'high', fmt: v => `${v} %` },
  { key: 'quality', label: 'Score qualité', better: 'high', fmt: v => `${v} %` },
  { key: 'actions', label: 'Actions OSC', better: 'high', fmt: v => String(v) },
];
const LB_DEFAULT = ['prod', 'dmt', 'sla', 'quality'];
const LB_POLE_ORDER = ['fo', 'bo', 'reconf', ''];
function lbPoleKey(a) { return ['fo', 'bo', 'reconf'].includes(a?.pole) ? a.pole : ''; }
function lbPoleName(k) { return { fo: 'Front Office', bo: 'Back Office', reconf: 'Reconfirmation' }[k] || 'Sans pôle'; }
// Canaux de production d'un pôle (tous les canaux pour un agent sans pôle).
function lbProdSources(k) { return (typeof AGENT_POLES !== 'undefined' && AGENT_POLES[k]?.primary) || null; }
let lbSortKey = 'score';
let lbSortAsc = false;
let lbOscCache = { key: '', rows: [] };
// Filtre par type d'agent (pôle) : les notes 0–100 sont recalculées entre agents du même périmètre.
let lbPole = (() => { try { return localStorage.getItem('taskin_lb_pole') || 'all'; } catch (_) { return 'all'; } })();
function lbSetPole(pole) {
  lbPole = ['fo', 'bo', 'reconf'].includes(pole) ? pole : 'all';
  try { localStorage.setItem('taskin_lb_pole', lbPole); } catch (_) {}
  renderLeaderboard();
}

function lbPrefsKey() { return `taskin_lb_kpis_${currentUser?.id || 'x'}`; }
function lbSelected() {
  try { const v = JSON.parse(localStorage.getItem(lbPrefsKey()) || 'null'); if (Array.isArray(v) && v.length) return v.filter(k => LB_KPIS.some(x => x.key === k)); } catch (_) {}
  return LB_DEFAULT.slice();
}
function lbToggleKpi(key) {
  let sel = lbSelected();
  sel = sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key];
  if (!sel.length) return; // au moins un KPI
  sel = LB_KPIS.map(k => k.key).filter(k => sel.includes(k));
  try { localStorage.setItem(lbPrefsKey(), JSON.stringify(sel)); } catch (_) {}
  if (lbSortKey !== 'score' && lbSortKey !== 'name' && !sel.includes(lbSortKey)) lbSortKey = 'score';
  renderLeaderboard();
}
function lbSetSort(value) {
  const [key, dir] = value.split(':');
  lbSortKey = key; lbSortAsc = dir === 'asc';
  renderLeaderboard();
}

function setLbPeriod(p, btn) {
  lbPeriod = p;
  if (p === 'custom' && !lbCustom.from) lbCustom = taskinDefaultCustom();
  lbPaintRange();
  // Synchroniser aussi l'accordéon Vue Globale
  supPeriod = p;
  document.querySelectorAll('.sup-period-btn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  renderSupKpis();
  document.querySelectorAll('.lb-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLeaderboard();
}

function lbPaintRange() {
  const box = document.getElementById('lb-range');
  if (!box) return;
  box.innerHTML = lbPeriod === 'custom' ? taskinCustomRangeHtml('data-lb-range', lbCustom.from, lbCustom.to) : '';
  box.querySelectorAll('[data-lb-range]').forEach(i => i.addEventListener('change', async () => {
    lbCustom[i.dataset.lbRange] = i.value;
    if (typeof taskinEnsureEntriesFrom === 'function' && lbCustom.from) await taskinEnsureEntriesFrom(lbCustom.from).catch(() => false);
    renderSupKpis();
    renderLeaderboard();
  }));
}

function sortLeaderboard(key) {
  if (lbSortKey === key) lbSortAsc = !lbSortAsc;
  else { lbSortKey = key; const k = LB_KPIS.find(x => x.key === key); lbSortAsc = key === 'name' || k?.better === 'low'; }
  renderLeaderboard();
}

// Bornes de la période affichée (pour les actions OSC).
function lbRange() {
  const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date(), from = new Date(now);
  const fromVal = document.getElementById('filter-date-from')?.value, toVal = document.getElementById('filter-date-to')?.value;
  if (typeof dateFilterApplied !== 'undefined' && dateFilterApplied && (fromVal || toVal)) return { from: fromVal || '2000-01-01', to: toVal || day(now) };
  if (lbPeriod === 'custom') { const b = taskinPeriodBounds('custom', lbCustom.from, lbCustom.to); return { from: b.from, to: b.to }; }
  if (lbPeriod === 'week') from.setDate(now.getDate() - (now.getDay() + 6) % 7);
  else if (lbPeriod === 'month') from.setDate(1);
  else if (lbPeriod === 'all') { const f = new Date(now); f.setDate(f.getDate() - 62); return { from: day(f), to: day(now) }; }
  return { from: day(from), to: day(now) };
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
  const custom = lbPeriod === 'custom' ? taskinPeriodBounds('custom', lbCustom.from, lbCustom.to) : null;
  return entries.filter(e => {
    const d = getEntryDate(e.startTimeStr);
    if (custom) return d >= custom.start && d <= custom.end;
    if (lbPeriod === 'day')   return isToday(e.startTimeStr);
    if (lbPeriod === 'week')  return isThisWeek(e.startTimeStr);
    if (lbPeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  });
}

let qualityReviewsLoadedForLb = false;
async function renderLeaderboard() {
  // Calculé seulement quand l'onglet Classement est affiché (les filtres de date l'appellent aussi).
  if (document.getElementById('leaderboard-panel')?.classList.contains('hidden')) return;
  // Le classement peut s'ouvrir avant le module Supervision (scores qualité) : on le charge au besoin.
  if (typeof svFetchCollection !== 'function' && typeof loadModule === 'function') await loadModule('10-supervision.js');
  if (!qualityReviewsLoadedForLb) {
    qualityReviews = await svFetchCollection('qualityReviews');
    qualityReviewsLoadedForLb = true;
  }
  const sel = lbSelected();
  // Actions OSC de la période (lues seulement si le KPI est coché).
  if (sel.includes('actions') && typeof dispatchRest === 'function') {
    const r = lbRange(), key = `${r.from}|${r.to}`;
    if (lbOscCache.key !== key) {
      try { lbOscCache = { key, rows: await dispatchRest(`agent_daily_stats?select=agent_id,actions&day=gte.${r.from}&day=lte.${r.to}&limit=20000`) }; }
      catch (_) { lbOscCache = { key, rows: [] }; }
    }
  }
  const pool = getLbEntries();
  const agents = agentsOnly().filter(a => lbPole === 'all' || a.pole === lbPole);
  const rows = agents.map(a => {
    const ae = pool.filter(e => e.agent === a.id);
    const frt = ae.reduce((acc, e) => {
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
    // Qualité : moyenne des grilles de la période (sinon la dernière grille connue).
    const lbr = lbRange();
    const inPeriod = (typeof svAgentReviews === 'function' ? svAgentReviews(a.id) : []).filter(r => { const d = r.date ? TASKIN_DAY(new Date(r.date)) : ''; return d >= lbr.from && d <= lbr.to; });
    const review = svLatestReview(a.id);
    const quality = inPeriod.length ? Math.round(inPeriod.reduce((s, r) => s + svReviewPct(r), 0) / inPeriod.length) : review ? svReviewPct(review) : null;
    const pk = lbPoleKey(a), prodSrc = lbProdSources(pk);
    const osc = lbOscCache.rows.filter(x => x.agent_id === a.id && x.actions !== null && x.actions !== undefined);
    const sla = ae.length && typeof taskinSlaSplit === 'function' ? Math.round(taskinSlaSplit(ae).in / ae.length * 100) : null;
    return { agent: a, pole: pk, qualityCount: inPeriod.length, values: {
      prod: prodSrc ? ae.filter(e => prodSrc.includes(e.source)).length : ae.length,
      volume: ae.length,
      time: ae.length ? Math.round(ae.reduce((s, e) => s + e.durationSec, 0) / 60) : 0,
      dmt: ae.length ? Math.floor(ae.reduce((s, e) => s + e.durationSec, 0) / ae.length / 60) : null,
      frt: pk === 'bo' ? null : frt.length ? Math.floor(frt.reduce((s, v) => s + v, 0) / frt.length / 60) : null,
      sla,
      quality,
      actions: osc.length ? osc.reduce((s, x) => s + Number(x.actions || 0), 0) : null,
    } };
  });
  // Note 0–100 par KPI coché, calculée DANS CHAQUE PÔLE, puis score global = moyenne des notes disponibles.
  // Un agent seul dans son pôle n'a pas de point de comparaison : pas de note (affiché « seul du pôle »).
  const kpis = LB_KPIS.filter(k => sel.includes(k.key));
  const groups = {};
  rows.forEach(r => (groups[r.pole] = groups[r.pole] || []).push(r));
  Object.values(groups).forEach(group => kpis.forEach(k => {
    const vals = group.map(r => r.values[k.key]).filter(v => v !== null && v !== undefined);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    group.forEach(r => {
      const v = r.values[k.key];
      r.notes = r.notes || {};
      r.alone = group.length < 2;
      r.notes[k.key] = v === null || v === undefined || vals.length < 2 ? null : hi === lo ? 100 : Math.round((k.better === 'high' ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)) * 100);
    });
  }));
  rows.forEach(r => { const n = Object.values(r.notes || {}).filter(v => v !== null); r.score = n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null; });

  const byPole = lbPole === 'all';
  rows.sort((a, b) => {
    if (byPole && a.pole !== b.pole) return LB_POLE_ORDER.indexOf(a.pole) - LB_POLE_ORDER.indexOf(b.pole);
    if (lbSortKey === 'name') return lbSortAsc ? a.agent.name.localeCompare(b.agent.name) : b.agent.name.localeCompare(a.agent.name);
    const va = lbSortKey === 'score' ? a.score : a.values[lbSortKey], vb = lbSortKey === 'score' ? b.score : b.values[lbSortKey];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return lbSortAsc ? va - vb : vb - va;
  });

  // Barre de réglages : KPI du classement + tri
  const cfg = document.getElementById('lb-config');
  if (cfg) {
    const sortOptions = [['score', 'Score global'], ...kpis.map(k => [k.key, k.label]), ['name', 'Nom']];
    const poles = [['all', 'Tous les agents'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']];
    cfg.innerHTML = `<div class="lb-config-kpis lb-config-poles"><b>Type d'agent</b>${poles.map(([k, l]) => `<button type="button" class="lb-kpi ${lbPole === k ? 'active' : ''}" aria-pressed="${lbPole === k}" onclick="lbSetPole('${k}')">${l}<small>${(n => `${n} agent${n > 1 ? 's' : ''}`)(k === 'all' ? agentsOnly().length : agentsOnly().filter(a => a.pole === k).length)}</small></button>`).join('')}</div>
      <div class="lb-config-kpis"><b>KPI du classement</b>${LB_KPIS.map(k => `<button type="button" class="lb-kpi ${sel.includes(k.key) ? 'active' : ''}" aria-pressed="${sel.includes(k.key)}" onclick="lbToggleKpi('${k.key}')">${k.label}<small>${k.better === 'high' ? '↑ mieux' : '↓ mieux'}</small></button>`).join('')}</div>
      <label class="lb-config-sort">Trier par <select class="form-input" onchange="lbSetSort(this.value)">${sortOptions.flatMap(([k, l]) => [[`${k}:desc`, `${l} · décroissant`], [`${k}:asc`, `${l} · croissant`]]).map(([v, l]) => `<option value="${v}" ${v === `${lbSortKey}:${lbSortAsc ? 'asc' : 'desc'}` ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <small class="lb-config-help">Chaque équipe a ses propres évaluations : un agent est noté uniquement par rapport aux agents de son pôle, KPI par KPI (note 0–100, 100 = meilleur du pôle sur la période). Score global : moyenne des notes des KPI cochés. « Production du pôle » ne compte que les canaux de l’équipe (FO : entrants, chat, e-mails · BO : tickets, e-mails · Reconf : appels sortants). Seuls les comptes agents sont classés.</small>`;
  }
  const head = document.getElementById('lb-head');
  const arrow = key => lbSortKey === key ? (lbSortAsc ? '↑' : '↓') : '↕';
  if (head) head.innerHTML = `<tr><th>#</th><th id="lbth-name" class="${lbSortKey === 'name' ? 'sorted' : ''}" onclick="sortLeaderboard('name')">Agent <span class="sort-arrow">${arrow('name')}</span></th><th id="lbth-score" class="${lbSortKey === 'score' ? 'sorted' : ''}" onclick="sortLeaderboard('score')">Score global <span class="sort-arrow">${arrow('score')}</span></th>${kpis.map(k => `<th id="lbth-${k.key}" class="${lbSortKey === k.key ? 'sorted' : ''}" onclick="sortLeaderboard('${k.key}')">${k.label} <span class="sort-arrow">${arrow(k.key)}</span></th>`).join('')}</tr>`;

  const body = document.getElementById('leaderboard-body');
  if (!body) return;
  if (!rows.length) { body.innerHTML = `<tr><td colspan="${kpis.length + 3}"><div class="empty">${lbPole === 'all' ? 'Aucun agent.' : 'Aucun agent dans ce pôle.'}</div></td></tr>`; return; }
  const tone = note => note === null || note === undefined ? '' : note >= 67 ? 'good' : note >= 34 ? 'warn' : 'bad';
  // Podium : pastilles or / argent / bronze dessinées en CSS (plus d'emojis).
  const rankIn = {}, poleCount = {};
  rows.forEach(r => { poleCount[r.pole] = (poleCount[r.pole] || 0) + 1; });
  let lastPole = null;
  body.innerHTML = rows.map(r => {
    rankIn[r.pole] = (rankIn[r.pole] || 0) + 1;
    const rank = byPole ? rankIn[r.pole] : rows.indexOf(r) + 1;
    let groupHead = '';
    if (byPole && r.pole !== lastPole) {
      lastPole = r.pole;
      const scored = rows.filter(x => x.pole === r.pole && x.score !== null);
      groupHead = `<tr class="lb-pole-row lb-pole-${r.pole || 'none'}"><td colspan="${kpis.length + 3}"><b>${lbPoleName(r.pole)}</b><span>${poleCount[r.pole]} agent${poleCount[r.pole] > 1 ? 's' : ''} · classement interne au pôle</span>${scored.length ? `<em>Score moyen ${Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length)}</em>` : ''}</td></tr>`;
    }
    const rankDisplay = `<span class="lb-rank-badge${rank <= 3 ? ' lb-podium-' + rank : ''}">${rank}</span>`;
    return `${groupHead}<tr>
      <td>${rankDisplay}</td>
      <td><div class="agent-cell"><div class="mini-avatar" style="background:${r.agent.color}20;color:${r.agent.color}">${escHtml(r.agent.initials)}</div>${escHtml(r.agent.name)}${lbPole === 'all' && r.agent.pole && typeof poleLabel === 'function' ? ` <em class="dr-pole dr-pole-${escHtml(r.agent.pole)}">${poleLabel(r.agent.pole)}</em>` : ''}</div></td>
      <td><span class="lb-score" ${r.alone ? 'title="Seul agent de son pôle : pas de comparaison possible"' : ''}><b>${r.score ?? '—'}</b>${r.score !== null ? `<i style="width:${r.score}%"></i>` : r.alone ? '<small>seul du pôle</small>' : ''}</span></td>
      ${kpis.map(k => { const v = r.values[k.key]; return `<td><span class="lb-val ${tone(r.notes?.[k.key])}" title="Note ${r.notes?.[k.key] ?? '—'}/100">${v === null || v === undefined ? '—' : k.fmt(v)}</span></td>`; }).join('')}
    </tr>`;
  }).join('');
}

// ===== P3 : MATRICE CANAUX =====
let matrixPeriod = 'day';
let matrixCustom = { from: '', to: '' };
let matrixChannel = 'all';

function setMatrixPeriod(p, btn) {
  matrixPeriod = p;
  if (p === 'custom' && !matrixCustom.from) matrixCustom = taskinDefaultCustom();
  const box = document.getElementById('matrix-range');
  if (box) {
    box.innerHTML = p === 'custom' ? taskinCustomRangeHtml('data-matrix-range', matrixCustom.from, matrixCustom.to) : '';
    box.querySelectorAll('[data-matrix-range]').forEach(i => i.addEventListener('change', async () => {
      matrixCustom[i.dataset.matrixRange] = i.value;
      if (typeof taskinEnsureEntriesFrom === 'function' && matrixCustom.from) await taskinEnsureEntriesFrom(matrixCustom.from).catch(() => false);
      renderChannelMatrix();
    }));
  }
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
    if (matrixPeriod === 'custom') { const b = taskinPeriodBounds('custom', matrixCustom.from, matrixCustom.to); return d >= b.start && d <= b.end; }
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
  // Filtre fait par Supabase : uniquement les entrées d'hier, sans plafond à 1000 lignes.
  const range = encodeURIComponent(\`(started_at.gte.\${dayStart.toISOString()},started_at.lte.\${dayEnd.toISOString()})\`);
  const url = \`\${SUPABASE_URL}/rest/v1/time_entries?select=id,source,description,agent_id,inbound_time,started_at,duration_seconds&and=\${range}&order=started_at.desc&limit=10000\`;
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
