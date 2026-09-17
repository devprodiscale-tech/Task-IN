// ===== SUPERVISION : Cas complexes, Grille d'écoute, Coaching 1:1 =====
let svSubTab = 'escalations';
let escalations = [];
let qualityReviews = [];
let coachingSheets = [];
const SV_GRID = [
  { key: 'accueillir', label: '1. ACCUEILLIR', items: [
    { id: '1.1', label: 'Phrase d\u2019accueil', cible: 4 },
    { id: '1.2', label: 'Identification complète', cible: 3 },
    { id: '1.3', label: 'Personnalisation du client', cible: 3 },
    { id: '1.4', label: 'Situation Inacceptable (SI) — Conformité RGPD', cible: 0, si: true },
  ]},
  { key: 'comprendre', label: '2. COMPRENDRE', items: [
    { id: '2.1', label: 'Reformulation pertinente', cible: 8 },
    { id: '2.2', label: 'Questionnement pertinent et ciblé', cible: 8 },
    { id: '2.3', label: 'Gestion de la mise en attente', cible: 4 },
  ]},
  { key: 'construire', label: '3. CONSTRUIRE', items: [
    { id: '3.1', label: 'Exploitation des historiques', cible: 3 },
    { id: '3.2', label: 'Analyse pertinente du dossier', cible: 4 },
    { id: '3.3', label: 'Respect des procédures (client et/ou interne)', cible: 3 },
    { id: '3.4', label: 'Clarté des explications', cible: 4 },
    { id: '3.5', label: 'Pertinence de la solution apportée', cible: 5 },
    { id: '3.6', label: 'Mise en valeur de la solution', cible: 4 },
    { id: '3.7', label: 'Choix des mots / Vocabulaire & Langage', cible: 2 },
    { id: '3.8', label: 'Gestion des blancs', cible: 2 },
    { id: '3.9', label: 'Image de marque', cible: 3 },
    { id: '3.10', label: 'Maîtrise de l\u2019entretien', cible: 3 },
    { id: '3.11', label: 'Traitement des objections', cible: 4 },
    { id: '3.12', label: 'Exploitation des outils', cible: 3 },
    { id: '3.13', label: 'Situation Inacceptable (SI) — Solution incomplète ou erronée', cible: 0, si: true },
    { id: '3.14', label: 'Situation Inacceptable (SI) — Image de marque', cible: 0, si: true },
  ]},
  { key: 'accompagner', label: '4. ACCOMPAGNER', items: [
    { id: '4.1', label: 'Empathie', cible: 4 },
    { id: '4.2', label: 'Intention positive', cible: 3 },
    { id: '4.3', label: 'Amabilité & courtoisie', cible: 3 },
    { id: '4.5', label: 'Directivité', cible: 2 },
    { id: '4.6', label: 'Dynamisme & Sourire', cible: 2 },
    { id: '4.7', label: 'Écoute active', cible: 3 },
    { id: '4.8', label: 'Gestion du transfert', cible: 3 },
    { id: '4.9', label: 'Situation Inacceptable (SI) — Posture et attitude', cible: 0, si: true },
  ]},
  { key: 'cloturer', label: '5. CLÔTURER', items: [
    { id: '5.1', label: 'Résumer', cible: 2 },
    { id: '5.2', label: 'Verrouillage de l\u2019appel', cible: 2 },
    { id: '5.3', label: 'Prise de congé', cible: 2 },
    { id: '5.4', label: 'Historisation', cible: 2 },
    { id: '5.5', label: 'Tag', cible: 2 },
    { id: '5.6', label: 'Situation Inacceptable (SI) — Mettre fin à un appel volontairement', cible: 0, si: true },
  ]},
];
const SV_CONFORMITE_LEVELS = [
  { value: 'conforme', label: 'Conforme', factor: 1 },
  { value: 'partiel', label: 'Partiellement conforme', factor: 0.5 },
  { value: 'non_conforme', label: 'Non conforme', factor: 0 },
  { value: 'na', label: 'Non applicable', factor: null },
];
// Rétrocompatibilité : anciennes grilles enregistrées avec le système à 7 critères /5
const SV_REVIEW_CRITERIA_LEGACY = [
  { key: 'accueil' }, { key: 'ecoute' }, { key: 'diagnostic' }, { key: 'process' },
  { key: 'solution' }, { key: 'ton' }, { key: 'cloture' },
];
function svReviewPct(r) {
  if (!r) return 0;
  if (typeof r.totalScorePct === 'number') return r.totalScorePct;
  if (r.scores) {
    const vals = SV_REVIEW_CRITERIA_LEGACY.map(c => Number(r.scores[c.key] || 0));
    return Math.round((vals.reduce((a, b) => a + b, 0) / SV_REVIEW_CRITERIA_LEGACY.length) / 5 * 100);
  }
  return 0;
}
function svComputeGridScore(values) {
  let sumCible = 0, sumRealise = 0, siTriggered = false;
  const pilierResults = {};
  SV_GRID.forEach(pilier => {
    let pCible = 0, pRealise = 0;
    pilier.items.forEach(item => {
      if (item.si) {
        if (values[item.id] && values[item.id].si) siTriggered = true;
        return;
      }
      const level = values[item.id] && values[item.id].level;
      const lvl = SV_CONFORMITE_LEVELS.find(l => l.value === level);
      if (!lvl || lvl.factor === null) return; // non renseigné ou N/A
      pCible += item.cible;
      pRealise += item.cible * lvl.factor;
    });
    pilierResults[pilier.key] = { cible: pCible, realise: pRealise, pct: pCible ? Math.round(pRealise / pCible * 100) : null };
    sumCible += pCible; sumRealise += pRealise;
  });
  const rawPct = sumCible ? Math.round(sumRealise / sumCible * 100) : 0;
  return { totalPct: siTriggered ? 0 : rawPct, rawPct, siTriggered, pilierResults };
}

