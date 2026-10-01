// ======================= PILOTAGE 360° (Admin & Superviseur) =======================
// Vue descendante : Équipe → Agents → Fiche 360° d'un agent, avec une barre de filtres commune
// (période, pôle) et comparaison automatique à la période précédente de même durée.
// Les KPI viennent de toutes les sources de Task'in : timer, résultats OSC, objectifs, appels
// manqués, cas complexes, qualité, connexions, dispatch. Le choix des KPI affichés est
// personnalisable (mémorisé par utilisateur sur ce navigateur).

const PIL_FAMILIES = [
  ['volume', 'Volume'], ['prod', 'Productivité'], ['reac', 'Réactivité'], ['goals', 'Objectifs'],
  ['recall', 'Appels manqués'], ['quality', 'Qualité'], ['cases', 'Difficultés'], ['presence', 'Présence'],
];

// kind : « sum » (additionné sur l'équipe, comparé à la moyenne par agent) ou « rate » (moyenne pondérée).
// better : sens favorable pour la couleur et les évolutions.
const PIL_KPIS = [
  { key: 'treatments', fam: 'volume', label: 'Traitements chronométrés', kind: 'sum', better: 'high', fmt: 'int' },
  { key: 'time', fam: 'volume', label: 'Temps traité', kind: 'sum', better: 'high', fmt: 'min' },
  { key: 'actions', fam: 'volume', label: 'Actions OSC', kind: 'sum', better: 'high', fmt: 'int' },
  { key: 'calls', fam: 'volume', label: 'Appels OSC', kind: 'sum', better: 'high', fmt: 'int' },
  { key: 'resolved', fam: 'volume', label: 'Résolus OSC', kind: 'sum', better: 'high', fmt: 'int' },
  { key: 'crisp', fam: 'volume', label: 'Conversations Crisp', kind: 'sum', better: 'high', fmt: 'int' },
  { key: 'dmt', fam: 'prod', label: 'DMT', kind: 'rate', better: 'low', fmt: 'min1' },
  { key: 'actionsPerDay', fam: 'prod', label: 'Actions / jour saisi', kind: 'rate', better: 'high', fmt: 'dec' },
  { key: 'msgPerConv', fam: 'prod', label: 'Messages / conversation', kind: 'rate', better: 'high', fmt: 'dec' },
  { key: 'frt', fam: 'reac', label: '1re réponse (FRT)', kind: 'rate', better: 'low', fmt: 'min1' },
  { key: 'callMinutes', fam: 'reac', label: 'Temps d’appel', kind: 'sum', better: 'high', fmt: 'min' },
  { key: 'goalRate', fam: 'goals', label: 'Jours objectif atteint', kind: 'rate', better: 'high', fmt: 'pct' },
  { key: 'missed', fam: 'recall', label: 'Appels manqués', kind: 'sum', better: 'low', fmt: 'int' },
  { key: 'recallRate', fam: 'recall', label: 'Taux de rappel', kind: 'rate', better: 'high', fmt: 'pct' },
  { key: 'quality', fam: 'quality', label: 'Score qualité (écoutes)', kind: 'rate', better: 'high', fmt: 'pct' },
  { key: 'openCases', fam: 'cases', label: 'Cas complexes ouverts', kind: 'sum', better: 'low', fmt: 'int' },
  { key: 'reported', fam: 'cases', label: 'Difficultés signalées', kind: 'sum', better: 'neutral', fmt: 'int' },
  { key: 'connected', fam: 'presence', label: 'Temps connecté', kind: 'sum', better: 'high', fmt: 'min' },
  { key: 'daysActive', fam: 'presence', label: 'Jours actifs', kind: 'sum', better: 'high', fmt: 'int' },
];
const PIL_DEFAULT = ['treatments', 'actions', 'calls', 'dmt', 'actionsPerDay', 'goalRate', 'recallRate', 'quality', 'openCases', 'connected'];

let pilState = { period: '28d', pole: 'all', from: '', to: '', agent: '', sort: 'actions', dir: -1, data: null, loading: false, error: '', custom: false, views: null, activeView: '', saving: false };

