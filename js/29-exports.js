// ======================= EXPORTS POUR LE MANAGEMENT =======================
// Un seul endroit pour sortir les chiffres : superviseur en bas de Reporting, admin en bas de Statistiques (Analyse).
// On coche les indicateurs, on choisit la période et les agents (sélection multiple), et on obtient :
//  · un classeur .xlsx à plusieurs onglets (s'ouvre tel quel dans Google Sheets) ;
//  · une présentation .pptx avec synthèse, tableau par agent, points d'attention et commentaire
//    (s'ouvre telle quelle dans Google Slides).
// Mêmes calculs que le Pilotage 360° (pilFetchData / pilRaw / pilTeam). Modèles d'export enregistrables
// (table taskin_saved_views, scope « export »). Bibliothèques chargées seulement au clic.

const EXP_SHEETS = [
  ['summary', 'Synthèse équipe', 'indicateurs cochés, équipe vs période précédente'],
  ['agents', 'Détail par agent', 'un agent par ligne, comparé à la moyenne'],
  ['daily', 'Jour par jour', 'résultats OSC, objectifs, appels manqués, connexion'],
  ['missed', 'Appels manqués', 'journal détaillé'],
  ['cases', 'Cas complexes', 'difficultés et escalades de la période'],
  ['presence', 'Présence', '1re connexion, dernière déconnexion, écart au shift'],
  ['quality', 'Écoutes qualité', 'grilles de la période'],
  ['entries', 'Traitements (détail)', 'chaque traitement chronométré'],
];
const EXP_DEFAULT_SHEETS = ['summary', 'agents', 'daily'];
const expState = { period: '28d', from: '', to: '', pole: 'all', agents: null, kpis: null, sheets: null, comment: '', busy: '', presets: null, activePreset: '', saving: false, mounts: new Set() };

function expAgentsAll() { return typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(u => u.role === 'agent'); }
function expEnsureDefaults() {
  if (!expState.kpis) expState.kpis = typeof PIL_DEFAULT !== 'undefined' ? PIL_DEFAULT.slice() : [];
  if (!expState.sheets) expState.sheets = EXP_DEFAULT_SHEETS.slice();
  if (!expState.agents) expState.agents = new Set(expAgentsAll().map(a => a.id));
}
function expRange() {
  const saved = { period: pilState.period, from: pilState.from, to: pilState.to };
  Object.assign(pilState, { period: expState.period, from: expState.from, to: expState.to });
  const r = pilRange();
  Object.assign(pilState, saved);
  return r;
}
function expSelectedAgents() { return expAgentsAll().filter(a => expState.agents.has(a.id)); }
function expFmtDay(day) { return pilParse(day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
function expPeriodLabel(r) { return r.from === r.to ? expFmtDay(r.from) : `du ${expFmtDay(r.from)} au ${expFmtDay(r.to)}`; }

// ---------- Montage dans un conteneur (Reporting superviseur / Supervision admin) ----------
async function taskinExportsMount(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el || !currentUser || !['admin', 'supervisor'].includes(currentUser.role)) return;
  if (typeof pilRange !== 'function') await loadModule('28-pilotage.js');
  expEnsureDefaults();
  expState.mounts.add(el.id);
  if (!expState.presets) expLoadPresets();
  expPaint();
}
window.taskinExportsMount = taskinExportsMount;

function expPaint() {
  expState.mounts.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = expHtml(id); });
}