function svNewId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function svFetchCollection(name) {
  const supabase = window.taskinDataProviders?.supabase;
  if (supabase?.enabled()) {
    try {
      const table = name === 'complexCases' || name === 'escalations' ? 'complex_cases' : name === 'qualityReviews' ? 'coaching_reviews' : name === 'coachingSheets' ? 'coaching_sheets' : name;
      const rows = await supabase.listTable(table, 500);
      return (rows || []).map(row => {
        const data = row.data && typeof row.data === 'object' ? row.data : {};
        if (table === 'complex_cases') return { id: row.id, ...data, title: row.title || data.title || '', description: row.description || data.description || '', agentId: row.agent_id || data.agentId || '', status: row.status || data.status || 'nouveau', priority: row.priority || data.priority || 'medium', createdAt: data.createdAt || new Date(row.created_at).getTime(), _collection: name === 'complexCases' ? 'complexCases' : 'escalations' };
        if (table === 'coaching_reviews') return { id: row.id, ...data, agentId: row.agent_id || data.agentId || '', reviewerId: row.reviewer_id || data.reviewerId || '' };
        if (table === 'coaching_sheets') return { id: row.id, ...data, agentId: row.agent_id || data.agentId || '', supervisorId: row.supervisor_id || data.supervisorId || '' };
        return { id: row.id, ...data };
      });
    } catch (e) { console.error('svFetchCollection Supabase', name, e); return []; }
  }
  try {
    const res = await apiFetch(`${BASE_URL}/${name}?key=${FIREBASE_API_KEY}&pageSize=500`);
    const data = await res.json();
    return (data.documents || []).map(d => ({ id: d.name.split('/').pop(), ...docFromFirestoreFields(d.fields) }));
  } catch (e) { console.error('svFetchCollection', name, e); return []; }
}
async function svCreateDoc(collection, obj) {
  if (!requireRoles('admin', 'supervisor')) return null;
  const supabase = window.taskinDataProviders?.supabase;
  if (supabase?.enabled()) {
    const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
    const row = table === 'complex_cases'
      ? { agent_id: obj.agentId || null, owner_id: currentUser.id, status: obj.status || 'nouveau', priority: obj.priority || 'medium', title: obj.title || '', description: obj.description || '', data: obj }
      : table === 'coaching_reviews'
        ? { agent_id: obj.agentId || null, reviewer_id: obj.reviewerId || currentUser.id, channel: obj.channel || '', review_date: obj.reviewDate || null, scores: obj.scores || {}, data: obj }
        : { agent_id: obj.agentId || null, supervisor_id: obj.supervisorId || currentUser.id, sheet_date: obj.sheetDate || null, objectives: obj.objectives || [], notes: obj.notes || '', data: obj };
    const created = await supabase.insertRow(table, row);
    return Array.isArray(created) ? created[0]?.id || null : created?.id || null;
  }
  const res = await apiFetch(`${BASE_URL}/${collection}?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: docToFirestoreFields(obj) }),
  });
  const data = await res.json();
  return data.name ? data.name.split('/').pop() : null;
}
async function svUpdateDoc(collection, id, obj) {
  if (!requireRoles('admin', 'supervisor')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (supabase?.enabled()) {
    const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
    const row = table === 'complex_cases'
      ? { agent_id: obj.agentId || null, status: obj.status || 'nouveau', priority: obj.priority || 'medium', title: obj.title || '', description: obj.description || '', data: obj }
      : table === 'coaching_reviews'
        ? { agent_id: obj.agentId || null, reviewer_id: obj.reviewerId || currentUser.id, scores: obj.scores || {}, data: obj }
        : { agent_id: obj.agentId || null, supervisor_id: obj.supervisorId || currentUser.id, objectives: obj.objectives || [], notes: obj.notes || '', data: obj };
    await supabase.updateRow(table, id, row);
    return;
  }
  await apiFetch(`${BASE_URL}/${collection}/${id}?key=${FIREBASE_API_KEY}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: docToFirestoreFields(obj) }),
  });
}
async function svDeleteDoc(collection, id) {
  if (!requireRoles('admin', 'supervisor')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (supabase?.enabled()) {
    const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
    await supabase.deleteRow(table, id);
    return;
  }
  await apiFetch(`${BASE_URL}/${collection}/${id}?key=${FIREBASE_API_KEY}`, { method: 'DELETE' });
}

function svAgentOptions(selectedId) {
  return agentsOnly().map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.name}</option>`).join('');
}
function svAgentName(id) { const a = TEAM.find(t => t.id === id); return a ? a.name : id; }

function svNormalizeEscalation(e, collection = 'escalations') {
  const createdAt = typeof e.createdAt === 'number' ? e.createdAt : (e.createdAt ? (Date.parse(e.createdAt) || Date.now()) : Date.now());
  return { ...e, _collection: e._collection || collection, agentId: e.agentId || e.createdBy || '', channel: e.channel || 'ticket', priority: e.priority || 'medium', status: e.status || 'nouveau', deadlineAt: e.deadlineAt || null, linkedProcedureId: e.linkedProcedureId || null, updates: Array.isArray(e.updates) ? e.updates : [], createdAt };
}
async function svInit() {
  const [sharedEsc, legacyEsc, rev, coach] = await Promise.all([
    svFetchCollection('escalations'), svFetchCollection('complexCases'), svFetchCollection('qualityReviews'), svFetchCollection('coachingSheets'),
  ]);
  escalations = [...sharedEsc.map(e => svNormalizeEscalation(e, 'escalations')), ...legacyEsc.map(e => svNormalizeEscalation(e, 'complexCases'))];
  qualityReviews = rev; coachingSheets = coach;
  renderOpsVisuals();
  svUpdateAlertBadge();
  svSwitchSubTab(svSubTab);
}
function svUpdateAlertBadge() {
  const now = Date.now();
  const overdue = escalations.filter(e => e.status !== 'resolu' && e.deadlineAt && e.deadlineAt < now).length;
  const badge = document.getElementById('sv-alert-count');
  if (!badge) return;
  badge.textContent = overdue;
  badge.classList.toggle('hidden', overdue === 0);
}
function svSwitchSubTab(tab) {
  svSubTab = tab;
  ['overview', 'escalations', 'reviews', 'coaching', 'reporting'].forEach(t => {
    document.getElementById('sv-tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('sv-view-' + t).classList.toggle('hidden', t !== tab);
  });
  if (tab === 'overview') svRenderOverview();
  if (tab === 'escalations') svRenderEscalations();
  if (tab === 'reviews') svRenderReviews();
  if (tab === 'coaching') svRenderCoaching();
  if (tab === 'reporting') svRenderReporting();
}

// ---- CAS COMPLEXES ----
const SV_STATUS_LABEL = { nouveau: 'Nouveau', en_cours: 'En cours', attente_client: 'Attente client', resolu: 'Résolu' };
const SV_PRIORITY_LABEL = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgent' };

function svRenderEscalations() {
  const statusF = document.getElementById('sv-esc-status-filter').value;
  const prioF = document.getElementById('sv-esc-priority-filter').value;
  let list = [...escalations];
  if (statusF !== '__all') list = list.filter(e => e.status === statusF);
  if (prioF !== '__all') list = list.filter(e => e.priority === prioF);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  document.getElementById('sv-esc-count-badge').textContent = `${list.length} cas`;
  const container = document.getElementById('sv-escalations-list');
  if (!list.length) { container.innerHTML = '<div class="sv-empty">Aucun cas complexe pour ces filtres.</div>'; return; }
  const now = Date.now();
  container.innerHTML = list.map(e => {
    const overdue = e.status !== 'resolu' && e.deadlineAt && e.deadlineAt < now;
    const meta = CHANNEL_META[e.channel] || CHANNEL_META.ticket;
    return `<div class="sv-card" onclick="svOpenEscalationModal('${e.id}')">
      <div class="sv-card-head">
        <div>
          <div class="sv-card-title">${docEsc(e.title || 'Sans titre')}</div>
          <div class="sv-card-meta">${svAgentName(e.agentId)} · ${meta.icon} ${meta.label} · ${e.createdAt ? new Date(e.createdAt).toLocaleDateString('fr-FR') : ''}${e.deadlineAt ? ' · Échéance ' + new Date(e.deadlineAt).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${overdue ? '<span class="sv-pill sv-pill-overdue">⏰ En retard</span>' : ''}
          <span class="sv-pill sv-pill-${e.priority}">${SV_PRIORITY_LABEL[e.priority] || e.priority}</span>
          <span class="sv-pill sv-pill-${e.status}">${SV_STATUS_LABEL[e.status] || e.status}</span>
        </div>
      </div>
      <div style="font-size:12.5px;color:var(--text2)">${docEsc((e.description || '').slice(0, 160))}${(e.description || '').length > 160 ? '…' : ''}</div>
    </div>`;
  }).join('');
}

let svEditingEscalationId = null;
function svOpenEscalationModal(id) {
  svEditingEscalationId = id;
  const e = id ? escalations.find(x => x.id === id) : null;
  document.getElementById('sv-esc-modal-title').textContent = e ? 'Modifier le cas' : 'Nouveau cas complexe';
  document.getElementById('sv-esc-title').value = e?.title || '';
  document.getElementById('sv-esc-description').value = e?.description || '';
  document.getElementById('sv-esc-agent').innerHTML = svAgentOptions(e?.agentId);
  document.getElementById('sv-esc-channel').value = e?.channel || 'ticket';
  document.getElementById('sv-esc-priority').value = e?.priority || 'medium';
  document.getElementById('sv-esc-status').value = e?.status || 'nouveau';
  document.getElementById('sv-esc-deadline').value = e?.deadlineAt ? svToDatetimeLocal(e.deadlineAt) : '';
  document.getElementById('sv-esc-procedure').innerHTML = '<option value="">—</option>' + docProcedures.map(p => `<option value="${p.id}" ${p.id === e?.linkedProcedureId ? 'selected' : ''}>${docEsc(p.title)}</option>`).join('');
  document.getElementById('sv-esc-error').textContent = '';
  document.getElementById('sv-esc-delete-btn').style.display = e ? 'inline-flex' : 'none';
  const updatesWrap = document.getElementById('sv-esc-updates-wrap');
  updatesWrap.style.display = e ? 'block' : 'none';
  svRenderEscalationUpdates(e?.updates || []);
  document.getElementById('sv-esc-overlay').classList.remove('hidden');
}
function svToDatetimeLocal(ms) {
  const d = new Date(ms); const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function svRenderEscalationUpdates(updates) {
  const el = document.getElementById('sv-esc-updates-list');
  if (!updates.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text2)">Aucune note de suivi.</div>'; return; }
  el.innerHTML = updates.slice().reverse().map(u => `<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)"><strong>${svAgentName(u.by)}</strong> · ${new Date(u.at).toLocaleString('fr-FR')}<br>${docEsc(u.note)}</div>`).join('');
}
let svPendingUpdates = null;
function svAddEscalationUpdate() {
  const input = document.getElementById('sv-esc-new-update');
  const note = input.value.trim();
  if (!note) return;
  const e = escalations.find(x => x.id === svEditingEscalationId);
  if (!e) return;
  e.updates = e.updates || [];
  e.updates.push({ by: currentUser.id, at: Date.now(), note });
  input.value = '';
  svRenderEscalationUpdates(e.updates);
}
function svCloseEscalationModal() { document.getElementById('sv-esc-overlay').classList.add('hidden'); svEditingEscalationId = null; }
async function svSaveEscalation() {
  const title = document.getElementById('sv-esc-title').value.trim();
  if (!title) { document.getElementById('sv-esc-error').textContent = 'Le titre est requis.'; return; }
  const deadlineInput = document.getElementById('sv-esc-deadline').value;
  const status = document.getElementById('sv-esc-status').value;
  const existing = svEditingEscalationId ? escalations.find(x => x.id === svEditingEscalationId) : null;
  const obj = {
    title, description: document.getElementById('sv-esc-description').value.trim(),
    agentId: document.getElementById('sv-esc-agent').value,
    channel: document.getElementById('sv-esc-channel').value,
    priority: document.getElementById('sv-esc-priority').value,
    status,
    deadlineAt: deadlineInput ? new Date(deadlineInput).getTime() : null,
    linkedProcedureId: document.getElementById('sv-esc-procedure').value || null,
    updates: existing?.updates || [],
    createdBy: existing?.createdBy || currentUser.id,
    createdAt: existing?.createdAt || Date.now(),
    resolvedAt: status === 'resolu' ? (existing?.resolvedAt || Date.now()) : null,
  };
  try {
    if (svEditingEscalationId) {
      await svUpdateDoc(existing?._collection || 'escalations', svEditingEscalationId, obj);
      Object.assign(existing, obj);
    } else {
      const id = await svCreateDoc('escalations', obj);
      escalations.push({ id, ...obj, _collection: 'escalations' });
    }
    svCloseEscalationModal();
    svUpdateAlertBadge();
    svRenderEscalations();
  } catch (e) { document.getElementById('sv-esc-error').textContent = 'Erreur : ' + e.message; }
}
async function svDeleteEscalation() {
  if (!svEditingEscalationId) return;
  if (!confirm('Supprimer ce cas complexe ?')) return;
  const existing = escalations.find(x => x.id === svEditingEscalationId);
  await svDeleteDoc(existing?._collection || 'escalations', svEditingEscalationId);
  escalations = escalations.filter(x => x.id !== svEditingEscalationId);
  svCloseEscalationModal();
  svUpdateAlertBadge();
  svRenderEscalations();
}

