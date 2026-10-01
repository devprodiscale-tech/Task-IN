// ======================= JOURNAL DES APPELS MANQUÉS =======================
// Remplace le Google Sheet partagé « Journal des appels manqués » : chaque agent saisit ses appels
// manqués pendant son shift, toute l'équipe voit le journal en direct pour ne jamais rappeler deux
// fois le même client (« Je rappelle » réserve le rappel). Table missed_calls (migration 014).
// Onglet « Statistiques » (admin / superviseur) : mêmes indicateurs que l'onglet Stats du Sheet,
// filtrables, avec analyse et message client hebdomadaire.

const MC_CAUSES = ['Snooze non activé', 'Surcharge tickets', 'En communication', 'Problème technique', 'Réunion', 'Pause déjeuner', 'Pause toilette', 'Pause', 'Cas complexe immédiat', 'Appel trop court', 'Surcharge CRISP', 'N\'a pas sonné de notre côté', 'Autre'];
const MC_CALLBACK = { pending: 'À rappeler', 5: 'Oui — 5 min', 10: 'Oui — 10 min', '10+': 'Oui — >10 min', none: 'Non rappelé' };
// Actions correctives reprises de l'onglet Stats du Sheet.
const MC_ACTIONS = {
  'Snooze non activé': 'Revoir le protocole SNOOZE en briefing d’équipe',
  'Surcharge tickets': 'Adapter le dispatch — activer le SURGE MODE plus tôt',
  'Surcharge CRISP': 'Adapter le dispatch — renfort chat aux heures de pic',
  'En communication': 'Vérifier la rotation des appels — chevauchement insuffisant',
  'Problème technique': 'Escalader à l’IT · documenter les incidents',
  'Réunion': 'Planifier les réunions hors heures de pointe',
  'Pause déjeuner': 'Décaler les pauses pour garder une couverture appels',
  'Pause toilette': 'Prévenir l’équipe pour assurer la couverture',
  'Pause': 'Décaler les pauses pour garder une couverture appels',
  'Cas complexe immédiat': 'Passer le relais appels pendant les cas longs',
  'Appel trop court': 'Rappel systématique — vérifier le numéro',
  'N\'a pas sonné de notre côté': 'Vérifier Ringover (logs) et remonter au client',
  'Autre': 'Analyser les notes pour affiner les catégories',
};
const MC_SHIFTS = [['Matin', '07:00', '14:00'], ['Après-midi', '14:00', '19:00'], ['Soir', '19:00', '23:00']];

let mcState = { view: 'journal', range: 'today', agent: '__all', cause: '__all', from: '', to: '', rows: [], loading: false, error: '' };
let mcEdit = null;