function expHtml(mountId) {
  const r = expRange();
  const all = expAgentsAll(), shown = all.filter(a => expState.pole === 'all' || a.pole === expState.pole);
  const nAgents = expState.agents.size;
  const chip = (on, label, action) => `<button type="button" class="${on ? 'active' : ''}" onclick="${action}">${label}</button>`;
  const periods = [['7d', '7 jours'], ['28d', '4 semaines'], ['month', 'Ce mois'], ['prev-month', 'Mois précédent'], ['custom', 'Dates…']];
  const max = pilDay(new Date());
  const busy = expState.busy;
  return `<section class="exp-shell" data-exp-mount="${mountId}">
    <div class="exp-head"><div><span class="admin-overview-section-label">Exports · management</span><h3>Exporter les statistiques</h3>
      <p>Coche les indicateurs, choisis la période et les agents : tu obtiens un classeur pour Google Sheets et une présentation pour Google Slides, prêts à partager.</p></div></div>
    ${expPresetsHtml()}
    <div class="exp-grid">
      <div class="exp-block"><h4><span>1</span>Période</h4>
        <div class="dr-poles">${periods.map(([k, l]) => chip(expState.period === k, l, `expSet('period','${k}')`)).join('')}</div>
        ${expState.period === 'custom' ? `<div class="mc-custom exp-dates"><input type="date" class="form-input" data-exp-from value="${expState.from}" max="${max}" onchange="expSetDates(this)"> → <input type="date" class="form-input" data-exp-to value="${expState.to}" max="${max}" onchange="expSetDates(this)"></div>` : ''}
        <p class="exp-note">${expPeriodLabel(r)} · comparé aux ${r.len} jours précédents</p>
      </div>
      <div class="exp-block"><h4><span>2</span>Agents <small>${nAgents} / ${all.length} sélectionné${nAgents > 1 ? 's' : ''}</small></h4>
        <div class="dr-poles">${[['all', 'Tous les pôles'], ['fo', 'FO'], ['bo', 'BO'], ['reconf', 'Reconf']].map(([k, l]) => chip(expState.pole === k, l, `expSet('pole','${k}')`)).join('')}</div>
        <div class="exp-agents">${shown.map(a => `<label><input type="checkbox" ${expState.agents.has(a.id) ? 'checked' : ''} onchange="expToggleAgent('${a.id}', this.checked)"> ${escHtml(a.name)}${a.pole ? ` <em class="dr-pole dr-pole-${escHtml(a.pole)}">${escHtml(poleLabel(a.pole))}</em>` : ''}</label>`).join('') || '<span class="dr-muted">Aucun agent dans ce pôle.</span>'}</div>
        <div class="exp-links"><button type="button" class="dr-edit-btn" onclick="expAllAgents(true)">Tout cocher${expState.pole !== 'all' ? ' (pôle)' : ''}</button><button type="button" class="dr-edit-btn" onclick="expAllAgents(false)">Tout décocher${expState.pole !== 'all' ? ' (pôle)' : ''}</button></div>
      </div>
    </div>
    <div class="exp-block"><h4><span>3</span>Indicateurs <small>${expState.kpis.length} coché${expState.kpis.length > 1 ? 's' : ''}</small></h4>
      <div class="exp-kpis">${PIL_FAMILIES.map(([fam, label]) => `<div><b>${label}</b>${PIL_KPIS.filter(k => k.fam === fam).map(k => `<label><input type="checkbox" ${expState.kpis.includes(k.key) ? 'checked' : ''} onchange="expToggleKpi('${k.key}', this.checked)"> ${k.label}</label>`).join('')}</div>`).join('')}</div>
    </div>
    <div class="exp-grid">
      <div class="exp-block"><h4><span>4</span>Onglets du classeur</h4>
        <div class="exp-sheets">${EXP_SHEETS.map(([k, l, hint]) => `<label><input type="checkbox" ${expState.sheets.includes(k) ? 'checked' : ''} onchange="expToggleSheet('${k}', this.checked)"> <span><b>${l}</b><small>${hint}</small></span></label>`).join('')}</div>
      </div>
      <div class="exp-block"><h4><span>5</span>Commentaire <small>repris dans la présentation</small></h4>
        <textarea class="form-input" rows="5" maxlength="2000" placeholder="Analyse, contexte de la période, actions décidées…" oninput="expState.comment=this.value">${escHtml(expState.comment)}</textarea>
      </div>
    </div>
    <div class="exp-actions">
      <button type="button" class="btn btn-primary" ${busy || !nAgents || !expState.kpis.length ? 'disabled' : ''} onclick="expRun('xlsx')">${busy === 'xlsx' ? 'Préparation du classeur…' : '⬇ Google Sheets (.xlsx)'}</button>
      <button type="button" class="btn btn-primary" ${busy || !nAgents || !expState.kpis.length ? 'disabled' : ''} onclick="expRun('pptx')">${busy === 'pptx' ? 'Préparation des slides…' : '⬇ Google Slides (.pptx)'}</button>
      <span class="exp-help">Dans Google Drive : <b>Nouveau › Importer le fichier</b>, puis <b>Ouvrir avec Google Sheets / Google Slides</b>. Le fichier reste modifiable et partageable.</span>
    </div>
    <p class="exp-error" data-exp-error></p>
  </section>`;
}

function expSet(key, value) {
  expState[key] = value; expState.activePreset = '';
  if (key === 'period' && value === 'custom' && !expState.from) { expState.to = pilDay(new Date()); expState.from = pilShift(expState.to, -13); }
  expPaint();
}
function expSetDates(input) {
  const box = input.closest('.exp-dates');
  const f = box.querySelector('[data-exp-from]').value, t = box.querySelector('[data-exp-to]').value;
  if (f && t) { expState.from = f; expState.to = t; expState.activePreset = ''; expPaint(); }
}
function expToggleAgent(id, on) { on ? expState.agents.add(id) : expState.agents.delete(id); expState.activePreset = ''; expPaint(); }
function expAllAgents(on) {
  expAgentsAll().filter(a => expState.pole === 'all' || a.pole === expState.pole).forEach(a => on ? expState.agents.add(a.id) : expState.agents.delete(a.id));
  expState.activePreset = ''; expPaint();
}
function expToggleKpi(key, on) {
  const set = new Set(expState.kpis); on ? set.add(key) : set.delete(key);
  expState.kpis = PIL_KPIS.map(k => k.key).filter(k => set.has(k)); expState.activePreset = ''; expPaint();
}
function expToggleSheet(key, on) {
  const set = new Set(expState.sheets); on ? set.add(key) : set.delete(key);
  expState.sheets = EXP_SHEETS.map(s => s[0]).filter(k => set.has(k)); expState.activePreset = ''; expPaint();
}