// ---- VUE D'ENSEMBLE ----
function svTeamWeekDMT() {
  const weekEntries = entries.filter(e => isThisWeek(e.startTimeStr));
  if (!weekEntries.length) return { dmtMin: 0, label: '0min' };
  const totalSec = weekEntries.reduce((s, e) => s + e.durationSec, 0);
  const dmtSec = totalSec / weekEntries.length;
  return { dmtMin: dmtSec / 60, label: Math.floor(dmtSec / 60) + 'min' };
}
function svAgentWeekDMT(agentId) {
  const list = entries.filter(e => e.agent === agentId && isThisWeek(e.startTimeStr));
  if (!list.length) return null;
  const totalSec = list.reduce((s, e) => s + e.durationSec, 0);
  return (totalSec / list.length) / 60;
}
function svLatestReview(agentId) {
  const list = qualityReviews.filter(r => r.agentId === agentId).sort((a, b) => (b.date || 0) - (a.date || 0));
  return list[0] || null;
}
function svAgentReviews(agentId) {
  return qualityReviews.filter(r => r.agentId === agentId).sort((a, b) => (a.date || 0) - (b.date || 0));
}
function svLatestCoaching(agentId) {
  const list = coachingSheets.filter(c => c.agentId === agentId).sort((a, b) => (b.date || 0) - (a.date || 0));
  return list[0] || null;
}
function svComputeWatchlist() {
  const agents = agentsOnly();
  const teamDMT = svTeamWeekDMT().dmtMin;
  const activeToday = new Set(entries.filter(e => isToday(e.startTimeStr)).map(e => e.agent));
  const reasons = [];
  agents.forEach(a => {
    const openUrgent = escalations.filter(e => e.agentId === a.id && e.status !== 'resolu');
    const overdueCase = openUrgent.find(e => e.deadlineAt && e.deadlineAt < Date.now());
    const review = svLatestReview(a.id);
    const dmt = svAgentWeekDMT(a.id);
    if (overdueCase) { reasons.push({ agent: a, severity: 4, reason: `Cas en retard : "${overdueCase.title}"`, color: 'danger' }); return; }
    if (review && svReviewPct(review) < 60) { reasons.push({ agent: a, severity: 3, reason: `Score qualité faible (${svReviewPct(review)}%)`, color: 'danger' }); return; }
    if (teamDMT > 0 && dmt && dmt > teamDMT * 1.3) { reasons.push({ agent: a, severity: 2, reason: `DMT élevé (+${Math.round((dmt / teamDMT - 1) * 100)}% vs équipe)`, color: 'warning' }); return; }
    if (!activeToday.has(a.id) && openUrgent.length > 0) { reasons.push({ agent: a, severity: 1, reason: `${openUrgent.length} cas ouvert(s), inactif aujourd'hui`, color: 'warning' }); return; }
  });
  return reasons.sort((a, b) => b.severity - a.severity).slice(0, 5);
}
function svRenderOverview() {
  const now = Date.now();
  const overdue = escalations.filter(e => e.status !== 'resolu' && e.deadlineAt && e.deadlineAt < now);
  const alertEl = document.getElementById('sv-ov-alert');
  alertEl.classList.toggle('hidden', overdue.length === 0);
  if (overdue.length) document.getElementById('sv-ov-alert-text').textContent = `${overdue.length} cas complexe(s) en retard sur leur échéance`;

  const teamDMT = svTeamWeekDMT();
  const reviewsByAgentLatest = agentsOnly().map(a => svLatestReview(a.id)).filter(Boolean);
  const avgScore = reviewsByAgentLatest.length ? Math.round(reviewsByAgentLatest.reduce((s, r) => s + svReviewPct(r), 0) / reviewsByAgentLatest.length) : null;
  const openCases = escalations.filter(e => e.status !== 'resolu');
  const activeToday = new Set(entries.filter(e => isToday(e.startTimeStr)).map(e => e.agent));
  const totalAgents = agentsOnly().length;

  document.getElementById('sv-ov-kpis').innerHTML = `
    <div class="sv-card" style="cursor:default"><div class="sv-card-meta">DMT équipe (semaine)</div><div style="font-family:var(--display);font-weight:700;font-size:22px;margin-top:4px">${teamDMT.label}</div></div>
    <div class="sv-card" style="cursor:default"><div class="sv-card-meta">Score qualité moy.</div><div style="font-family:var(--display);font-weight:700;font-size:22px;margin-top:4px">${avgScore !== null ? avgScore + '%' : '—'}</div></div>
    <div class="sv-card" style="cursor:default"><div class="sv-card-meta">Cas ouverts</div><div style="font-family:var(--display);font-weight:700;font-size:22px;margin-top:4px">${openCases.length}</div>${overdue.length ? `<div style="font-size:11px;color:var(--red);margin-top:2px">${overdue.length} en retard</div>` : ''}</div>
    <div class="sv-card" style="cursor:default"><div class="sv-card-meta">Agents actifs (jour)</div><div style="font-family:var(--display);font-weight:700;font-size:22px;margin-top:4px">${activeToday.size}/${totalAgents}</div></div>
  `;

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const priorityCases = openCases.slice().sort((a, b) => {
    const aOver = a.deadlineAt && a.deadlineAt < now, bOver = b.deadlineAt && b.deadlineAt < now;
    if (aOver !== bOver) return aOver ? -1 : 1;
    return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
  }).slice(0, 4);
  const casEl = document.getElementById('sv-ov-priority-cases');
  casEl.innerHTML = priorityCases.length ? priorityCases.map(e => {
    const isOver = e.deadlineAt && e.deadlineAt < now;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:var(--surface2);margin-bottom:6px;cursor:pointer" onclick="svSwitchSubTab('escalations');setTimeout(()=>svOpenEscalationModal('${e.id}'),50)">
      <span class="sv-pill sv-pill-${e.priority}">${SV_PRIORITY_LABEL[e.priority]}</span>
      <span style="font-size:12.5px;flex:1">${docEsc(e.title)}</span>
      <span style="font-size:11.5px;color:${isOver ? 'var(--red)' : 'var(--text2)'}">${isOver ? 'En retard' : (e.deadlineAt ? new Date(e.deadlineAt).toLocaleDateString('fr-FR') : '')}</span>
    </div>`;
  }).join('') : '<div class="sv-empty" style="padding:14px">Aucun cas ouvert 🎉</div>';

  const watchlist = svComputeWatchlist();
  const wlEl = document.getElementById('sv-ov-watchlist');
  wlEl.innerHTML = watchlist.length ? watchlist.map(w => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-radius:8px;cursor:pointer" onclick="document.getElementById('sv-ov-agent-picker').value='${w.agent.id}';svRenderAgentFocusCard('${w.agent.id}')">
      <div style="width:28px;height:28px;border-radius:50%;background:${w.color === 'danger' ? 'var(--red-dim)' : 'var(--amber-dim)'};color:${w.color === 'danger' ? 'var(--red)' : 'var(--amber)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${w.agent.initials}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12.5px">${w.agent.name}</div><div style="font-size:11px;color:${w.color === 'danger' ? 'var(--red)' : 'var(--amber)'}">${docEsc(w.reason)}</div></div>
    </div>`).join('') : '<div class="sv-empty" style="padding:14px">Rien à signaler 👍</div>';

  const picker = document.getElementById('sv-ov-agent-picker');
  picker.innerHTML = svAgentOptions();
  const defaultAgent = watchlist[0]?.agent.id || agentsOnly()[0]?.id;
  if (defaultAgent) { picker.value = defaultAgent; svRenderAgentFocusCard(defaultAgent); }
  else { document.getElementById('sv-ov-focus-card').innerHTML = '<div class="sv-empty">Aucun agent.</div>'; }
}
function svRenderAgentFocusCard(agentId) {
  const a = TEAM.find(t => t.id === agentId);
  const target = document.getElementById('sv-ov-focus-card');
  if (!a) { target.innerHTML = ''; return; }
  const review = svLatestReview(agentId);
  const scorePct = review ? svReviewPct(review) : null;
  const history = svAgentReviews(agentId);
  const coaching = svLatestCoaching(agentId);
  const avatarStyle = a.photo ? `background-image:url(${a.photo});background-size:cover;background-color:transparent` : `background:${a.color}20;color:${a.color}`;

  let chartHtml = '';
  if (history.length >= 2) {
    const w = 340, h = 64, pad = 10;
    const pts = history.map((r, i) => {
      const pct = svReviewPct(r);
      const x = pad + (i / Math.max(1, history.length - 1)) * (w - pad * 2);
      const y = h - pad - (pct / 100) * (h - pad * 2);
      return { x, y };
    });
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    chartHtml = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px"><path d="${path}" fill="none" stroke="var(--ocean)" stroke-width="2"/><circle cx="${pts[pts.length-1].x.toFixed(1)}" cy="${pts[pts.length-1].y.toFixed(1)}" r="3.5" fill="var(--ocean)"/></svg>`;
  }

  const objectifsHtml = coaching && coaching.objectifs && coaching.objectifs.length
    ? coaching.objectifs.map(o => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="sv-pill sv-pill-${o.status === 'atteint' ? 'resolu' : o.status === 'en cours' ? 'en_cours' : 'low'}" style="min-width:70px;text-align:center">${o.status}</span><span style="font-size:12.5px">${docEsc(o.text)}</span></div>`).join('')
    : '<div class="sv-empty" style="padding:10px">Aucune fiche de coaching.</div>';

  target.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div class="mosaic-avatar" style="${avatarStyle};width:44px;height:44px;font-size:15px">${a.photo ? '' : a.initials}</div>
      <div><div style="font-weight:700;font-size:14.5px">${a.name}</div><div style="font-size:12px;color:var(--text2)">${a.role === 'agent' ? 'Agent' : a.role}</div></div>
      ${scorePct !== null ? `<span class="sv-pill" style="margin-left:auto;background:${scorePct>=70?'var(--green-dim)':scorePct>=50?'var(--amber-dim)':'var(--red-dim)'};color:${scorePct>=70?'var(--green)':scorePct>=50?'var(--amber)':'var(--red)'};font-size:12px;padding:5px 12px">Score ${scorePct}%</span>` : ''}
    </div>
    ${chartHtml ? `<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:12px"><div class="sv-card-meta" style="margin-bottom:6px">Évolution qualité (${history.length} grilles)</div>${chartHtml}</div>` : ''}
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div class="sv-card-meta" style="margin-bottom:8px">Objectifs de coaching</div>
      ${objectifsHtml}
    </div>
    <button class="btn btn-ghost" style="width:100%;margin-top:12px" onclick="svSwitchSubTab('coaching');setTimeout(()=>svOpenCoachingModal(${coaching ? `'${coaching.id}'` : 'null'}, '${a.id}'),50)">${coaching ? 'Ouvrir la fiche complète' : '+ Créer une fiche de coaching'} →</button>
  `;
}

// ---- REPORTING (comparatif périodes, heatmap, timeline) ----
function svWeekWindow(offsetWeeks) {
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay() + 1 + offsetWeeks * 7); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return { start, end };
}
function svEntriesInWindow(win, agentId) {
  return entries.filter(e => {
    if (agentId && e.agent !== agentId) return false;
    const d = getEntryDate(e.startTimeStr);
    return d >= win.start && d < win.end;
  });
}
function svDMTForList(list) {
  if (!list.length) return null;
  return (list.reduce((s, e) => s + e.durationSec, 0) / list.length) / 60;
}
function svAvgQualityInWindow(win) {
  const list = qualityReviews.filter(r => r.date && r.date >= win.start.getTime() && r.date < win.end.getTime());
  if (!list.length) return null;
  return Math.round(list.reduce((s, r) => s + svReviewPct(r), 0) / list.length);
}
function svResolvedCasesInWindow(win) {
  return escalations.filter(e => e.resolvedAt && e.resolvedAt >= win.start.getTime() && e.resolvedAt < win.end.getTime()).length;
}
function svDeltaBadge(now, prev, unit, invert) {
  if (now === null || prev === null || prev === 0) return { text: '—', color: 'var(--text2)' };
  const diff = now - prev;
  const pct = Math.round((diff / prev) * 100);
  const good = invert ? diff <= 0 : diff >= 0;
  const arrow = diff >= 0 ? '↑' : '↓';
  return { text: `${arrow} ${Math.abs(pct)}%`, color: good ? 'var(--green)' : 'var(--red)' };
}
function svRenderReporting() {
  const thisWeek = svWeekWindow(0), lastWeek = svWeekWindow(-1);

  const dmtNow = svDMTForList(svEntriesInWindow(thisWeek));
  const dmtPrev = svDMTForList(svEntriesInWindow(lastWeek));
  const dmtDelta = svDeltaBadge(dmtNow, dmtPrev, 'min', true);

  const scoreNow = svAvgQualityInWindow(thisWeek);
  const scorePrev = svAvgQualityInWindow(lastWeek);
  const scoreDelta = svDeltaBadge(scoreNow, scorePrev, '%', false);

  const casesNow = svResolvedCasesInWindow(thisWeek);
  const casesPrev = svResolvedCasesInWindow(lastWeek);
  const casesDelta = svDeltaBadge(casesNow, casesPrev, '', false);

  document.getElementById('sv-rep-kpis').innerHTML = `
    <div class="sv-card" style="cursor:default">
      <div class="sv-card-meta">DMT moyen</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
        <span style="font-family:var(--display);font-weight:700;font-size:21px">${dmtNow !== null ? Math.round(dmtNow) + 'min' : '—'}</span>
        <span style="font-size:11.5px;color:var(--text2);text-decoration:line-through">${dmtPrev !== null ? Math.round(dmtPrev) + 'min' : ''}</span>
      </div>
      <div style="font-size:12px;color:${dmtDelta.color};margin-top:4px">${dmtDelta.text}</div>
    </div>
    <div class="sv-card" style="cursor:default">
      <div class="sv-card-meta">Score qualité</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
        <span style="font-family:var(--display);font-weight:700;font-size:21px">${scoreNow !== null ? scoreNow + '%' : '—'}</span>
        <span style="font-size:11.5px;color:var(--text2);text-decoration:line-through">${scorePrev !== null ? scorePrev + '%' : ''}</span>
      </div>
      <div style="font-size:12px;color:${scoreDelta.color};margin-top:4px">${scoreDelta.text}</div>
    </div>
    <div class="sv-card" style="cursor:default">
      <div class="sv-card-meta">Cas résolus</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
        <span style="font-family:var(--display);font-weight:700;font-size:21px">${casesNow}</span>
        <span style="font-size:11.5px;color:var(--text2);text-decoration:line-through">${casesPrev}</span>
      </div>
      <div style="font-size:12px;color:${casesDelta.color}">${casesDelta.text}</div>
    </div>
  `;

  const agents = agentsOnly();
  const heatEl = document.getElementById('sv-rep-heatmap');
  heatEl.innerHTML = agents.map(a => {
    const review = svLatestReview(a.id);
    if (!review) return `<div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center;cursor:pointer" onclick="svSwitchSubTab('overview');setTimeout(()=>{document.getElementById('sv-ov-agent-picker').value='${a.id}';svRenderAgentFocusCard('${a.id}')},50)"><div style="font-size:11px;color:var(--text2)">${a.name}</div><div style="font-size:10px;color:var(--text2);margin-top:4px">Pas de donnée</div></div>`;
    const pct = svReviewPct(review);
    const bg = pct >= 75 ? 'var(--green-dim)' : pct >= 55 ? 'var(--amber-dim)' : 'var(--red-dim)';
    const fg = pct >= 75 ? 'var(--green)' : pct >= 55 ? 'var(--amber)' : 'var(--red)';
    return `<div style="background:${bg};border-radius:8px;padding:8px;text-align:center;cursor:pointer" onclick="svSwitchSubTab('overview');setTimeout(()=>{document.getElementById('sv-ov-agent-picker').value='${a.id}';svRenderAgentFocusCard('${a.id}')},50)">
      <div style="font-size:11px;font-weight:600;color:${fg}">${a.name}</div>
      <div style="font-family:var(--display);font-weight:700;font-size:16px;color:${fg};margin-top:2px">${pct}%</div>
    </div>`;
  }).join('') || '<div class="sv-empty">Aucun agent.</div>';

  const scored = agents.map(a => { const r = svLatestReview(a.id); return r ? { a, pct: svReviewPct(r) } : null; }).filter(Boolean);
  const teamAvg = scored.length ? scored.reduce((s, x) => s + x.pct, 0) / scored.length : null;
  const devEl = document.getElementById('sv-rep-deviation');
  devEl.innerHTML = (teamAvg !== null && scored.length) ? scored.map(({ a, pct }) => {
    const dev = Math.round(pct - teamAvg);
    const pos = dev >= 0;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span style="font-size:12px;width:110px;flex-shrink:0">${a.name}</span>
      <div style="flex:1;height:8px;background:var(--surface2);border-radius:4px;position:relative">
        <div style="position:absolute;${pos ? 'left:50%' : 'right:50%'};width:${Math.min(Math.abs(dev), 50)}%;height:100%;background:${pos ? 'var(--green)' : 'var(--red)'};border-radius:4px"></div>
      </div>
      <span style="font-size:11.5px;color:${pos ? 'var(--green)' : 'var(--red)'};width:44px;text-align:right">${pos ? '+' : ''}${dev}%</span>
    </div>`;
  }).join('') : '<div class="sv-empty" style="padding:14px">Pas assez de données de grille d\'écoute.</div>';

  svRenderTimeline(agents);
}
function svRenderTimeline(agents) {
  const dayStartH = 8, dayEndH = 18;
  const dayStartMin = dayStartH * 60, totalMin = (dayEndH - dayStartH) * 60;
  const el = document.getElementById('sv-rep-timeline');
  const rows = agents.map(a => {
    const todays = entries.filter(e => e.agent === a.id && isToday(e.startTimeStr))
      .map(e => {
        const d = getEntryDate(e.startTimeStr);
        const startMin = d.getHours() * 60 + d.getMinutes();
        return { startMin, endMin: startMin + e.durationSec / 60 };
      }).sort((x, y) => x.startMin - y.startMin);
    if (!todays.length) return `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:6px">
      <span style="font-size:12px">${a.name}</span>
      <div style="position:relative;height:16px;background:var(--surface2);border-radius:6px"></div>
    </div>`;
    let blocks = '';
    todays.forEach((t, i) => {
      const left = Math.max(0, ((t.startMin - dayStartMin) / totalMin) * 100);
      const width = Math.max(0.5, ((t.endMin - t.startMin) / totalMin) * 100);
      blocks += `<div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:var(--ocean);border-radius:4px"></div>`;
      if (i < todays.length - 1) {
        const gapMin = todays[i + 1].startMin - t.endMin;
        if (gapMin > 15) {
          const gapLeft = ((t.endMin - dayStartMin) / totalMin) * 100;
          const gapWidth = (gapMin / totalMin) * 100;
          blocks += `<div style="position:absolute;left:${gapLeft}%;width:${gapWidth}%;height:100%;background:var(--red);border-radius:4px" title="Trou de ${Math.round(gapMin)} min"></div>`;
        }
      }
    });
    return `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:6px">
      <span style="font-size:12px">${a.name}</span>
      <div style="position:relative;height:16px;background:var(--surface2);border-radius:6px">${blocks}</div>
    </div>`;
  }).join('');
  const scale = `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:10px;color:var(--text2);margin-bottom:6px">
    <div></div><div style="display:flex;justify-content:space-between">${Array.from({length:(dayEndH-dayStartH)/2+1},(_,i)=>`<span>${dayStartH+i*2}h</span>`).join('')}</div>
  </div>`;
  el.innerHTML = scale + (rows || '<div class="sv-empty">Aucun agent.</div>');
}