function pilEl(id) { return document.getElementById(id); }
function pilDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function pilParse(day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); }
function pilShift(day, n) { const d = pilParse(day); d.setDate(d.getDate() + n); return pilDay(d); }
function pilDays(from, to) { const out = []; for (let d = from; d <= to; d = pilShift(d, 1)) out.push(d); return out; }
function pilAgents() { const a = typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(u => u.role === 'agent'); return pilState.pole === 'all' ? a : a.filter(x => x.pole === pilState.pole); }
function pilPrefsKey() { return `taskin_pilotage_kpis_${currentUser?.id || 'x'}`; }
function pilSelected() {
  try { const v = JSON.parse(localStorage.getItem(pilPrefsKey()) || 'null'); if (Array.isArray(v) && v.length) return v.filter(k => PIL_KPIS.some(x => x.key === k)); } catch (_) {}
  return PIL_DEFAULT.slice();
}

function pilRange() {
  const today = pilDay(new Date());
  let from = today, to = today;
  if (pilState.period === '7d') from = pilShift(today, -6);
  else if (pilState.period === '28d') from = pilShift(today, -27);
  else if (pilState.period === 'month') from = today.slice(0, 8) + '01';
  else if (pilState.period === 'prev-month') { const d = new Date(); const first = new Date(d.getFullYear(), d.getMonth() - 1, 1), last = new Date(d.getFullYear(), d.getMonth(), 0); from = pilDay(first); to = pilDay(last); }
  else if (pilState.period === 'custom' && pilState.from && pilState.to) [from, to] = pilState.from <= pilState.to ? [pilState.from, pilState.to] : [pilState.to, pilState.from];
  const len = pilDays(from, to).length;
  return { from, to, prevFrom: pilShift(from, -len), prevTo: pilShift(from, -1), len };
}

async function pilFetch(path) { return typeof dispatchRest === 'function' ? dispatchRest(path) : []; }

async function pilLoad() {
  const r = pilRange();
  const key = `${r.prevFrom}|${r.to}`;
  pilState.loading = true; pilState.error = ''; pilState.key = key;
  pilPaint();
  try {
    const startIso = pilParse(r.prevFrom).toISOString(), endIso = pilParse(pilShift(r.to, 1)).toISOString();
    const [osc, goals, missed, cases, sessions, policy] = await Promise.all([
      pilFetch(`agent_daily_stats?select=*&day=gte.${pilShift(r.prevFrom, -7)}&day=lte.${r.to}&limit=10000`),
      pilFetch(`agent_daily_goals?select=*&day=gte.${r.prevFrom}&day=lte.${r.to}&limit=10000`),
      pilFetch(`missed_calls?select=call_date,agent_id,callback&call_date=gte.${r.prevFrom}&call_date=lte.${r.to}&limit=10000`),
      pilFetch('complex_cases?select=id,agent_id,status,data,created_at&limit=2000'),
      pilFetch(`agent_sessions?select=agent_id,event,created_at&created_at=gte.${encodeURIComponent(startIso)}&created_at=lt.${encodeURIComponent(endIso)}&order=created_at.asc&limit=20000`),
      window.taskinDataProviders?.active?.().getSetting('daily_goal_policy').catch(() => null),
    ]);
    if (typeof loadModule === 'function' && typeof svLoadSupervisionData !== 'function') await loadModule('10-supervision.js');
    if (typeof svLoadSupervisionData === 'function' && !(typeof qualityReviews !== 'undefined' && qualityReviews.length)) await svLoadSupervisionData().catch(() => {});
    if (pilState.key !== key) return;
    pilState.data = { range: r, osc, goals, missed, cases, sessions, progress: Number(policy?.value?.progress ?? 5) };
  } catch (e) {
    if (pilState.key !== key) return;
    pilState.error = e.message;
  }
  pilState.loading = false;
  pilPaint();
}

// ---------- Calcul des KPI ----------
function pilInRange(day, from, to) { return day >= from && day <= to; }

function pilConnected(sessions, agentId, from, to) {
  const rows = sessions.filter(s => s.agent_id === agentId);
  const lo = pilParse(from).getTime(), hi = pilParse(pilShift(to, 1)).getTime();
  let total = 0, open = null;
  const close = end => { if (open !== null) { const a = Math.max(open, lo), b = Math.min(end, hi); if (b > a) total += b - a; open = null; } };
  rows.forEach(s => {
    const t = new Date(s.created_at).getTime();
    if (s.event === 'login') { if (open !== null) close(Math.min(t, new Date(open).setHours(23, 59, 59, 999))); open = t; }
    else close(t);
  });
  if (open !== null) close(Math.min(Date.now(), new Date(open).setHours(23, 59, 59, 999)));
  return total / 60000;
}