// ---------- Modèles d'export ----------
async function expLoadPresets() {
  try { expState.presets = await dispatchRest('taskin_saved_views?select=id,owner_id,name,config,shared&scope=eq.export&order=name.asc'); }
  catch (_) { expState.presets = []; }
  expPaint();
}
function expPresetsHtml() {
  const list = expState.presets || [];
  const chips = list.map(v => `<span class="pil-view ${expState.activePreset === v.id ? 'active' : ''}"><button type="button" onclick="expApplyPreset('${v.id}')">${v.shared ? '👥 ' : ''}${escHtml(v.name)}</button>${v.owner_id === currentUser?.id || ['admin', 'supervisor'].includes(currentUser?.role) ? `<button type="button" class="pil-view-x" onclick="expDeletePreset('${v.id}')" aria-label="Supprimer le modèle ${escHtml(v.name)}">×</button>` : ''}</span>`).join('');
  const form = expState.saving
    ? `<span class="pil-view-form"><input type="text" class="form-input" data-exp-preset-name maxlength="60" placeholder="Nom du modèle (ex. Reporting mensuel client)" onkeydown="if(event.key==='Enter')expSavePreset(this)"><label><input type="checkbox" data-exp-preset-shared> Partager avec l’encadrement</label><button type="button" class="btn btn-primary" onclick="expSavePreset(this)">Enregistrer</button><button type="button" class="btn btn-ghost" onclick="expState.saving=false;expPaint()">Annuler</button></span>`
    : '<button type="button" class="dr-edit-btn" onclick="expState.saving=true;expPaint()">＋ Enregistrer comme modèle</button>';
  return `<div class="pil-views exp-presets"><b>Mes modèles</b>${chips || '<small class="dr-muted">Enregistre tes réglages habituels pour les retrouver en un clic.</small>'}${form}</div>`;
}
async function expSavePreset(btn) {
  const box = btn.closest('.pil-view-form');
  const input = box.querySelector('[data-exp-preset-name]'), name = input.value.trim();
  if (!name) { input.focus(); return; }
  const config = { period: expState.period, from: expState.from, to: expState.to, pole: expState.pole, agents: [...expState.agents], kpis: expState.kpis, sheets: expState.sheets };
  try {
    const [row] = await dispatchRest('taskin_saved_views', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ scope: 'export', name, shared: box.querySelector('[data-exp-preset-shared]').checked, config }) });
    expState.presets = [...(expState.presets || []), row].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    expState.activePreset = row.id; expState.saving = false;
  } catch (e) { alert('Enregistrement impossible : ' + e.message); }
  expPaint();
}
function expApplyPreset(id) {
  const v = (expState.presets || []).find(x => x.id === id);
  if (!v) return;
  const c = v.config || {};
  const known = new Set(expAgentsAll().map(a => a.id));
  Object.assign(expState, { period: c.period || '28d', from: c.from || '', to: c.to || '', pole: c.pole || 'all', activePreset: id,
    agents: new Set((c.agents || []).filter(a => known.has(a))), kpis: (c.kpis || []).filter(k => PIL_KPIS.some(x => x.key === k)), sheets: (c.sheets || EXP_DEFAULT_SHEETS).filter(k => EXP_SHEETS.some(s => s[0] === k)) });
  expPaint();
}
async function expDeletePreset(id) {
  const v = (expState.presets || []).find(x => x.id === id);
  if (!v || !confirm(`Supprimer le modèle « ${v.name} » ?`)) return;
  try { await dispatchRest(`taskin_saved_views?id=eq.${id}`, { method: 'DELETE' }); expState.presets = expState.presets.filter(x => x.id !== id); if (expState.activePreset === id) expState.activePreset = ''; }
  catch (e) { alert('Suppression impossible : ' + e.message); }
  expPaint();
}