// ---- GRILLE D'ÉCOUTE ----
function svPopulateReviewAgentFilters() {
  const opts = '<option value="__all">Tous les agents</option>' + agentsOnly().map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const filterEl = document.getElementById('sv-review-agent-filter');
  if (filterEl && filterEl.options.length <= 1) filterEl.innerHTML = opts;
  const coachFilterEl = document.getElementById('sv-coaching-agent-filter');
  if (coachFilterEl && coachFilterEl.options.length <= 1) coachFilterEl.innerHTML = opts;
}
function svRenderReviews() {
  svPopulateReviewAgentFilters();
  const agentF = document.getElementById('sv-review-agent-filter').value;
  let list = [...qualityReviews];
  if (agentF !== '__all') list = list.filter(r => r.agentId === agentF);
  list.sort((a, b) => (b.date || 0) - (a.date || 0));
  document.getElementById('sv-review-count-badge').textContent = `${list.length} grille(s)`;

  const chartWrap = document.getElementById('sv-review-chart-wrap');
  if (agentF !== '__all' && list.length >= 2) {
    chartWrap.innerHTML = svBuildScoreChart(list.slice().reverse());
  } else { chartWrap.innerHTML = ''; }

  const container = document.getElementById('sv-reviews-list');
  if (!list.length) { container.innerHTML = '<div class="sv-empty">Aucune grille d\'écoute enregistrée.</div>'; return; }
  container.innerHTML = list.map(r => {
    const pct = svReviewPct(r);
    const meta = CHANNEL_META[r.channel] || CHANNEL_META.ticket;
    return `<div class="sv-card" style="cursor:default">
      <div class="sv-card-head">
        <div>
          <div class="sv-card-title">${svAgentName(r.agentId)}</div>
          <div class="sv-card-meta">${meta.icon} ${meta.label} · ${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : ''} · évalué par ${svAgentName(r.reviewerId)}${r.contactId ? ' · Contact #' + docEsc(r.contactId) : ''}</div>
        </div>
        <div style="text-align:right">
          ${r.siTriggered ? '<span class="sv-pill sv-pill-overdue" style="margin-bottom:4px;display:inline-block">🚫 SI</span><br>' : ''}
          <div style="font-family:var(--display);font-weight:700;font-size:20px;color:${pct>=70?'var(--green)':pct>=50?'var(--amber)':'var(--red)'}">${pct}%</div>
        </div>
      </div>
      <div class="sv-score-bar" style="margin-bottom:8px"><div class="sv-score-fill" style="width:${pct}%;background:${pct>=70?'var(--green)':pct>=50?'var(--amber)':'var(--red)'}"></div></div>
      ${r.contactReason ? `<div style="font-size:12.5px;color:var(--text2)"><strong>Motif :</strong> ${docEsc(r.contactReason)}</div>` : ''}
      ${r.pilierResults ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${SV_GRID.map(p => { const pr = r.pilierResults[p.key]; return pr && pr.pct !== null ? `<span class="count-badge" style="margin-left:0">${p.label.replace(/^\d+\.\s*/,'')} ${pr.pct}%</span>` : ''; }).join('')}</div>` : ''}
    </div>`;
  }).join('');
}
function svBuildScoreChart(list) {
  const w = 600, h = 140, pad = 24;
  const pts = list.map((r, i) => {
    const pct = svReviewPct(r);
    const x = pad + (i / Math.max(1, list.length - 1)) * (w - pad * 2);
    const y = h - pad - (pct / 100) * (h - pad * 2);
    return { x, y, pct, date: r.date };
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--ocean)"><title>${Math.round(p.pct)}% — ${new Date(p.date).toLocaleDateString('fr-FR')}</title></circle>`).join('');
  return `<div class="sv-card" style="cursor:default">
    <div class="sv-card-meta" style="margin-bottom:8px">Évolution du score dans le temps</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px">
      <line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="var(--border)" stroke-width="1"/>
      <path d="${path}" fill="none" stroke="var(--ocean)" stroke-width="2"/>
      ${dots}
    </svg>
  </div>`;
}
let svGridValues = {};
function svOpenReviewModal() {
  document.getElementById('sv-review-agent').innerHTML = svAgentOptions();
  document.getElementById('sv-review-channel').value = 'inbound';
  document.getElementById('sv-review-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('sv-review-commnum').value = '';
  document.getElementById('sv-review-contactdate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('sv-review-contactid').value = '';
  document.getElementById('sv-review-reason').value = '';
  document.getElementById('sv-review-error').textContent = '';
  svGridValues = {};
  document.getElementById('sv-review-grid').innerHTML = SV_GRID.map(pilier => `
    <details class="sv-grid-pilier" open>
      <summary>${pilier.label}<span class="sv-grid-pilier-pct" id="sv-grid-pct-${pilier.key}">—</span></summary>
      ${pilier.items.map(item => item.si ? `
        <div class="sv-grid-item sv-grid-item-si">
          <span class="sv-grid-item-label">🚫 ${docEsc(item.label)}</span>
          <label class="sv-si-toggle"><input type="checkbox" onchange="svGridValues['${item.id}']={si:this.checked};svUpdateGridPreview()"> Déclenchée</label>
        </div>` : `
        <div class="sv-grid-item">
          <span class="sv-grid-item-label">${docEsc(item.label)} <span class="sv-grid-cible">/${item.cible}</span></span>
          <select class="form-input sv-grid-select" onchange="svGridValues['${item.id}']={level:this.value};svUpdateGridPreview()">
            <option value="">—</option>
            ${SV_CONFORMITE_LEVELS.map(l => `<option value="${l.value}">${l.label}</option>`).join('')}
          </select>
        </div>`).join('')}
    </details>`).join('');
  svUpdateGridPreview();
  document.getElementById('sv-review-overlay').classList.remove('hidden');
}
function svUpdateGridPreview() {
  const result = svComputeGridScore(svGridValues);
  document.getElementById('sv-review-total-val').textContent = result.totalPct + '%';
  document.getElementById('sv-review-total-val').style.color = result.totalPct >= 70 ? 'var(--green)' : result.totalPct >= 50 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('sv-review-si-banner').classList.toggle('hidden', !result.siTriggered);
  SV_GRID.forEach(pilier => {
    const pr = result.pilierResults[pilier.key];
    const el = document.getElementById('sv-grid-pct-' + pilier.key);
    if (el) el.textContent = pr.pct === null ? '—' : pr.pct + '%';
  });
}
function svCloseReviewModal() { document.getElementById('sv-review-overlay').classList.add('hidden'); }
async function svSaveReview() {
  const agentId = document.getElementById('sv-review-agent').value;
  if (!agentId) { document.getElementById('sv-review-error').textContent = 'Sélectionne un agent.'; return; }
  const result = svComputeGridScore(svGridValues);
  const obj = {
    agentId, reviewerId: currentUser.id,
    channel: document.getElementById('sv-review-channel').value,
    date: new Date(document.getElementById('sv-review-date').value).getTime(),
    commNumber: document.getElementById('sv-review-commnum').value.trim(),
    contactDate: document.getElementById('sv-review-contactdate').value ? new Date(document.getElementById('sv-review-contactdate').value).getTime() : null,
    contactId: document.getElementById('sv-review-contactid').value.trim(),
    contactReason: document.getElementById('sv-review-reason').value.trim(),
    gridValues: svGridValues,
    pilierResults: result.pilierResults,
    totalScorePct: result.totalPct,
    rawScorePct: result.rawPct,
    siTriggered: result.siTriggered,
    createdAt: Date.now(),
  };
  try {
    const id = await svCreateDoc('qualityReviews', obj);
    qualityReviews.push({ id, ...obj });
    svCloseReviewModal();
    svRenderReviews();
  } catch (e) { document.getElementById('sv-review-error').textContent = 'Erreur : ' + e.message; }
}

// ---- COACHING 1:1 ----
function svRenderCoaching() {
  svPopulateReviewAgentFilters();
  const agentF = document.getElementById('sv-coaching-agent-filter').value;
  let list = [...coachingSheets];
  if (agentF !== '__all') list = list.filter(c => c.agentId === agentF);
  list.sort((a, b) => (b.date || 0) - (a.date || 0));
  document.getElementById('sv-coaching-count-badge').textContent = `${list.length} fiche(s)`;
  const container = document.getElementById('sv-coaching-list');
  if (!list.length) { container.innerHTML = '<div class="sv-empty">Aucune fiche de coaching enregistrée.</div>'; return; }
  container.innerHTML = list.map(c => {
    const objs = c.objectifs || [];
    const done = objs.filter(o => o.status === 'atteint').length;
    return `<div class="sv-card" onclick="svOpenCoachingModal('${c.id}')">
      <div class="sv-card-head">
        <div>
          <div class="sv-card-title">${svAgentName(c.agentId)}</div>
          <div class="sv-card-meta">${c.date ? new Date(c.date).toLocaleDateString('fr-FR') : ''} · par ${svAgentName(c.supervisorId)}${c.nextReviewDate ? ' · prochain point le ' + new Date(c.nextReviewDate).toLocaleDateString('fr-FR') : ''}</div>
        </div>
        <span class="sv-pill sv-pill-${done === objs.length && objs.length ? 'resolu' : 'en_cours'}">${done}/${objs.length} objectifs</span>
      </div>
      ${objs.length ? `<ul style="margin:6px 0 0 18px;font-size:12.5px;color:var(--text2)">${objs.map(o => `<li>${docEsc(o.text)} — <em>${o.status}</em></li>`).join('')}</ul>` : ''}
    </div>`;
  }).join('');
}
let svEditingCoachingId = null;
let svCoachingObjectifs = [];
function svOpenCoachingModal(id, prefillAgentId) {
  svEditingCoachingId = id;
  const c = id ? coachingSheets.find(x => x.id === id) : null;
  document.getElementById('sv-coaching-agent').innerHTML = svAgentOptions(c?.agentId || prefillAgentId);
  document.getElementById('sv-coaching-date').value = c?.date ? new Date(c.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  document.getElementById('sv-coaching-notes').value = c?.notes || '';
  document.getElementById('sv-coaching-next').value = c?.nextReviewDate ? new Date(c.nextReviewDate).toISOString().slice(0, 10) : '';
  document.getElementById('sv-coaching-error').textContent = '';
  document.getElementById('sv-coaching-delete-btn').style.display = c ? 'inline-flex' : 'none';
  svCoachingObjectifs = c?.objectifs ? JSON.parse(JSON.stringify(c.objectifs)) : [];
  svRenderObjectifRows();
  document.getElementById('sv-coaching-overlay').classList.remove('hidden');
}
function svRenderObjectifRows() {
  const el = document.getElementById('sv-coaching-objectifs-list');
  if (!svCoachingObjectifs.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text2)">Aucun objectif — clique "+ Ajouter un objectif".</div>'; return; }
  el.innerHTML = svCoachingObjectifs.map((o, i) => `
    <div class="sv-obj-row">
      <input type="text" class="form-input" value="${docEsc(o.text)}" oninput="svCoachingObjectifs[${i}].text=this.value">
      <select class="form-input" onchange="svCoachingObjectifs[${i}].status=this.value">
        <option value="à faire" ${o.status==='à faire'?'selected':''}>À faire</option>
        <option value="en cours" ${o.status==='en cours'?'selected':''}>En cours</option>
        <option value="atteint" ${o.status==='atteint'?'selected':''}>Atteint</option>
      </select>
      <button class="btn btn-ghost" onclick="svCoachingObjectifs.splice(${i},1);svRenderObjectifRows()" style="padding:6px 10px">✕</button>
    </div>`).join('');
}
function svAddObjectifRow() { svCoachingObjectifs.push({ text: '', status: 'à faire' }); svRenderObjectifRows(); }
function svCloseCoachingModal() { document.getElementById('sv-coaching-overlay').classList.add('hidden'); svEditingCoachingId = null; }
async function svSaveCoaching() {
  const agentId = document.getElementById('sv-coaching-agent').value;
  if (!agentId) { document.getElementById('sv-coaching-error').textContent = 'Sélectionne un agent.'; return; }
  const nextVal = document.getElementById('sv-coaching-next').value;
  const existing = svEditingCoachingId ? coachingSheets.find(x => x.id === svEditingCoachingId) : null;
  const obj = {
    agentId, supervisorId: existing?.supervisorId || currentUser.id,
    date: new Date(document.getElementById('sv-coaching-date').value).getTime(),
    objectifs: svCoachingObjectifs.filter(o => o.text.trim()),
    notes: document.getElementById('sv-coaching-notes').value.trim(),
    nextReviewDate: nextVal ? new Date(nextVal).getTime() : null,
    createdAt: existing?.createdAt || Date.now(),
  };
  try {
    if (svEditingCoachingId) {
      await svUpdateDoc('coachingSheets', svEditingCoachingId, obj);
      Object.assign(existing, obj);
    } else {
      const id = await svCreateDoc('coachingSheets', obj);
      coachingSheets.push({ id, ...obj });
    }
    svCloseCoachingModal();
    svRenderCoaching();
  } catch (e) { document.getElementById('sv-coaching-error').textContent = 'Erreur : ' + e.message; }
}
async function svDeleteCoaching() {
  if (!svEditingCoachingId) return;
  if (!confirm('Supprimer cette fiche de coaching ?')) return;
  await svDeleteDoc('coachingSheets', svEditingCoachingId);
  coachingSheets = coachingSheets.filter(x => x.id !== svEditingCoachingId);
  svCloseCoachingModal();
  svRenderCoaching();
}