function pilGoalReached(d, agentId, day) {
  const row = d.osc.find(x => x.agent_id === agentId && x.day === day);
  if (!row || row.actions === null || row.actions === undefined) return null;
  let ref = null;
  for (let i = 1; i <= 7 && !ref; i++) { const r = d.osc.find(x => x.agent_id === agentId && x.day === pilShift(day, -i)); if (r && r.actions !== null && r.actions !== undefined) ref = r; }
  const override = d.goals.find(g => g.agent_id === agentId && g.day === day)?.goals?.actions;
  const goal = override !== undefined && override !== null && override !== '' ? Number(override) : ref && ref.actions > 0 ? Math.ceil(Math.round(ref.actions * (100 + d.progress)) / 100) : null;
  return goal ? row.actions >= goal : null;
}

// Valeurs brutes (numérateur / dénominateur) d'un agent sur une plage : permet d'agréger l'équipe proprement.
function pilRaw(d, agentId, from, to) {
  const inR = day => pilInRange(day, from, to);
  const ents = (typeof entries !== 'undefined' ? entries : []).filter(e => e.agent === agentId && e.startTimeStr && inR(pilDay(new Date(e.startTimeStr))));
  const osc = d.osc.filter(x => x.agent_id === agentId && inR(x.day));
  const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const has = (list, f) => list.some(x => f(x) !== null && f(x) !== undefined);
  const frt = ents.filter(e => e.inboundTime && /^\d{2}:\d{2}$/.test(e.inboundTime)).map(e => {
    const start = new Date(e.startTimeStr); const [h, m] = e.inboundTime.split(':').map(Number);
    const inb = new Date(start); inb.setHours(h, m, 0, 0); return (start - inb) / 60000;
  }).filter(v => v >= 0 && v < 24 * 60);
  const missed = d.missed.filter(x => x.agent_id === agentId && inR(x.call_date));
  const reviews = (typeof qualityReviews !== 'undefined' ? qualityReviews : []).filter(rv => rv.agentId === agentId && rv.date && inR(pilDay(new Date(rv.date))));
  const days = pilDays(from, to);
  const reached = days.map(day => pilGoalReached(d, agentId, day)).filter(v => v !== null);
  const sessionDays = new Set(d.sessions.filter(s => s.agent_id === agentId && s.event === 'login').map(s => pilDay(new Date(s.created_at))).filter(inR));
  ents.forEach(e => sessionDays.add(pilDay(new Date(e.startTimeStr))));
  osc.forEach(x => sessionDays.add(x.day));
  const crispConv = sum(osc, x => x.crisp_conversations), crispMsg = sum(osc, x => x.crisp_messages);
  return {
    treatments: { n: ents.length }, time: { n: sum(ents, e => e.durationSec) / 60 },
    actions: has(osc, x => x.actions) ? { n: sum(osc, x => x.actions) } : null,
    calls: has(osc, x => x.calls_in ?? x.calls_out) ? { n: sum(osc, x => (x.calls_in || 0) + (x.calls_out || 0)) } : null,
    resolved: has(osc, x => x.resolved) ? { n: sum(osc, x => x.resolved) } : null,
    crisp: has(osc, x => x.crisp_conversations) ? { n: crispConv } : null,
    dmt: ents.length ? { num: sum(ents, e => e.durationSec) / 60, den: ents.length } : null,
    actionsPerDay: has(osc, x => x.actions) ? { num: sum(osc, x => x.actions), den: osc.filter(x => x.actions !== null && x.actions !== undefined).length } : null,
    msgPerConv: crispConv && crispMsg ? { num: crispMsg, den: crispConv } : null,
    frt: frt.length ? { num: frt.reduce((a, b) => a + b, 0), den: frt.length } : null,
    callMinutes: has(osc, x => x.call_minutes) ? { n: sum(osc, x => x.call_minutes) } : null,
    goalRate: reached.length ? { num: reached.filter(Boolean).length * 100, den: reached.length } : null,
    missed: { n: missed.length },
    recallRate: missed.length ? { num: missed.filter(x => ['5', '10', '10+'].includes(x.callback)).length * 100, den: missed.length } : null,
    quality: reviews.length ? { num: reviews.reduce((s, rv) => s + (typeof svReviewPct === 'function' ? svReviewPct(rv) : 0), 0), den: reviews.length } : null,
    openCases: { n: d.cases.filter(c => c.agent_id === agentId && c.status !== 'resolu').length },
    reported: { n: d.cases.filter(c => c.agent_id === agentId && c.data?.reportedBy === agentId && inR(pilDay(new Date(c.created_at)))).length },
    connected: { n: pilConnected(d.sessions, agentId, from, to) },
    daysActive: { n: sessionDays.size },
  };
}
function pilValue(raw) { if (!raw) return null; return 'n' in raw ? raw.n : raw.den ? raw.num / raw.den : null; }