// ---------- Données ----------
async function expCollect() {
  const r = expRange();
  const d = await pilFetchData(r);
  const agents = expSelectedAgents();
  const rows = pilRows(d, agents);
  const kpis = PIL_KPIS.filter(k => expState.kpis.includes(k.key));
  return { r, d, agents, rows, kpis, team: pilTeam(rows, 'cur'), teamPrev: pilTeam(rows, 'prev') };
}
function expTeamValue(t, k) { return pilValue(t[k.key]); }
function expTeamRef(t, k) { return typeof pilTeamRef === 'function' ? pilTeamRef(t, k) : null; }
function expEvolution(cur, prev) { return cur === null || prev === null || !prev ? null : (cur - prev) / Math.abs(prev); }
function expText(v, k) { return pilFmt(v, k.fmt); }
// « Actions OSC » → « actions OSC » : minuscule en tête de mot seulement, sigles conservés.
function expLc(label) { return label.split(' ').map(w => /^[A-ZÀ-Ý][a-zà-ÿ’']/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w).join(' '); }

async function expRun(kind) {
  if (expState.busy) return;
  expState.busy = kind; expPaint();
  try {
    const data = await expCollect();
    if (kind === 'xlsx') await expWorkbook(data); else await expDeck(data);
  } catch (e) {
    console.error('Export', e);
    expState.busy = ''; expPaint();
    document.querySelectorAll('[data-exp-error]').forEach(p => { p.textContent = 'Export impossible : ' + e.message; });
    return;
  }
  expState.busy = ''; expPaint();
}
function expFileBase(data) { return `Taskin-reporting-${data.r.from}_${data.r.to}`; }

// ---------- Classeur (Google Sheets) ----------
const EXP_NAVY = 'FF13294B', EXP_LIGHT = 'FFF1F5F9', EXP_GOOD = 'FFDCFCE7', EXP_BAD = 'FFFEE2E2';
function expNumFmt(k) { return k.fmt === 'pct' ? '0" %"' : k.fmt === 'min1' || k.fmt === 'dec' ? '0.0' : '0'; }
function expHeaderUnit(k) { return k.fmt === 'min' || k.fmt === 'min1' ? ' (min)' : k.fmt === 'pct' ? ' (%)' : ''; }
function expRound(v, k) { if (v === null || v === undefined || Number.isNaN(v)) return null; return k.fmt === 'min1' || k.fmt === 'dec' ? Math.round(v * 10) / 10 : Math.round(v); }

function expSheet(wb, name, title, subtitle, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.getCell('A1').value = title; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: EXP_NAVY } };
  ws.getCell('A2').value = subtitle; ws.getCell('A2').font = { size: 10, color: { argb: 'FF64748B' } };
  ws.getRow(4).values = columns.map(c => c.header);
  ws.getRow(4).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXP_NAVY } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  ws.getRow(4).height = 30;
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 14; if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt; });
  rows.forEach((values, i) => {
    const row = ws.getRow(5 + i);
    row.values = values.map(v => (v && typeof v === 'object' && 'value' in v ? v.value : v));
    values.forEach((v, j) => { if (v && typeof v === 'object' && v.fill) row.getCell(j + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: v.fill } }; if (v && typeof v === 'object' && v.bold) row.getCell(j + 1).font = { bold: true }; });
    if (i % 2) row.eachCell({ includeEmpty: true }, c => { if (!c.fill || c.fill.type !== 'pattern') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
  });
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: columns.length } };
  return ws;
}