function mcEl(id) { return document.getElementById(id); }
function mcIsManager() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'supervisor'); }
function mcToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function mcShift(day, delta) { const [y, m, d] = day.split('-').map(Number); const t = new Date(y, m - 1, d + delta); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
function mcNowTime() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function mcHm(time) { return time ? String(time).slice(0, 5) : ''; }
function mcName(id) { return (TEAM || []).find(u => u.id === id)?.name || ''; }
function mcAgents() { return typeof agentsOnly === 'function' ? agentsOnly() : (TEAM || []).filter(u => u.role === 'agent'); }
function mcDayLabel(day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
function mcCalledBy(r) { return r.callback_by ? mcName(r.callback_by) : r.callback_by_other || ''; }
function mcIsDone(r) { return ['5', '10', '10+'].includes(r.callback); }

async function mcRest(path, init = {}) {
  if (typeof dispatchRest === 'function') return dispatchRest(path, init);
  throw new Error('Module réseau indisponible.');
}

function mcPeriod() {
  const today = mcToday();
  if (mcState.range === 'today') return [today, today];
  if (mcState.range === '7d') return [mcShift(today, -6), today];
  if (mcState.range === 'month') return [today.slice(0, 8) + '01', today];
  if (mcState.range === 'prev-month') { const [y, m] = today.split('-').map(Number); const first = new Date(y, m - 2, 1), last = new Date(y, m - 1, 0); const f = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return [f(first), f(last)]; }
  return [mcState.from || today, mcState.to || today];
}

async function renderMissedCalls() {
  const panel = mcEl('missed-calls-panel');
  if (!panel || !currentUser) return;
  if (!mcIsManager()) mcState.view = 'journal';
  const [from, to] = mcPeriod();
  // Le journal charge toujours les 3 derniers jours en plus : les « à rappeler » d'hier restent visibles.
  const loadFrom = mcState.view === 'journal' && from > mcShift(mcToday(), -2) ? mcShift(mcToday(), -2) : from;
  const key = `${loadFrom}|${to}`;
  mcState.loading = true; mcState.error = ''; mcState.key = key;
  mcPaint();
  try {
    const rows = await mcRest(`missed_calls?select=*&call_date=gte.${loadFrom}&call_date=lte.${to}&order=call_date.desc,call_time.desc&limit=5000`);
    if (mcState.key !== key) return;
    mcState.rows = rows;
  } catch (e) {
    if (mcState.key !== key) return;
    mcState.rows = []; mcState.error = e.message;
  }
  mcState.loading = false;
  mcPaint();
}

function mcFiltered() {
  const [from, to] = mcPeriod();
  return mcState.rows.filter(r => r.call_date >= from && r.call_date <= to
    && (mcState.agent === '__all' || r.agent_id === mcState.agent)
    && (mcState.cause === '__all' || r.cause === mcState.cause));
}

function mcSwitchHtml() {
  if (currentUser?.role !== 'admin') return '';
  return `<div class="dr-switch" role="tablist"><button type="button" onclick="switchTab('stat', document.querySelector('[data-admin-nav=&quot;stat&quot;]'))">Analyse</button><button type="button" onclick="switchTab('results')">Résultats OSC</button><button type="button" class="active" aria-selected="true">Appels manqués</button></div>`;
}

function mcFiltersHtml() {
  const ranges = [['today', 'Aujourd’hui'], ['7d', '7 jours'], ['month', 'Ce mois'], ['prev-month', 'Mois précédent'], ['custom', 'Période…']];
  return `<div class="mc-filters">
    <div class="dr-poles">${ranges.map(([k, l]) => `<button type="button" class="${mcState.range === k ? 'active' : ''}" onclick="mcSetRange('${k}')">${l}</button>`).join('')}</div>
    ${mcState.range === 'custom' ? `<span class="mc-custom"><input type="date" class="form-input" id="mc-from" value="${mcState.from}" max="${mcToday()}" onchange="mcSetCustom()"> → <input type="date" class="form-input" id="mc-to" value="${mcState.to}" max="${mcToday()}" onchange="mcSetCustom()"></span>` : ''}
    <select class="form-input mc-select" onchange="mcState.agent=this.value;mcPaint()"><option value="__all">Tous les agents</option>${mcAgents().map(a => `<option value="${a.id}" ${mcState.agent === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select>
    <select class="form-input mc-select" onchange="mcState.cause=this.value;mcPaint()"><option value="__all">Toutes les causes</option>${MC_CAUSES.map(c => `<option ${mcState.cause === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}</select>
  </div>`;
}
function mcSetRange(range) {
  mcState.range = range;
  if (range === 'custom' && !mcState.from) { mcState.from = mcShift(mcToday(), -6); mcState.to = mcToday(); }
  renderMissedCalls();
}
function mcSetCustom() {
  const from = mcEl('mc-from').value, to = mcEl('mc-to').value;
  if (!from || !to) return;
  [mcState.from, mcState.to] = from <= to ? [from, to] : [to, from];
  renderMissedCalls();
}
function mcSetView(view) { mcState.view = view === 'stats' && mcIsManager() ? 'stats' : 'journal'; if (mcState.view === 'stats' && mcState.range === 'today') mcState.range = 'month'; renderMissedCalls(); }

function mcPaint() {
  const panel = mcEl('missed-calls-panel');
  if (!panel) return;
  const manager = mcIsManager();
  const tabs = manager ? `<div class="dr-modes"><button type="button" class="${mcState.view === 'journal' ? 'active' : ''}" onclick="mcSetView('journal')">Journal</button><button type="button" class="${mcState.view === 'stats' ? 'active' : ''}" onclick="mcSetView('stats')">Statistiques</button></div>` : '';
  const body = mcState.loading ? '<div class="dr-empty">Chargement du journal…</div>'
    : mcState.error ? `<div class="dr-empty dr-error">Impossible de charger le journal : ${escHtml(mcState.error)}</div>`
    : mcState.view === 'stats' ? mcStatsHtml() : mcJournalHtml();
  panel.innerHTML = `<section class="dr-shell mc-shell">
    <div class="dr-head">
      <div>${mcSwitchHtml()}<span class="admin-overview-section-label">${manager ? 'Stat · appels manqués' : 'Équipe · en temps réel'}</span><h2>Appels manqués</h2>
        <p>Un appel manqué = une ligne, saisie en temps réel. Le journal est partagé : vérifie « À rappeler » avant de rappeler, et clique sur « Je rappelle » pour éviter les doublons.</p></div>
      <div class="dr-head-actions">${mcState.view === 'stats' ? '<button type="button" class="btn btn-ghost" onclick="mcExportCsv()">Exporter CSV</button>' : ''}<button type="button" class="btn btn-primary" onclick="mcOpenEdit(null)">+ Appel manqué</button></div>
    </div>
    <div class="dr-toolbar">${tabs}${mcFiltersHtml()}</div>
    ${body}
  </section>`;
}

// ---------- Journal ----------
function mcJournalHtml() {
  const list = mcFiltered();
  const today = mcToday();
  const todays = mcState.rows.filter(r => r.call_date === today);
  // À rappeler : tout appel encore en attente des 3 derniers jours, quel que soit le filtre.
  const pending = mcState.rows.filter(r => r.callback === 'pending').sort((a, b) => (a.call_date + a.call_time).localeCompare(b.call_date + b.call_time));
  const done = todays.filter(mcIsDone).length;
  const kpis = [['Manqués aujourd’hui', todays.length, ''], ['À rappeler', pending.length, pending.length ? 'is-alert' : 'is-good'], ['Rappelés', done, ''], ['Taux de rappel', todays.length ? Math.round(done / todays.length * 100) + ' %' : '—', '']];
  return `<div class="mc-kpis">${kpis.map(([l, v, c]) => `<div class="${c}"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="mc-pending"><h3>À rappeler <small>${pending.length ? 'du plus ancien au plus récent' : 'rien en attente'}</small></h3>
      ${pending.length ? pending.map(r => {
        const claimedByMe = r.claimed_by === currentUser.id;
        const claimed = r.claimed_by && !claimedByMe;
        return `<div class="mc-pending-row ${claimed ? 'is-claimed' : ''} ${claimedByMe ? 'is-mine' : ''}">
          <div><strong>${mcHm(r.call_time)}</strong><span>${r.call_date !== today ? escHtml(mcDayLabel(r.call_date)) + ' · ' : ''}${escHtml(mcName(r.agent_id) || '—')} · ${escHtml(r.cause)}${r.call_ref ? ` · ID ${escHtml(r.call_ref)}` : ''}</span>${r.notes ? `<small>${escHtml(r.notes)}</small>` : ''}</div>
          ${claimed ? `<em>Pris en charge par ${escHtml(mcName(r.claimed_by))} à ${new Date(r.claimed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</em>`
            : claimedByMe ? `<span class="mc-actions"><button type="button" class="btn btn-primary" onclick="mcOpenEdit('${r.id}', true)">Marquer rappelé</button><button type="button" class="dr-edit-btn" onclick="mcClaim('${r.id}', false)">Libérer</button></span>`
            : `<button type="button" class="btn btn-primary" onclick="mcClaim('${r.id}', true)">Je rappelle</button>`}
        </div>`;
      }).join('') : '<p class="dr-muted">Tous les appels manqués ont été traités.</p>'}
    </div>
    ${!list.length ? '<div class="dr-empty">Aucun appel manqué sur cette période.</div>' : `<div class="dr-table-wrap"><table class="dr-table mc-table">
      <thead><tr><th>Date</th><th>Heure</th><th>Agent</th><th>Cause</th><th>Rappelé ?</th><th>Rappelé par</th><th>ID call</th><th>Heure de rappel</th><th>Notes / action</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr>
        <td>${escHtml(mcDayLabel(r.call_date))}</td><td>${mcHm(r.call_time)}</td><td>${escHtml(mcName(r.agent_id) || '—')}</td><td>${escHtml(r.cause)}</td>
        <td><span class="dr-status ${mcIsDone(r) ? 'is-good' : r.callback === 'none' ? 'is-alert' : 'is-warn'}">${MC_CALLBACK[r.callback] || r.callback}</span></td>
        <td>${escHtml(mcCalledBy(r)) || '—'}</td><td>${escHtml(r.call_ref || '—')}</td><td>${mcHm(r.callback_time) || '—'}</td>
        <td class="mc-notes">${escHtml(r.notes || '')}</td>
        <td class="dr-row-action"><button type="button" class="dr-edit-btn" onclick="mcOpenEdit('${r.id}')">Modifier</button></td></tr>`).join('')}</tbody></table></div>`}`;
}

async function mcClaim(id, take) {
  const row = mcState.rows.find(r => r.id === id);
  if (!row) return;
  try {
    // Garde-fou serveur : on ne prend la main que si personne d'autre ne l'a fait entre-temps.
    const filter = take ? `&or=(claimed_by.is.null,claimed_by.eq.${currentUser.id})` : `&claimed_by=eq.${currentUser.id}`;
    const rows = await mcRest(`missed_calls?id=eq.${id}&callback=eq.pending${filter}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(take ? { claimed_by: currentUser.id, claimed_at: new Date().toISOString() } : { claimed_by: null, claimed_at: null }),
    });
    if (!rows.length) { await renderMissedCalls(); alert('Un collègue a déjà pris en charge ce rappel.'); return; }
    Object.assign(row, rows[0]);
    mcPaint();
  } catch (e) { alert(`Action impossible : ${e.message}`); }
}

// ---------- Saisie ----------
function mcOpenEdit(id, markDone = false) {
  const row = id ? mcState.rows.find(r => r.id === id) : null;
  mcEdit = { row, busy: false };
  let overlay = mcEl('mc-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mc-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) mcCloseEdit(); });
    document.body.appendChild(overlay);
  }
  const agents = mcAgents();
  const me = currentUser.role === 'agent' ? currentUser.id : '';
  const by = row?.callback_by || (row?.callback_by_other ? '__other' : markDone ? currentUser.id : '');
  const callback = markDone ? '5' : row?.callback || 'pending';
  overlay.innerHTML = `<div class="modal dr-modal mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-title">
    <div class="modal-header"><div class="modal-title" id="mc-title">${row ? 'Appel manqué' : 'Nouvel appel manqué'}</div><button class="modal-close" type="button" onclick="mcCloseEdit()" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <div class="dr-form-grid">
        <label class="dr-field"><span>Date</span><input class="form-input" type="date" id="mc-date" max="${mcToday()}" value="${row?.call_date || mcToday()}"></label>
        <label class="dr-field"><span>Heure de l’appel</span><input class="form-input" type="time" id="mc-time" value="${mcHm(row?.call_time) || mcNowTime()}"></label>
        <label class="dr-field"><span>Agent</span><select class="form-input" id="mc-agent">${agents.map(a => `<option value="${a.id}" ${(row?.agent_id || me) === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}</select></label>
        <label class="dr-field"><span>Cause</span><select class="form-input" id="mc-cause"><option value="">Choisir…</option>${MC_CAUSES.map(c => `<option ${row?.cause === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}</select></label>
        <label class="dr-field"><span>ID call (Ringover)</span><input class="form-input" id="mc-ref" maxlength="60" value="${escHtml(row?.call_ref || '')}" autocomplete="off"><small id="mc-ref-warn" class="mc-warn"></small></label>
        <label class="dr-field"><span>Rappelé ?</span><select class="form-input" id="mc-callback">${Object.entries(MC_CALLBACK).map(([k, l]) => `<option value="${k}" ${callback === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="dr-field"><span>Rappelé par</span><select class="form-input" id="mc-by"><option value="">—</option>${agents.map(a => `<option value="${a.id}" ${by === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('')}<option value="__other" ${by === '__other' ? 'selected' : ''}>Autre (Agent OS…)</option></select></label>
        <label class="dr-field" id="mc-by-other-wrap" ${by === '__other' ? '' : 'hidden'}><span>Nom</span><input class="form-input" id="mc-by-other" maxlength="60" value="${escHtml(row?.callback_by_other || 'Agent OS')}"></label>
        <label class="dr-field"><span>Heure de rappel</span><input class="form-input" type="time" id="mc-cb-time" value="${mcHm(row?.callback_time) || (markDone ? mcNowTime() : '')}"></label>
      </div>
      <label class="dr-field dr-field-wide"><span>Notes / action faite</span><textarea class="form-input" id="mc-notes" rows="2" maxlength="1000" placeholder="ex. Rappelé, messagerie — message laissé">${escHtml(row?.notes || '')}</textarea></label>
      <div class="dr-status" id="mc-status" role="status"></div>
    </div>
    <div class="modal-footer">
      ${row && (row.created_by === currentUser.id || mcIsManager()) ? '<button class="btn btn-ghost dr-delete" type="button" onclick="mcDelete()">Supprimer</button>' : ''}
      <button class="btn btn-ghost" type="button" onclick="mcCloseEdit()">Annuler</button>
      <button class="btn btn-primary" type="button" id="mc-save" onclick="mcSave()">Enregistrer</button>
    </div></div>`;
  overlay.classList.remove('hidden');
  mcEl('mc-by').addEventListener('change', e => { mcEl('mc-by-other-wrap').hidden = e.target.value !== '__other'; });
  mcEl('mc-ref').addEventListener('input', mcCheckDuplicate);
  mcEl('mc-callback').addEventListener('change', e => {
    if (['5', '10', '10+'].includes(e.target.value)) { if (!mcEl('mc-by').value) mcEl('mc-by').value = currentUser.role === 'agent' ? currentUser.id : ''; if (!mcEl('mc-cb-time').value) mcEl('mc-cb-time').value = mcNowTime(); }
  });
  mcCheckDuplicate();
  (row ? mcEl(markDone ? 'mc-notes' : 'mc-cause') : mcEl('mc-cause')).focus();
}
function mcCloseEdit() { mcEdit = null; mcEl('mc-overlay')?.classList.add('hidden'); }

// Même ID call déjà saisi (vérifié aussi côté serveur à l'enregistrement).
function mcCheckDuplicate() {
  const ref = mcEl('mc-ref')?.value.trim();
  const dup = ref ? mcState.rows.find(r => r.call_ref === ref && r.id !== mcEdit?.row?.id) : null;
  mcEl('mc-ref-warn').textContent = dup ? `Déjà saisi : ${mcName(dup.agent_id)} à ${mcHm(dup.call_time)} (${MC_CALLBACK[dup.callback]})` : '';
  return dup;
}

async function mcSave() {
  if (!mcEdit || mcEdit.busy) return;
  const status = mcEl('mc-status');
  const cause = mcEl('mc-cause').value, time = mcEl('mc-time').value, date = mcEl('mc-date').value;
  const callback = mcEl('mc-callback').value, byValue = mcEl('mc-by').value;
  if (!date || !time || !cause) { status.textContent = 'Date, heure et cause sont obligatoires.'; return; }
  if (date > mcToday()) { status.textContent = 'La date ne peut pas être dans le futur.'; return; }
  if (['5', '10', '10+'].includes(callback) && !byValue) { status.textContent = 'Indique qui a rappelé.'; return; }
  const ref = mcEl('mc-ref').value.trim();
  const state = mcEdit;
  state.busy = true;
  mcEl('mc-save').disabled = true;
  try {
    if (ref) {
      const same = await mcRest(`missed_calls?select=id,agent_id,call_time&call_ref=eq.${encodeURIComponent(ref)}&limit=5`);
      const dup = same.find(r => r.id !== state.row?.id);
      if (dup && !confirm(`Cet ID call est déjà dans le journal (${mcName(dup.agent_id)} à ${mcHm(dup.call_time)}). L’enregistrer quand même ?`)) throw new Error('Doublon non enregistré.');
    }
    const payload = {
      call_date: date, call_time: time, agent_id: mcEl('mc-agent').value || null, cause, callback,
      callback_by: byValue && byValue !== '__other' ? byValue : null,
      callback_by_other: byValue === '__other' ? mcEl('mc-by-other').value.trim() || 'Agent OS' : null,
      callback_time: mcEl('mc-cb-time').value || null, call_ref: ref || null,
      notes: mcEl('mc-notes').value.trim() || null,
    };
    if (callback !== 'pending') Object.assign(payload, { claimed_by: null, claimed_at: null });
    const rows = state.row
      ? await mcRest(`missed_calls?id=eq.${state.row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      : await mcRest('missed_calls', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ...payload, created_by: currentUser.id }) });
    if (!Array.isArray(rows) || !rows.length) throw new Error('enregistrement refusé');
    mcCloseEdit();
    await renderMissedCalls();
  } catch (e) {
    state.busy = false;
    if (mcEl('mc-save')) mcEl('mc-save').disabled = false;
    status.textContent = e.message === 'Doublon non enregistré.' ? e.message : `Non enregistré : ${e.message}`;
  }
}

async function mcDelete() {
  if (!mcEdit?.row || !confirm('Supprimer cet appel manqué du journal ?')) return;
  try {
    const rows = await mcRest(`missed_calls?id=eq.${mcEdit.row.id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!rows.length) throw new Error('suppression refusée');
    mcCloseEdit();
    await renderMissedCalls();
  } catch (e) { mcEl('mc-status').textContent = `Non supprimé : ${e.message}`; }
}

// ---------- Statistiques (admin / superviseur) ----------
function mcStats(list) {
  const total = list.length;
  const done = list.filter(mcIsDone).length;
  const lost = list.filter(r => r.callback === 'none').length;
  const pending = list.filter(r => r.callback === 'pending').length;
  const fast = list.filter(r => r.callback === '5').length;
  // Pourcentage à une décimale, écrit à la française (33,3).
  const pct = n => total ? String(Math.round(n / total * 1000) / 10).replace('.', ',') : null;
  const shifts = MC_SHIFTS.map(([label, from, to]) => ({ label: `${label} (${from.slice(0, 2)}–${to.slice(0, 2)}h)`, count: list.filter(r => mcHm(r.call_time) >= from && mcHm(r.call_time) < to).length }));
  const causes = MC_CAUSES.map(c => ({ cause: c, count: list.filter(r => r.cause === c).length })).filter(c => c.count).sort((a, b) => b.count - a.count);
  const agents = mcAgents().map(a => {
    const mine = list.filter(r => r.agent_id === a.id);
    const ok = mine.filter(mcIsDone).length;
    const byMe = list.filter(r => r.callback_by === a.id).length;
    return { agent: a, missed: mine.length, recalled: ok, lost: mine.filter(r => r.callback === 'none').length, rate: mine.length ? Math.round(ok / mine.length * 100) : null, callbacks: byMe };
  }).filter(x => x.missed || x.callbacks).sort((a, b) => b.missed - a.missed);
  const hours = Array.from({ length: 16 }, (_, i) => { const h = 7 + i; return { h, count: list.filter(r => Number(mcHm(r.call_time).slice(0, 2)) === h).length }; });
  return { total, done, lost, pending, fast, rate: pct(done), fastRate: pct(fast), shifts, causes, agents, hours };
}

function mcAnalysis(s) {
  if (!s.total) return ['Aucun appel manqué sur la période : rien à signaler.'];
  const notes = [];
  if (s.rate !== null) notes.push(parseFloat(s.rate.replace(',', '.')) >= 90 ? `Taux de rappel de ${s.rate} % : objectif client (≥ 90 %) atteint.` : `Taux de rappel de ${s.rate} % : sous l’objectif client de 90 % — ${s.lost} appel${s.lost > 1 ? 's' : ''} non rappelé${s.lost > 1 ? 's' : ''}.`);
  if (s.pending) notes.push(`${s.pending} appel${s.pending > 1 ? 's' : ''} encore à rappeler : à traiter en priorité.`);
  if (s.causes[0]) notes.push(`Première cause : « ${s.causes[0].cause} » (${Math.round(s.causes[0].count / s.total * 100)} %) → ${MC_ACTIONS[s.causes[0].cause]}.`);
  const peak = s.hours.reduce((a, b) => (b.count > a.count ? b : a), { count: 0 });
  if (peak.count) notes.push(`Pic de manqués entre ${peak.h}h et ${peak.h + 1}h (${peak.count}) : renforcer la couverture appels sur ce créneau.`);
  const worst = s.agents.find(x => x.missed >= 3 && x.rate !== null && x.rate < 80);
  if (worst) notes.push(`${worst.agent.name} : ${worst.missed} manqués, ${worst.rate} % rappelés — faire un point.`);
  return notes;
}

function mcClientMessage(s) {
  const [from, to] = mcPeriod();
  return [`Bonjour,`, '', `Voici le rapport de gestion des appels de l’équipe Madagascar pour la période du ${mcDayLabel(from)} au ${mcDayLabel(to)} :`, '',
    `• Appels manqués : ${s.total}`, `• Taux de rappel : ${s.rate ?? '—'} %${s.fastRate !== null ? ` (dont ${s.fastRate} % en moins de 5 min)` : ''}`, `• Appels non rappelés : ${s.lost}`,
    ...(s.causes.length ? ['', 'Principales causes et actions :', ...s.causes.slice(0, 3).map(c => `• ${c.cause} (${c.count}) : ${MC_ACTIONS[c.cause]}`)] : []),
    '', 'Nous restons mobilisés pour atteindre zéro appel non suivi.', '', 'Cordialement,'].join('\n');
}

function mcStatsHtml() {
  const s = mcStats(mcFiltered());
  const maxHour = Math.max(1, ...s.hours.map(h => h.count));
  return `<div class="mc-kpis">${[['Appels manqués', s.total, ''], ['Rappelés', s.done, ''], ['Non rappelés', s.lost, s.lost ? 'is-alert' : ''], ['Taux de rappel', s.rate === null ? '—' : s.rate + ' %', s.rate === null ? '' : parseFloat(s.rate.replace(',', '.')) >= 90 ? 'is-good' : 'is-alert'], ['Rappel < 5 min', s.fastRate === null ? '—' : s.fastRate + ' %', ''], ['Encore à rappeler', s.pending, s.pending ? 'is-warn' : '']].map(([l, v, c]) => `<div class="${c}"><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="mc-stats-grid">
      <section class="dr-week-card"><h3>Par agent</h3>${s.agents.length ? `<table class="dr-table mc-mini"><thead><tr><th>Agent</th><th>Manqués</th><th>Rappelés</th><th>Non rappelés</th><th>Taux</th><th>A rappelé</th></tr></thead><tbody>${s.agents.map(x => `<tr><td>${escHtml(x.agent.name)}</td><td>${x.missed}</td><td>${x.recalled}</td><td>${x.lost ? `<b class="dr-down">${x.lost}</b>` : 0}</td><td>${x.rate === null ? '—' : `<span class="dr-status ${x.rate >= 90 ? 'is-good' : x.rate >= 70 ? 'is-warn' : 'is-alert'}">${x.rate} %</span>`}</td><td>${x.callbacks}</td></tr>`).join('')}</tbody></table>` : '<p class="dr-muted">Aucun appel.</p>'}</section>
      <section class="dr-week-card"><h3>Par cause</h3>${s.causes.length ? `<div class="mc-causes">${s.causes.map(c => `<div><span>${escHtml(c.cause)}<small>${escHtml(MC_ACTIONS[c.cause])}</small></span><b>${c.count}</b><em>${Math.round(c.count / s.total * 100)} %</em><i><u style="width:${Math.round(c.count / s.causes[0].count * 100)}%"></u></i></div>`).join('')}</div>` : '<p class="dr-muted">Aucune cause.</p>'}</section>
      <section class="dr-week-card"><h3>Par heure (7h–23h)</h3><div class="mc-hours">${s.hours.map(h => `<div title="${h.h}h–${h.h + 1}h : ${h.count}"><i style="height:${Math.max(3, Math.round(h.count / maxHour * 100))}%" class="${h.count ? '' : 'is-zero'}"></i><small>${h.h}</small></div>`).join('')}</div>
        <div class="mc-shifts">${s.shifts.map(x => `<span>${x.label} : <b>${x.count}</b></span>`).join('')}</div></section>
      <section class="dr-week-card"><h3>Analyse</h3><ul>${mcAnalysis(s).map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></section>
    </div>
    <div class="dr-week-bottom mc-client"><section class="dr-week-card"><h3>Message client (rapport) <button type="button" class="dr-edit-btn" onclick="mcCopyMessage()">Copier</button></h3><textarea class="form-input" id="mc-message" rows="11">${escHtml(mcClientMessage(s))}</textarea><small class="dr-muted" id="mc-copy-status">Modifiable avant de copier. Objectifs repris du Sheet : ≤ 3 manqués, ≥ 90 % rappelés, 0 appel perdu.</small></section></div>`;
}
async function mcCopyMessage() {
  const text = mcEl('mc-message')?.value || '';
  try { await navigator.clipboard.writeText(text); mcEl('mc-copy-status').textContent = 'Message copié.'; }
  catch (_) { mcEl('mc-message').select(); mcEl('mc-copy-status').textContent = 'Sélectionné : fais Ctrl+C pour copier.'; }
}
function mcExportCsv() {
  const list = mcFiltered();
  const esc = v => { const t = String(v ?? ''); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ['Date', 'Heure', 'Agent', 'Cause', 'Rappelé ?', 'Rappelé par', 'ID call', 'Heure de rappel', 'Notes / Action'];
  const rows = list.map(r => [r.call_date, mcHm(r.call_time), mcName(r.agent_id), r.cause, MC_CALLBACK[r.callback], mcCalledBy(r), r.call_ref || '', mcHm(r.callback_time), r.notes || '']);
  const [from, to] = mcPeriod();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + [head, ...rows].map(r => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  link.download = `taskin-appels-manques-${from}_${to}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