function pilCompute() {
  const d = pilState.data;
  if (!d) return null;
  const { from, to, prevFrom, prevTo } = d.range;
  const agents = pilAgents();
  const rows = agents.map(a => ({ agent: a, cur: pilRaw(d, a.id, from, to), prev: pilRaw(d, a.id, prevFrom, prevTo) }));
  const team = which => Object.fromEntries(PIL_KPIS.map(k => {
    const list = rows.map(r => r[which][k.key]).filter(Boolean);
    if (!list.length) return [k.key, null];
    if (k.kind === 'sum') return [k.key, { n: list.reduce((s, x) => s + x.n, 0), perAgent: list.reduce((s, x) => s + x.n, 0) / list.length }];
    const num = list.reduce((s, x) => s + x.num, 0), den = list.reduce((s, x) => s + x.den, 0);
    return [k.key, den ? { num, den } : null];
  }));
  return { rows, team: team('cur'), teamPrev: team('prev'), range: d.range };
}

// ---------- Mise en forme ----------
function pilFmt(v, fmt) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (fmt === 'int') return String(Math.round(v));
  if (fmt === 'pct') return `${Math.round(v)} %`;
  if (fmt === 'dec') return String(Math.round(v * 10) / 10).replace('.', ',');
  if (fmt === 'min1') return `${String(Math.round(v * 10) / 10).replace('.', ',')} min`;
  if (fmt === 'min') return v >= 60 ? `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v)} min`;
  return String(v);
}
function pilDelta(cur, prev, k) {
  if (cur === null || prev === null || prev === undefined || !prev) return '';
  const pct = (cur - prev) / Math.abs(prev) * 100;
  if (Math.abs(pct) < 0.5) return '<em class="pil-d">=</em>';
  const good = k.better === 'neutral' ? null : (pct > 0) === (k.better === 'high');
  return `<em class="pil-d ${good === null ? '' : good ? 'is-good' : 'is-bad'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(pct))} %</em>`;
}
// Couleur d'une cellule agent vs référence équipe (moyenne par agent pour les sommes).
function pilTone(v, ref, k) {
  if (v === null || ref === null || ref === undefined || k.better === 'neutral' || !ref) return '';
  const ratio = v / ref;
  const good = k.better === 'high' ? ratio >= 1.05 : ratio <= 0.95;
  const bad = k.better === 'high' ? ratio <= 0.85 : ratio >= 1.15;
  return good ? 'is-good' : bad ? 'is-bad' : '';
}
function pilTeamRef(team, k) { const t = team[k.key]; return !t ? null : k.kind === 'sum' ? t.perAgent : t.den ? t.num / t.den : null; }

// ---------- Rendu ----------
function pilSwitchHtml() {
  if (currentUser?.role !== 'admin') return '';
  return `<div class="dr-switch" role="tablist"><button type="button" class="active" aria-selected="true">Pilotage 360°</button><button type="button" onclick="switchTab('stat', document.querySelector('[data-admin-nav=&quot;stat&quot;]'))">Analyse</button><button type="button" onclick="switchTab('results')">Résultats OSC</button><button type="button" onclick="switchTab('missed')">Appels manqués</button></div>`;
}