async function expWorkbook(data) {
  if (!window.ExcelJS) await loadModule('vendor/exceljs.min.js');
  if (!window.ExcelJS) throw new Error('Bibliothèque Excel indisponible.');
  const { r, d, rows, kpis, team, teamPrev, agents } = data;
  const wb = new window.ExcelJS.Workbook();
  wb.creator = currentUser?.name || 'Task’in'; wb.created = new Date();
  const scope = `${expPeriodLabel(r)} · ${agents.length} agent${agents.length > 1 ? 's' : ''} · exporté le ${new Date().toLocaleDateString('fr-FR')} par ${currentUser?.name || 'Task’in'}`;
  const sheets = new Set(expState.sheets);
  const tone = (v, ref, k) => { const t = pilTone(v, ref, k); return t === 'is-good' ? EXP_GOOD : t === 'is-bad' ? EXP_BAD : null; };

  if (sheets.has('summary')) {
    expSheet(wb, 'Synthèse', 'Synthèse de l’équipe', scope, [
      { header: 'Famille', width: 18 }, { header: 'Indicateur', width: 30 }, { header: 'Équipe', width: 14 }, { header: 'Période précédente', width: 18 },
      { header: 'Évolution', width: 12, numFmt: '+0%;-0%;0%' }, { header: 'Moyenne par agent', width: 18 }, { header: 'Unité', width: 12 },
    ], kpis.map(k => {
      const v = expTeamValue(team, k), p = expTeamValue(teamPrev, k), ev = expEvolution(v, p);
      const good = ev === null || k.better === 'neutral' ? null : (ev > 0) === (k.better === 'high');
      return [PIL_FAMILIES.find(f => f[0] === k.fam)[1], k.label, expRound(v, k), expRound(p, k), ev === null ? null : { value: Math.round(ev * 100) / 100, fill: Math.abs(ev) < 0.005 || good === null ? null : good ? EXP_GOOD : EXP_BAD },
        k.kind === 'sum' ? expRound(team[k.key]?.perAgent ?? null, k) : '', k.fmt === 'pct' ? '%' : k.fmt.startsWith('min') ? 'minutes' : ''];
    }));
  }
  if (sheets.has('agents')) {
    const cols = [{ header: 'Agent', width: 22 }, { header: 'Pôle', width: 9 }, ...kpis.flatMap(k => [{ header: k.label + expHeaderUnit(k), width: 15, numFmt: expNumFmt(k) }, { header: 'Évol.', width: 9, numFmt: '+0%;-0%;0%' }])];
    const body = rows.map(row => [row.agent.name, poleLabel(row.agent.pole) || '', ...kpis.flatMap(k => {
      const v = pilValue(row.cur[k.key]), p = pilValue(row.prev[k.key]), ev = expEvolution(v, p);
      return [{ value: expRound(v, k), fill: tone(v, expTeamRef(team, k), k) }, ev === null ? null : Math.round(ev * 100) / 100];
    })]);
    body.push([{ value: 'Moyenne / agent', bold: true }, '', ...kpis.flatMap(k => [{ value: expRound(expTeamRef(team, k), k), bold: true }, null])]);
    expSheet(wb, 'Par agent', 'Détail par agent', scope + ' · vert / rouge : au-dessus / en dessous de la moyenne de l’équipe', cols, body);
  }
  if (sheets.has('daily')) {
    const body = [];
    rows.forEach(({ agent }) => pilDays(r.from, r.to).forEach(day => {
      const osc = d.osc.find(x => x.agent_id === agent.id && x.day === day);
      const ents = (typeof entries !== 'undefined' ? entries : []).filter(e => e.agent === agent.id && e.startTimeStr && pilDay(new Date(e.startTimeStr)) === day);
      const missed = d.missed.filter(x => x.agent_id === agent.id && x.call_date === day).length;
      const conn = pilConnected(d.sessions, agent.id, day, day);
      const reached = pilGoalReached(d, agent.id, day);
      if (!osc && !ents.length && !missed && !conn) return;
      body.push([agent.name, poleLabel(agent.pole) || '', pilParse(day), ents.length || null, osc?.actions ?? null, osc ? (osc.calls_in || 0) + (osc.calls_out || 0) : null, osc?.resolved ?? null, osc?.crisp_conversations ?? null,
        reached === null ? '' : { value: reached ? 'Oui' : 'Non', fill: reached ? EXP_GOOD : EXP_BAD }, missed || null, conn ? Math.round(conn) : null]);
    }));
    expSheet(wb, 'Jour par jour', 'Jour par jour', scope, [
      { header: 'Agent', width: 22 }, { header: 'Pôle', width: 9 }, { header: 'Jour', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Traitements', width: 12 }, { header: 'Actions OSC', width: 12 },
      { header: 'Appels OSC', width: 12 }, { header: 'Résolus', width: 10 }, { header: 'Conv. Crisp', width: 12 }, { header: 'Objectif atteint', width: 14 }, { header: 'Appels manqués', width: 14 }, { header: 'Connecté (min)', width: 14 },
    ], body);
  }
  if (sheets.has('missed')) {
    const ids = new Set(agents.map(a => a.id)), allSel = agents.length === expAgentsAll().length;
    const cb = { pending: 'À rappeler', 5: 'Oui — 5 min', 10: 'Oui — 10 min', '10+': 'Oui — >10 min', none: 'Non rappelé' };
    const list = d.missed.filter(x => x.call_date >= r.from && x.call_date <= r.to && (ids.has(x.agent_id) || (!x.agent_id && allSel))).sort((a, b) => (a.call_date + a.call_time).localeCompare(b.call_date + b.call_time));
    expSheet(wb, 'Appels manqués', 'Appels manqués', scope + ` · ${list.length} appel${list.length > 1 ? 's' : ''}`, [
      { header: 'Date', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Heure', width: 8 }, { header: 'Agent', width: 22 }, { header: 'Cause', width: 26 }, { header: 'Rappel', width: 16 },
      { header: 'Rappelé par', width: 18 }, { header: 'Heure du rappel', width: 14 }, { header: 'Référence', width: 16 }, { header: 'Notes', width: 40 },
    ], list.map(x => [pilParse(x.call_date), String(x.call_time || '').slice(0, 5), (TEAM.find(u => u.id === x.agent_id)?.name) || x.agent_name || '', x.cause || '',
      { value: cb[x.callback] || x.callback, fill: x.callback === 'none' ? EXP_BAD : ['5', '10', '10+'].includes(x.callback) ? EXP_GOOD : null },
      (TEAM.find(u => u.id === x.callback_by)?.name) || x.callback_by_other || '', String(x.callback_time || '').slice(0, 5), x.call_ref || '', x.notes || '']));
  }
  if (sheets.has('cases')) {
    const ids = new Set(agents.map(a => a.id));
    const status = { nouveau: 'Nouveau', en_cours: 'En cours', attente_client: 'Attente client', resolu: 'Résolu' };
    const diff = typeof SV_DIFFICULTY_LABEL !== 'undefined' ? SV_DIFFICULTY_LABEL : {};
    const list = d.cases.filter(c => ids.has(c.agent_id) && (c.status !== 'resolu' || pilDay(new Date(c.created_at)) >= r.from) && pilDay(new Date(c.created_at)) <= r.to);
    expSheet(wb, 'Cas complexes', 'Cas complexes', scope + ' · ouverts sur la période ou toujours en cours', [
      { header: 'Créé le', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Agent', width: 22 }, { header: 'Titre', width: 40 }, { header: 'Type de difficulté', width: 26 }, { header: 'Statut', width: 14 }, { header: 'Priorité', width: 10 }, { header: 'Signalé par l’agent', width: 16 },
    ], list.map(c => [new Date(c.created_at), TEAM.find(u => u.id === c.agent_id)?.name || '', c.title || c.data?.title || '', diff[c.data?.difficulty] || c.data?.difficulty || '', status[c.status] || c.status, { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgent' }[c.priority] || '', c.data?.reportedBy === c.agent_id ? 'Oui' : '']));
  }
  if (sheets.has('presence')) {
    const body = [];
    rows.forEach(({ agent }) => {
      const shift = typeof agentSessionsShift === 'function' ? agentSessionsShift(agent) : null;
      pilDays(r.from, r.to).forEach(day => {
        const ev = d.sessions.filter(s => s.agent_id === agent.id && pilDay(new Date(s.created_at)) === day);
        const conn = pilConnected(d.sessions, agent.id, day, day);
        if (!ev.length && !conn) return;
        const logins = ev.filter(s => s.event === 'login').map(s => new Date(s.created_at)), logouts = ev.filter(s => s.event !== 'login').map(s => new Date(s.created_at));
        const first = logins.length ? logins[0] : null, last = logouts.length ? logouts[logouts.length - 1] : null;
        const mins = t => t.getHours() * 60 + t.getMinutes(), hm = t => t ? t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        const lateIn = shift?.start !== undefined && first ? mins(first) - shift.start : null, gapOut = shift?.end !== undefined && last ? mins(last) - shift.end : null;
        body.push([agent.name, shift?.label || '', pilParse(day), hm(first), hm(last), Math.round(conn), lateIn === null ? null : { value: lateIn, fill: lateIn > 5 ? EXP_BAD : null }, gapOut === null ? null : { value: gapOut, fill: gapOut < -5 ? EXP_BAD : null }]);
      });
    });
    expSheet(wb, 'Présence', 'Présence', scope + ' · écarts en minutes (positif = après l’heure du shift)', [
      { header: 'Agent', width: 22 }, { header: 'Shift', width: 14 }, { header: 'Jour', width: 12, numFmt: 'dd/mm/yyyy' }, { header: '1re connexion', width: 13 }, { header: 'Dernière déconnexion', width: 18 },
      { header: 'Connecté (min)', width: 14 }, { header: 'Écart arrivée (min)', width: 17 }, { header: 'Écart départ (min)', width: 17 },
    ], body);
  }
  if (sheets.has('quality')) {
    const ids = new Set(agents.map(a => a.id));
    const ch = { inbound: 'Appel entrant', outbound: 'Appel sortant', chat: 'Chat', email: 'E-mail', ticket: 'Ticket' };
    const list = (typeof qualityReviews !== 'undefined' ? qualityReviews : []).filter(rv => ids.has(rv.agentId) && rv.date && pilDay(new Date(rv.date)) >= r.from && pilDay(new Date(rv.date)) <= r.to).sort((a, b) => a.date - b.date);
    expSheet(wb, 'Écoutes', 'Écoutes qualité', scope, [
      { header: 'Date', width: 12, numFmt: 'dd/mm/yyyy' }, { header: 'Agent', width: 22 }, { header: 'Canal', width: 14 }, { header: 'Motif', width: 28 }, { header: 'Score (%)', width: 10 },
      { header: 'Situation inacceptable', width: 20 }, { header: 'Évaluateur', width: 18 }, { header: 'Partagée / lue', width: 16 },
    ], list.map(rv => { const pct = typeof svReviewPct === 'function' ? svReviewPct(rv) : rv.totalScorePct; return [new Date(rv.date), TEAM.find(u => u.id === rv.agentId)?.name || '', ch[rv.channel] || rv.channel || '', rv.contactReason || '', { value: pct, fill: pct >= 70 ? EXP_GOOD : pct < 50 ? EXP_BAD : null }, rv.siTriggered ? 'Oui' : '', TEAM.find(u => u.id === rv.reviewerId)?.name || '', rv.sharedWithAgent ? (rv.agentAckAt ? 'Lue' : 'Partagée') : 'Non partagée']; }));
  }
  if (sheets.has('entries')) {
    const ids = new Set(agents.map(a => a.id));
    const src = { inbound: 'Appel entrant', outbound: 'Appel sortant', chat: 'Chat', email: 'E-mail', ticket: 'Ticket', wati: 'WATI', manual: 'Manuel' };
    const list = (typeof entries !== 'undefined' ? entries : []).filter(e => ids.has(e.agent) && e.startTimeStr && pilDay(new Date(e.startTimeStr)) >= r.from && pilDay(new Date(e.startTimeStr)) <= r.to).sort((a, b) => new Date(a.startTimeStr) - new Date(b.startTimeStr));
    expSheet(wb, 'Traitements', 'Traitements chronométrés', scope + ` · ${list.length} traitement${list.length > 1 ? 's' : ''}`, [
      { header: 'Début', width: 17, numFmt: 'dd/mm/yyyy hh:mm' }, { header: 'Agent', width: 22 }, { header: 'Canal', width: 14 }, { header: 'Description', width: 36 }, { header: 'Traitement', width: 24 }, { header: 'Durée (min)', width: 11, numFmt: '0.0' },
    ], list.map(e => [new Date(e.startTimeStr), TEAM.find(u => u.id === e.agent)?.name || '', src[e.source] || e.source || '', e.description || '', e.treatment || '', Math.round(Number(e.durationSec || 0) / 6) / 10]));
  }
  if (!wb.worksheets.length) throw new Error('Coche au moins un onglet.');
  const buffer = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${expFileBase(data)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Analyse automatique (slides) ----------
function expInsights(data) {
  const { rows, kpis, team, teamPrev } = data;
  const attention = [], positive = [], actions = [];
  kpis.forEach(k => {
    const v = expTeamValue(team, k), p = expTeamValue(teamPrev, k), ev = expEvolution(v, p);
    if (ev === null || k.better === 'neutral' || Math.abs(ev) < 0.05) return;
    const good = (ev > 0) === (k.better === 'high');
    (good ? positive : attention).push([`${k.label} équipe : ${expText(v, k)} (${ev > 0 ? '+' : '−'}${Math.abs(Math.round(ev * 100))} % vs période précédente)`, good ? RS.green : RS.red]);
  });
  rows.forEach(row => {
    const weak = kpis.filter(k => pilTone(pilValue(row.cur[k.key]), expTeamRef(team, k), k) === 'is-bad');
    if (weak.length >= 2) {
      attention.push([`${row.agent.name} : en dessous de la moyenne sur ${weak.map(k => expLc(k.label)).join(', ')}`, RS.amber]);
      actions.push([`Point 1:1 avec ${row.agent.name} sur ${weak.slice(0, 2).map(k => expLc(k.label)).join(' et ')}`, RS.text]);
    }
    const best = kpis.filter(k => { const ev = expEvolution(pilValue(row.cur[k.key]), pilValue(row.prev[k.key])); return ev !== null && k.better !== 'neutral' && ev >= 0.15 && (ev > 0) === (k.better === 'high'); });
    if (best.length) positive.push([`${row.agent.name} progresse : ${best.map(k => expLc(k.label)).join(', ')}`, RS.green]);
  });
  const recall = pilValue(team.recallRate);
  if (recall !== null && recall < 90) actions.push([`Rappels clients : ${Math.round(recall)} % rappelés, objectif ≥ 90 % → rappeler la règle « Je rappelle » et vérifier le Snooze`, RS.text]);
  const quality = pilValue(team.quality);
  if (quality !== null && quality < 70) actions.push([`Qualité : score moyen ${Math.round(quality)} % → planifier des écoutes ciblées et un atelier`, RS.text]);
  const open = team.openCases?.n || 0;
  if (open) actions.push([`${open} cas complexe${open > 1 ? 's' : ''} encore ouvert${open > 1 ? 's' : ''} → revue avec le superviseur`, RS.text]);
  return { attention: attention.slice(0, 9), positive: positive.slice(0, 9), actions: actions.slice(0, 9) };
}

// ---------- Présentation (Google Slides) ----------
async function expDeck(data) {
  if (typeof rsLoadLibrary !== 'function') await loadModule('26-report-slides.js');
  const PptxGenJS = await rsLoadLibrary();
  const { r, rows, kpis, team, teamPrev, agents } = data;
  const period = expPeriodLabel(r);
  const poles = [...new Set(agents.map(a => poleLabel(a.pole)).filter(Boolean))].join(' · ') || 'Équipe';
  const pptx = rsNewDeck(PptxGenJS, `Reporting ${period}`);
  rsCover(pptx, 'Reporting de l’équipe', period.charAt(0).toUpperCase() + period.slice(1), `${agents.length} agent${agents.length > 1 ? 's' : ''} · ${poles}`);

  // Synthèse : tuiles (8 max par slide)
  for (let i = 0; i < kpis.length; i += 8) {
    const slide = pptx.addSlide({ masterName: 'TASKIN' });
    rsTitle(slide, `Synthèse de l’équipe${kpis.length > 8 ? ` (${i / 8 + 1}/${Math.ceil(kpis.length / 8)})` : ''}`, `${period} · évolution vs les ${r.len} jours précédents`);
    rsKpis(slide, kpis.slice(i, i + 8).map(k => {
      const v = expTeamValue(team, k), p = expTeamValue(teamPrev, k), ev = expEvolution(v, p);
      const good = ev === null || k.better === 'neutral' || Math.abs(ev) < 0.005 ? null : (ev > 0) === (k.better === 'high');
      return { label: k.label, value: expText(v, k), sub: ev === null ? 'pas de comparaison' : `${rsPct(ev * 100)} vs période précédente`, color: good === null ? RS.grey : good ? RS.green : RS.red };
    }));
  }
  // Tableau par agent (6 indicateurs par slide)
  for (let i = 0; i < kpis.length; i += 6) {
    const slice = kpis.slice(i, i + 6);
    const slide = pptx.addSlide({ masterName: 'TASKIN' });
    rsTitle(slide, `Résultats par agent${kpis.length > 6 ? ` (${i / 6 + 1}/${Math.ceil(kpis.length / 6)})` : ''}`, `${period} · vert / rouge : au-dessus / en dessous de la moyenne de l’équipe`);
    const color = (v, k) => { const t = pilTone(v, expTeamRef(team, k), k); return t === 'is-good' ? RS.green : t === 'is-bad' ? RS.red : RS.text; };
    rsTable(slide, ['Agent', ...slice.map(k => k.label)], [
      ...rows.map(row => [row.agent.name, ...slice.map(k => { const v = pilValue(row.cur[k.key]); return { text: expText(v, k), options: { color: color(v, k), bold: color(v, k) !== RS.text } }; })]),
      [{ text: 'Moyenne / agent', options: { bold: true } }, ...slice.map(k => ({ text: expText(expTeamRef(team, k), k), options: { bold: true } }))],
    ], { fontSize: rows.length > 12 ? 10 : 12, rowH: rows.length > 12 ? 0.3 : 0.38, colW: [2.6, ...slice.map(() => (12.33 - 2.6) / slice.length)] });
  }
  // Graphique : premier indicateur de volume coché
  const chartOrder = ['actions', 'calls', 'resolved', 'treatments'];
  const chartKpi = [...kpis].sort((a, b) => (chartOrder.indexOf(a.key) + 1 || 99) - (chartOrder.indexOf(b.key) + 1 || 99)).find(k => k.kind === 'sum' && rows.some(row => pilValue(row.cur[k.key]) !== null));
  if (chartKpi) {
    const slide = pptx.addSlide({ masterName: 'TASKIN' });
    rsTitle(slide, `${chartKpi.label} par agent`, `${period} vs période précédente`);
    const withData = rows.filter(row => pilValue(row.cur[chartKpi.key]) !== null || pilValue(row.prev[chartKpi.key]) !== null);
    slide.addChart(pptx.ChartType.bar, [
      { name: 'Période précédente', labels: withData.map(x => x.agent.name), values: withData.map(x => Math.round(pilValue(x.prev[chartKpi.key]) || 0)) },
      { name: 'Période', labels: withData.map(x => x.agent.name), values: withData.map(x => Math.round(pilValue(x.cur[chartKpi.key]) || 0)) },
    ], { x: 0.5, y: 1.4, w: 12.33, h: 5.4, barDir: 'col', barGrouping: 'clustered', chartColors: ['CBD5E1', RS.blue], showLegend: true, legendPos: 'b', legendFontFace: RS.font, showValue: true, dataLabelFontSize: 11, catAxisLabelFontFace: RS.font, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, valGridLine: { color: RS.border, size: 0.5 } });
  }
  // Analyse
  const ins = expInsights(data);
  let slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Analyse de la période', 'Points positifs et points d’attention, calculés automatiquement');
  slide.addText('Points positifs', { x: 0.5, y: 1.4, w: 6, h: 0.4, fontFace: RS.font, fontSize: 16, bold: true, color: RS.green });
  rsBullets(slide, ins.positive, { x: 0.5, y: 1.85, w: 6, h: 4.9, fontSize: 14 });
  slide.addText('Points d’attention', { x: 6.83, y: 1.4, w: 6, h: 0.4, fontFace: RS.font, fontSize: 16, bold: true, color: RS.red });
  rsBullets(slide, ins.attention, { x: 6.83, y: 1.85, w: 6, h: 4.9, fontSize: 14 });
  slide = pptx.addSlide({ masterName: 'TASKIN' });
  rsTitle(slide, 'Actions proposées', 'À valider avec l’équipe d’encadrement');
  rsBullets(slide, ins.actions);
  if (expState.comment.trim()) {
    slide = pptx.addSlide({ masterName: 'TASKIN' });
    rsTitle(slide, 'Commentaire', `${currentUser?.name || ''}${currentUser?.role === 'supervisor' ? ' · superviseur' : currentUser?.role === 'admin' ? ' · administrateur' : ''}`);
    rsMessage(slide, expState.comment.trim());
  }
  await pptx.writeFile({ fileName: `${expFileBase(data)}.pptx` });
}