function pilFiltersHtml() {
  const periods = [['7d', '7 jours'], ['28d', '4 semaines'], ['month', 'Ce mois'], ['prev-month', 'Mois précédent'], ['custom', 'Période…']];
  const r = pilRange();
  return `<div class="pil-filters">
    <div class="dr-poles">${periods.map(([k, l]) => `<button type="button" class="${pilState.period === k ? 'active' : ''}" onclick="pilSet('period','${k}')">${l}</button>`).join('')}</div>
    ${pilState.period === 'custom' ? `<span class="mc-custom"><input type="date" class="form-input" id="pil-from" value="${pilState.from}" max="${pilDay(new Date())}" onchange="pilSetCustom()"> → <input type="date" class="form-input" id="pil-to" value="${pilState.to}" max="${pilDay(new Date())}" onchange="pilSetCustom()"></span>` : ''}
    <div class="dr-poles">${[['all', 'Tous les pôles'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']].map(([k, l]) => `<button type="button" class="${pilState.pole === k ? 'active' : ''}" onclick="pilSet('pole','${k}')">${l}</button>`).join('')}</div>
    <span class="pil-range">Du ${pilParse(r.from).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${pilParse(r.to).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · comparé aux ${r.len} jours précédents</span>
  </div>`;
}

function pilSet(key, value) {
  pilState[key] = value; pilState.activeView = '';
  if (key === 'period' && value === 'custom' && !pilState.from) { pilState.to = pilDay(new Date()); pilState.from = pilShift(pilState.to, -13); }
  if (key === 'pole') { pilPaint(); return; }
  pilLoad();
}
function pilSetCustom() { const f = pilEl('pil-from').value, t = pilEl('pil-to').value; if (f && t) { pilState.from = f; pilState.to = t; pilState.activeView = ''; pilLoad(); } }

async function renderPilotage() {
  if (!pilEl('pilotage-panel') || !currentUser) return;
  pilState.agent = '';
  if (!pilState.views) pilLoadViews();
  await pilLoad();
}

// ---------- Vues enregistrées (table taskin_saved_views, scope « pilotage ») ----------
async function pilLoadViews() {
  try { pilState.views = await pilFetch('taskin_saved_views?select=id,owner_id,name,config,shared&scope=eq.pilotage&order=name.asc'); }
  catch (_) { pilState.views = []; }
  if (!pilState.loading) pilPaint();
}
function pilViewsHtml() {
  const views = pilState.views || [];
  const chips = views.map(v => `<span class="pil-view ${pilState.activeView === v.id ? 'active' : ''}"><button type="button" onclick="pilApplyView('${v.id}')" title="${v.shared ? 'Vue partagée avec l’encadrement' : 'Vue personnelle'}">${v.shared ? '👥 ' : ''}${escHtml(v.name)}</button>${v.owner_id === currentUser?.id || currentUser?.role === 'admin' || currentUser?.role === 'supervisor' ? `<button type="button" class="pil-view-x" onclick="pilDeleteView('${v.id}')" aria-label="Supprimer la vue ${escHtml(v.name)}">×</button>` : ''}</span>`).join('');
  const form = pilState.saving ? `<span class="pil-view-form"><input type="text" class="form-input" id="pil-view-name" maxlength="60" placeholder="Nom de la vue (ex. Bilan BO mensuel)" onkeydown="if(event.key==='Enter')pilSaveView()"><label><input type="checkbox" id="pil-view-shared"> Partager avec l’encadrement</label><button type="button" class="btn btn-primary" onclick="pilSaveView()">Enregistrer</button><button type="button" class="btn btn-ghost" onclick="pilState.saving=false;pilPaint()">Annuler</button></span>`
    : '<button type="button" class="dr-edit-btn" onclick="pilState.saving=true;pilPaint();setTimeout(()=>pilEl(\'pil-view-name\')?.focus(),0)">＋ Enregistrer cette vue</button>';
  return `<div class="pil-views"><b>Mes vues</b>${chips || '<small class="dr-muted">Aucune vue enregistrée : règle les filtres et les KPI puis enregistre-les sous un nom.</small>'}${form}</div>`;
}
function pilViewConfig() { return { period: pilState.period, from: pilState.from, to: pilState.to, pole: pilState.pole, kpis: pilSelected(), sort: pilState.sort, dir: pilState.dir }; }
async function pilSaveView() {
  const name = (pilEl('pil-view-name')?.value || '').trim();
  if (!name) { pilEl('pil-view-name')?.focus(); return; }
  const shared = !!pilEl('pil-view-shared')?.checked;
  try {
    const [row] = await dispatchRest('taskin_saved_views', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ scope: 'pilotage', name, shared, config: pilViewConfig() }) });
    pilState.views = [...(pilState.views || []), row].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    pilState.activeView = row.id; pilState.saving = false;
  } catch (e) { alert('Enregistrement impossible : ' + e.message); }
  pilPaint();
}
function pilApplyView(id) {
  const v = (pilState.views || []).find(x => x.id === id);
  if (!v) return;
  const c = v.config || {};
  Object.assign(pilState, { period: c.period || '28d', from: c.from || '', to: c.to || '', pole: c.pole || 'all', sort: c.sort || 'actions', dir: c.dir || -1, agent: '', activeView: id });
  if (Array.isArray(c.kpis) && c.kpis.length) { try { localStorage.setItem(pilPrefsKey(), JSON.stringify(c.kpis)); } catch (_) {} }
  pilLoad();
}
async function pilDeleteView(id) {
  const v = (pilState.views || []).find(x => x.id === id);
  if (!v || !confirm(`Supprimer la vue « ${v.name} » ?`)) return;
  try {
    await dispatchRest(`taskin_saved_views?id=eq.${id}`, { method: 'DELETE' });
    pilState.views = pilState.views.filter(x => x.id !== id);
    if (pilState.activeView === id) pilState.activeView = '';
  } catch (e) { alert('Suppression impossible : ' + e.message); }
  pilPaint();
}

function pilPaint() {
  const panel = pilEl('pilotage-panel');
  if (!panel) return;
  const c = !pilState.loading && !pilState.error ? pilCompute() : null;
  const sel = pilSelected();
  let body;
  if (pilState.loading) body = '<div class="dr-empty">Chargement des indicateurs…</div>';
  else if (pilState.error) body = `<div class="dr-empty dr-error">Impossible de charger les indicateurs : ${escHtml(pilState.error)}</div>`;
  else if (pilState.agent) body = pilAgentHtml(c, pilState.agent);
  else body = pilTeamHtml(c, sel) + pilAgentsHtml(c, sel);
  panel.innerHTML = `<section class="dr-shell pil-shell">
    <div class="dr-head">
      <div>${pilSwitchHtml()}<span class="admin-overview-section-label">Pilotage · équipe → agents → fiche 360°</span><h2>${pilState.agent ? escHtml((TEAM || []).find(u => u.id === pilState.agent)?.name || 'Agent') : 'Pilotage 360°'}</h2>
        <p>${pilState.agent ? 'Tous les indicateurs de l’agent comparés à l’équipe et à la période précédente.' : 'Les indicateurs de toutes les sources Task’in, de l’équipe jusqu’à chaque agent. Clique sur un agent pour ouvrir sa fiche 360°.'}</p></div>
      <div class="dr-head-actions">${pilState.agent ? '<button type="button" class="btn btn-ghost" onclick="pilOpenAgent(\'\')">← Équipe</button>' : '<button type="button" class="btn btn-ghost" onclick="pilToggleCustom()">⚙ Personnaliser les KPI</button>'}</div>
    </div>
    <div class="dr-toolbar">${pilFiltersHtml()}${pilState.agent ? '' : pilViewsHtml()}</div>
    ${pilState.custom && !pilState.agent ? pilCustomHtml(sel) : ''}
    ${body}
  </section>`;
  if (c && !pilState.agent && typeof taskinHeatmapRender === 'function') {
    const hmPeriod = { '7d': '7d', '28d': '28d', month: 'month', 'prev-month': 'prev-month', custom: 'custom' }[pilState.period];
    hmState.pilotage = { ...(hmState.pilotage || { agent: 'all', source: 'all', measure: 'count' }), period: hmPeriod, from: pilState.from, to: pilState.to, pole: pilState.pole };
    taskinHeatmapRender('pil-heatmap', { id: 'pilotage' });
  }
}

function pilTeamHtml(c, sel) {
  const families = PIL_FAMILIES.map(([fam, label]) => {
    const kpis = PIL_KPIS.filter(k => k.fam === fam && sel.includes(k.key));
    if (!kpis.length) return '';
    return `<div class="pil-family"><h4>${label}</h4><div class="pil-tiles">${kpis.map(k => {
      const v = pilValue(c.team[k.key]), p = pilValue(c.teamPrev[k.key]);
      return `<div class="pil-tile"><span>${k.label}</span><b>${pilFmt(v, k.fmt)}</b><small>${pilDelta(v, p, k) || '<em class="pil-d">pas de comparaison</em>'}${p !== null ? ` · avant ${pilFmt(p, k.fmt)}` : ''}</small></div>`;
    }).join('')}</div></div>`;
  }).join('');
  return `<div class="pil-section"><h3>1 · Équipe <small>${c.rows.length} agent${c.rows.length > 1 ? 's' : ''}${pilState.pole !== 'all' ? ' · pôle ' + escHtml(poleLabel(pilState.pole)) : ''}</small></h3><div class="pil-families">${families}</div>
    <div class="pil-family"><h4>Activité par heure</h4><div id="pil-heatmap"></div></div></div>`;
}

function pilAgentsHtml(c, sel) {
  const kpis = PIL_KPIS.filter(k => sel.includes(k.key));
  const key = kpis.some(k => k.key === pilState.sort) ? pilState.sort : kpis[0]?.key;
  const rows = c.rows.slice().sort((a, b) => {
    const va = pilValue(a.cur[key]), vb = pilValue(b.cur[key]);
    if (va === null) return 1; if (vb === null) return -1;
    return (va - vb) * pilState.dir;
  });
  return `<div class="pil-section"><h3>2 · Agents <small>clique sur un en-tête pour trier · vert / rouge = au-dessus / en dessous de la moyenne de l’équipe</small></h3>
    <div class="dr-table-wrap"><table class="dr-table pil-table">
      <thead><tr><th>Agent</th>${kpis.map(k => `<th class="pil-sort ${k.key === key ? 'is-sorted' : ''}" onclick="pilSort('${k.key}')">${k.label}${k.key === key ? (pilState.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr class="pil-row" onclick="pilOpenAgent('${r.agent.id}')">
        <td><div class="dr-agent"><span class="dr-avatar" style="--c:${safeColor(r.agent.color)}">${escHtml(r.agent.initials || '??')}</span><div><strong>${escHtml(r.agent.name)}</strong>${r.agent.pole ? `<em class="dr-pole dr-pole-${escHtml(r.agent.pole)}">${escHtml(poleLabel(r.agent.pole))}</em>` : ''}</div></div></td>
        ${kpis.map(k => { const v = pilValue(r.cur[k.key]); return `<td class="pil-cell ${pilTone(v, pilTeamRef(c.team, k), k)}">${pilFmt(v, k.fmt)}${pilDelta(v, pilValue(r.prev[k.key]), k)}</td>`; }).join('')}
      </tr>`).join('') || `<tr><td colspan="${kpis.length + 1}" class="dr-muted">Aucun agent dans ce pôle.</td></tr>`}</tbody>
      <tfoot><tr><td>Moyenne / agent</td>${kpis.map(k => `<td>${pilFmt(pilTeamRef(c.team, k), k.fmt)}</td>`).join('')}</tr></tfoot>
    </table></div></div>`;
}
function pilSort(key) { if (pilState.sort === key) pilState.dir *= -1; else { pilState.sort = key; pilState.dir = -1; } pilPaint(); }
function pilOpenAgent(id) { pilState.agent = id; pilPaint(); window.scrollTo({ top: 0, behavior: 'instant' }); }

function pilCustomHtml(sel) {
  return `<div class="pil-custom"><b>KPI affichés</b> <small>(équipe et tableau des agents · mémorisé pour toi)</small>
    ${PIL_FAMILIES.map(([fam, label]) => `<div class="pil-custom-fam"><span>${label}</span>${PIL_KPIS.filter(k => k.fam === fam).map(k => `<label><input type="checkbox" value="${k.key}" ${sel.includes(k.key) ? 'checked' : ''} onchange="pilToggleKpi(this)"> ${k.label}</label>`).join('')}</div>`).join('')}
    <button type="button" class="dr-edit-btn" onclick="pilResetKpis()">Revenir aux KPI par défaut</button></div>`;
}
function pilToggleCustom() { pilState.custom = !pilState.custom; pilPaint(); }
function pilToggleKpi(input) {
  let sel = pilSelected();
  sel = input.checked ? [...new Set([...sel, input.value])] : sel.filter(k => k !== input.value);
  if (!sel.length) { input.checked = true; return; }
  // Garde l'ordre du catalogue.
  sel = PIL_KPIS.map(k => k.key).filter(k => sel.includes(k));
  try { localStorage.setItem(pilPrefsKey(), JSON.stringify(sel)); } catch (_) {}
  pilState.activeView = '';
  pilPaint();
}
function pilResetKpis() { try { localStorage.removeItem(pilPrefsKey()); } catch (_) {} pilPaint(); }

function pilAgentHtml(c, agentId) {
  const row = c.rows.find(r => r.agent.id === agentId) || (() => { const a = (TEAM || []).find(u => u.id === agentId); return a ? { agent: a, cur: pilRaw(pilState.data, a.id, c.range.from, c.range.to), prev: pilRaw(pilState.data, a.id, c.range.prevFrom, c.range.prevTo) } : null; })();
  if (!row) return '<div class="dr-empty">Agent introuvable.</div>';
  const d = pilState.data;
  const fams = PIL_FAMILIES.map(([fam, label]) => `<div class="pil-family"><h4>${label}</h4><div class="pil-tiles">${PIL_KPIS.filter(k => k.fam === fam).map(k => {
    const v = pilValue(row.cur[k.key]), ref = pilTeamRef(c.team, k);
    return `<div class="pil-tile ${pilTone(v, ref, k)}"><span>${k.label}</span><b>${pilFmt(v, k.fmt)}</b><small>Équipe ${pilFmt(ref, k.kind === 'sum' && k.fmt === 'int' && ref !== null && ref < 10 ? 'dec' : k.fmt)}${k.kind === 'sum' ? ' / agent' : ''} ${pilDelta(v, pilValue(row.prev[k.key]), k)}</small></div>`;
  }).join('')}</div></div>`).join('');
  const days = pilDays(c.range.from, c.range.to).reverse();
  const daily = days.map(day => {
    const osc = d.osc.find(x => x.agent_id === agentId && x.day === day);
    const ents = (typeof entries !== 'undefined' ? entries : []).filter(e => e.agent === agentId && e.startTimeStr && pilDay(new Date(e.startTimeStr)) === day);
    const missed = d.missed.filter(x => x.agent_id === agentId && x.call_date === day);
    const conn = pilConnected(d.sessions, agentId, day, day);
    const reached = pilGoalReached(d, agentId, day);
    if (!osc && !ents.length && !missed.length && !conn) return '';
    return `<tr><td>${pilParse(day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${ents.length || '—'}</td><td>${osc?.actions ?? '—'}</td><td>${osc ? (osc.calls_in || 0) + (osc.calls_out || 0) : '—'}</td>
      <td>${reached === null ? '—' : reached ? '<span class="dr-status is-good">Atteint</span>' : '<span class="dr-status is-warn">Non</span>'}</td><td>${missed.length || '—'}</td><td>${conn ? pilFmt(conn, 'min') : '—'}</td></tr>`;
  }).join('');
  const openCases = d.cases.filter(x => x.agent_id === agentId && x.status !== 'resolu');
  return `<div class="pil-section"><div class="pil-agent-head"><span class="dr-avatar" style="--c:${safeColor(row.agent.color)}">${escHtml(row.agent.initials || '??')}</span><div><strong>${escHtml(row.agent.name)}</strong><small>${escHtml(poleLabel(row.agent.pole) || 'Pôle non défini')}${row.agent.shift ? ' · shift ' + escHtml(row.agent.shift) : ''}</small></div>
      <div class="pil-agent-links"><button type="button" class="dr-edit-btn" onclick="switchTab('results')">Résultats</button><button type="button" class="dr-edit-btn" onclick="switchTab('missed')">Appels manqués</button></div></div>
    ${fams}</div>
    <div class="pil-section"><h3>Jour par jour</h3>${daily ? `<div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>Jour</th><th>Traitements</th><th>Actions OSC</th><th>Appels OSC</th><th>Objectif</th><th>Appels manqués</th><th>Connecté</th></tr></thead><tbody>${daily}</tbody></table></div>` : '<p class="dr-muted">Aucune activité sur la période.</p>'}</div>
    <div class="pil-section"><h3>Cas complexes ouverts <small>${openCases.length}</small></h3>${openCases.length ? `<ul class="pil-list">${openCases.map(x => `<li><b>${escHtml(x.data?.title || 'Sans titre')}</b> <small>${escHtml(x.status)}${x.data?.difficulty ? ' · ' + escHtml((typeof SV_DIFFICULTY_LABEL !== 'undefined' && SV_DIFFICULTY_LABEL[x.data.difficulty]) || x.data.difficulty) : ''}</small></li>`).join('')}</ul>` : '<p class="dr-muted">Aucun cas ouvert.</p>'}</div>`;
}
