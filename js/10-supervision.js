// ===== SUPERVISION : Cas complexes, Grille d'écoute, Coaching 1:1 =====
let svSubTab = 'overview'; // l'espace Superviseur s'ouvre sur la vue d'ensemble
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
  if (!supabase?.enabled()) return [];
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
async function svCreateDoc(collection, obj) {
  if (!requireRoles('admin', 'supervisor')) return null;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
  const row = table === 'complex_cases'
    ? { agent_id: obj.agentId || null, owner_id: currentUser.id, status: obj.status || 'nouveau', priority: obj.priority || 'medium', title: obj.title || '', description: obj.description || '', data: obj }
    : table === 'coaching_reviews'
      ? { agent_id: obj.agentId || null, reviewer_id: obj.reviewerId || currentUser.id, channel: obj.channel || '', review_date: obj.reviewDate || null, scores: obj.scores || {}, data: obj }
      : { agent_id: obj.agentId || null, supervisor_id: obj.supervisorId || currentUser.id, sheet_date: obj.sheetDate || null, objectives: obj.objectives || [], notes: obj.notes || '', data: obj };
  const created = await supabase.insertRow(table, row);
  return Array.isArray(created) ? created[0]?.id || null : created?.id || null;
}
async function svUpdateDoc(collection, id, obj) {
  if (!requireRoles('admin', 'supervisor')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
  const row = table === 'complex_cases'
    ? { agent_id: obj.agentId || null, status: obj.status || 'nouveau', priority: obj.priority || 'medium', title: obj.title || '', description: obj.description || '', data: obj }
    : table === 'coaching_reviews'
      ? { agent_id: obj.agentId || null, reviewer_id: obj.reviewerId || currentUser.id, scores: obj.scores || {}, data: obj }
      : { agent_id: obj.agentId || null, supervisor_id: obj.supervisorId || currentUser.id, objectives: obj.objectives || [], notes: obj.notes || '', data: obj };
  await supabase.updateRow(table, id, row);
}
async function svDeleteDoc(collection, id) {
  if (!requireRoles('admin', 'supervisor')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const table = collection === 'complexCases' || collection === 'escalations' ? 'complex_cases' : collection === 'qualityReviews' ? 'coaching_reviews' : 'coaching_sheets';
  await supabase.deleteRow(table, id);
}

function svAgentOptions(selectedId) {
  return agentsOnly().map(a => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');
}
function svAgentName(id) { const a = TEAM.find(t => t.id === id); return a ? a.name : id; }

function svNormalizeEscalation(e, collection = 'escalations') {
  const createdAt = typeof e.createdAt === 'number' ? e.createdAt : (e.createdAt ? (Date.parse(e.createdAt) || Date.now()) : Date.now());
  return { ...e, _collection: e._collection || collection, agentId: e.agentId || e.createdBy || '', channel: e.channel || 'ticket', priority: e.priority || 'medium', status: e.status || 'nouveau', deadlineAt: e.deadlineAt || null, linkedProcedureId: e.linkedProcedureId || null, updates: Array.isArray(e.updates) ? e.updates : [], createdAt };
}
// Charge cas complexes, grilles d’écoute et coaching sans toucher à l’affichage.
// Utilisé par Supervision ET par Admin › Qualité (qui ne doit pas basculer d’écran).
async function svLoadSupervisionData() {
  // « escalations » et « complexCases » pointent vers la même table complex_cases :
  // la lire deux fois affichait chaque cas en double. Une seule lecture.
  const [cases, rev, coach] = await Promise.all([
    svFetchCollection('escalations'), svFetchCollection('qualityReviews'), svFetchCollection('coachingSheets'),
    currentUser && currentUser.role !== 'agent' ? svLoadNotes(true) : null,
    typeof loadActiveTimers === 'function' ? loadActiveTimers() : null,
  ]);
  escalations = cases.map(e => svNormalizeEscalation(e, 'escalations'));
  qualityReviews = rev; coachingSheets = coach;
  svUpdateAlertBadge();
}
async function svInit() {
  // Seul l’écran Supervision s’initialise ici : appelé ailleurs, on ne vole plus l’affichage.
  if (currentView !== 'supervision') return;
  // Affichage immédiat : le cockpit ne doit pas attendre les lectures Supabase.
  if (typeof adminWorkflowRender === 'function') adminWorkflowRender('sv-workflow-panel');
  svUpdateAlertBadge();
  svSwitchSubTab(svSubTab, { keepScroll: true });
  try {
    await svLoadSupervisionData();
    if (currentView !== 'supervision') return;
    renderOpsVisuals();
    if (typeof adminWorkflowRender === 'function') adminWorkflowRender('sv-workflow-panel');
    svSwitchSubTab(svSubTab, { keepScroll: true });
  } catch (error) {
    console.error('Chargement Supervision impossible :', error);
  }
}
function svUpdateAlertBadge() {
  const now = Date.now();
  const overdue = escalations.filter(e => e.status !== 'resolu' && e.deadlineAt && e.deadlineAt < now).length;
  const badge = document.getElementById('sv-alert-count');
  if (!badge) return;
  badge.textContent = overdue;
  badge.classList.toggle('hidden', overdue === 0);
}
function svSwitchSubTab(tab, options = {}) {
  // Un clic dans le rail Supervision reprend immédiatement la main sur les vues globales.
  // Cela évite que le panneau Équipe ou ses filtres restent affichés sous une sous-vue.
  const changed = currentView !== 'supervision' || svSubTab !== tab;
  if (typeof navigationSequence === 'number') navigationSequence += 1;
  currentView = 'supervision';
  if (changed && !options.keepScroll) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (typeof rememberTaskinView === 'function') rememberTaskinView('supervision');
  if (typeof setAdminSidebarActive === 'function' && currentUser?.role === 'admin') setAdminSidebarActive('supervision');
  ['team-live-panel','leaderboard-panel','documentation-panel','training-panel','channel-matrix-panel','admin-panel'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  if (typeof hideAdminSubPanels === 'function') hideAdminSubPanels();
  document.querySelector('.toolbar')?.classList.add('hidden');
  document.querySelector('.entries-table-wrap')?.classList.add('hidden');
  document.getElementById('date-filter-bar')?.classList.add('hidden');
  document.getElementById('supervision-panel')?.classList.remove('hidden');
  svSubTab = tab;
  ['overview', 'escalations', 'reviews', 'coaching', 'reporting', 'sessions'].forEach(t => {
    document.getElementById('sv-tab-' + t)?.classList.toggle('active', t === tab);
    document.getElementById('sv-view-' + t)?.classList.toggle('hidden', t !== tab);
  });
  if (typeof setRoleTabActive === 'function') setRoleTabActive(tab);
  const activeView = document.getElementById('sv-view-' + tab);
  if (activeView) {
    activeView.classList.remove('taskin-view-enter');
    requestAnimationFrame(() => activeView.classList.add('taskin-view-enter'));
  }
  if (tab === 'overview') svRenderOverview();
  if (tab === 'escalations') svRenderEscalations();
  if (tab === 'reviews') svRenderReviews();
  if (tab === 'coaching') svRenderCoaching();
  if (tab === 'reporting') svRenderReporting();
  if (tab === 'sessions' && typeof agentSessionsSupervisorRender === 'function') agentSessionsSupervisorRender();
}

// ---- CAS COMPLEXES ----
const SV_STATUS_LABEL = { nouveau: 'Nouveau', en_cours: 'En cours', attente_client: 'Attente client', resolu: 'Résolu' };
const SV_PRIORITY_LABEL = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgent' };
// Typologie des difficultés suivies (plan d'action agents) ; les anciens cas sans type = « Autre ».
const SV_DIFFICULTY_LABEL = { process: 'Difficulté process', situational: 'Blocage situationnel', collaboration: 'Collaboration', unhandled_escalation: 'Escalade manager non traitée', other: 'Autre' };
function svDifficulty(e) { return SV_DIFFICULTY_LABEL[e.difficulty] ? e.difficulty : 'other'; }

// Synthèse : cas ouverts / total par type, et agents les plus concernés (cas ouverts).
function svRenderEscalationSummary(list) {
  const box = document.getElementById('sv-esc-summary');
  if (!box) return;
  if (!escalations.length) { box.innerHTML = ''; return; }
  const open = e => e.status !== 'resolu';
  const types = Object.keys(SV_DIFFICULTY_LABEL).map(key => {
    const all = list.filter(e => svDifficulty(e) === key);
    return { key, label: SV_DIFFICULTY_LABEL[key], open: all.filter(open).length, total: all.length };
  });
  const byAgent = {};
  list.filter(open).forEach(e => { if (e.agentId) byAgent[e.agentId] = (byAgent[e.agentId] || 0) + 1; });
  const topAgents = Object.entries(byAgent).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const reported = list.filter(e => e.reportedBy && e.status === 'nouveau').length;
  box.innerHTML = `<div class="sv-esc-types">${types.map(t => `<button type="button" class="sv-esc-type sv-esc-type-${t.key} ${document.getElementById('sv-esc-type-filter')?.value === t.key ? 'active' : ''}" onclick="svFilterEscalationType('${t.key}')"><span>${t.label}</span><b>${t.open}</b><small>ouvert${t.open > 1 ? 's' : ''} · ${t.total} au total</small></button>`).join('')}</div>
    <div class="sv-esc-agents">${reported ? `<span class="sv-esc-new">${reported} signalement${reported > 1 ? 's' : ''} d’agent à traiter</span>` : ''}${topAgents.length ? `<span>Cas ouverts par agent :</span>${topAgents.map(([id, n]) => `<button type="button" onclick="svFilterEscalationAgent('${id}')">${svAgentName(id)} <b>${n}</b></button>`).join('')}` : '<span>Aucun cas ouvert.</span>'}</div>`;
}
function svFilterEscalationType(key) {
  const select = document.getElementById('sv-esc-type-filter');
  if (select) select.value = select.value === key ? '__all' : key;
  svRenderEscalations();
}
function svFilterEscalationAgent(id) {
  const select = document.getElementById('sv-esc-agent-filter');
  if (select) select.value = select.value === id ? '__all' : id;
  svRenderEscalations();
}

function svRenderEscalations() {
  const statusF = document.getElementById('sv-esc-status-filter').value;
  const prioF = document.getElementById('sv-esc-priority-filter').value;
  const typeF = document.getElementById('sv-esc-type-filter')?.value || '__all';
  const agentSelect = document.getElementById('sv-esc-agent-filter');
  if (agentSelect) {
    const current = agentSelect.value || '__all';
    const ids = [...new Set(escalations.map(e => e.agentId).filter(Boolean))];
    agentSelect.innerHTML = '<option value="__all">Tous les agents</option>' + ids.map(id => `<option value="${id}" ${id === current ? 'selected' : ''}>${svAgentName(id)}</option>`).join('');
  }
  const agentF = agentSelect?.value || '__all';
  let list = [...escalations];
  if (agentF !== '__all') list = list.filter(e => e.agentId === agentF);
  if (typeF !== '__all') list = list.filter(e => svDifficulty(e) === typeF);
  // La synthèse suit le filtre agent mais montre tous les types (pour comparer).
  svRenderEscalationSummary(agentF !== '__all' ? escalations.filter(e => e.agentId === agentF) : escalations);
  if (statusF !== '__all') list = list.filter(e => e.status === statusF);
  if (prioF !== '__all') list = list.filter(e => e.priority === prioF);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  document.getElementById('sv-esc-count-badge').textContent = `${list.length} cas`;
  const container = document.getElementById('sv-escalations-list');
  if (!list.length) { container.innerHTML = svEmptyState('flag', 'Aucun cas complexe', 'Aucun cas ne correspond à ces filtres. Crée un cas avec « + Nouveau cas ».', '#E5484D'); return; }
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
          ${e.reportedBy ? '<span class="sv-pill sv-pill-reported">Signalé par l’agent</span>' : ''}
          <span class="sv-pill sv-pill-type sv-esc-type-${svDifficulty(e)}">${SV_DIFFICULTY_LABEL[svDifficulty(e)]}</span>
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
  document.getElementById('sv-esc-difficulty').value = e ? svDifficulty(e) : 'process';
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
    difficulty: document.getElementById('sv-esc-difficulty').value,
    reportedBy: existing?.reportedBy || null,
    ref: existing?.ref || '',
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
// ===== Éléments visuels partagés de l'espace Superviseur =====
const SV_ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  coaching: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
};
function svIcon(name, cls = 'sv-icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SV_ICONS[name] || ''}</svg>`;
}
function svEmptyState(icon, title, text = '', color = 'var(--ocean)') {
  return `<div class="sv-empty-state" style="--c:${color}"><span class="sv-empty-icon">${svIcon(icon)}</span><strong>${title}</strong>${text ? `<p>${text}</p>` : ''}</div>`;
}
function svKpi(icon, label, value, sub, color) {
  return `<div class="sv-kpi" style="--c:${color}"><span class="sv-kpi-icon">${svIcon(icon)}</span><div class="sv-kpi-copy"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
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

  document.getElementById('sv-ov-kpis').innerHTML = [
    svKpi('clock', 'DMT équipe', teamDMT.label, 'Cette semaine', '#2563EB'),
    svKpi('star', 'Score qualité moyen', avgScore !== null ? avgScore + '%' : '—', avgScore !== null ? 'Dernières grilles d’écoute' : 'Aucune grille d’écoute', '#7C3AED'),
    svKpi('flag', 'Cas ouverts', openCases.length, overdue.length ? `<em class="sv-kpi-alert">${overdue.length} en retard</em>` : 'Aucun en retard', overdue.length ? '#E5484D' : '#D97706'),
    svKpi('users', 'Agents actifs', `${activeToday.size}<em>/${totalAgents}</em>`, 'Au moins une tâche aujourd’hui', '#16A34A'),
  ].join('');

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
  }).join('') : svEmptyState('check', 'Aucun cas ouvert', 'Les cas complexes en attente apparaîtront ici.', '#16A34A');

  const watchlist = svComputeWatchlist();
  const wlEl = document.getElementById('sv-ov-watchlist');
  wlEl.innerHTML = watchlist.length ? watchlist.map(w => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 4px;border-radius:8px;cursor:pointer" onclick="document.getElementById('sv-ov-agent-picker').value='${w.agent.id}';svRenderAgentFocusCard('${w.agent.id}')">
      <div style="width:28px;height:28px;border-radius:50%;background:${w.color === 'danger' ? 'var(--red-dim)' : 'var(--amber-dim)'};color:${w.color === 'danger' ? 'var(--red)' : 'var(--amber)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${escHtml(w.agent.initials)}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12.5px">${escHtml(w.agent.name)}</div><div style="font-size:11px;color:${w.color === 'danger' ? 'var(--red)' : 'var(--amber)'}">${docEsc(w.reason)}</div></div>
    </div>`).join('') : svEmptyState('check', 'Rien à signaler', 'Aucun agent ne demande d’attention particulière.', '#16A34A');

  const picker = document.getElementById('sv-ov-agent-picker');
  picker.innerHTML = svAgentOptions();
  const defaultAgent = watchlist[0]?.agent.id || agentsOnly()[0]?.id;
  if (defaultAgent) { picker.value = defaultAgent; svRenderAgentFocusCard(defaultAgent); }
  else { document.getElementById('sv-ov-focus-card').innerHTML = svEmptyState('person', 'Aucun agent', 'Crée des comptes agents pour suivre leur activité.'); }
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
    : svEmptyState('coaching', 'Aucune fiche de coaching', '', '#7C3AED');

  target.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <div class="mosaic-avatar" style="${avatarStyle};width:44px;height:44px;font-size:15px">${a.photo ? '' : escHtml(a.initials)}</div>
      <div><div style="font-weight:700;font-size:14.5px">${escHtml(a.name)}</div><div style="font-size:12px;color:var(--text2)">${a.role === 'agent' ? 'Agent' : a.role}</div></div>
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

  // Même style d'indicateurs que la vue d'ensemble ; la valeur barrée = semaine dernière.
  const prev = v => v === null || v === '' ? '' : `<em class="sv-kpi-prev">${v}</em>`;
  const delta = d => d.text && d.text !== '—' ? `<span style="color:${d.color}">${d.text}</span> vs semaine dernière` : 'Pas de comparaison possible';
  document.getElementById('sv-rep-kpis').innerHTML = [
    svKpi('clock', 'DMT moyen', `${dmtNow !== null ? Math.round(dmtNow) + 'min' : '—'}${prev(dmtPrev !== null ? Math.round(dmtPrev) + 'min' : '')}`, delta(dmtDelta), '#2563EB'),
    svKpi('star', 'Score qualité', `${scoreNow !== null ? scoreNow + '%' : '—'}${prev(scorePrev !== null ? scorePrev + '%' : '')}`, delta(scoreDelta), '#7C3AED'),
    svKpi('check', 'Cas résolus', `${casesNow}${prev(casesPrev)}`, delta(casesDelta), '#16A34A'),
  ].join('');

  if (typeof taskinHeatmapRender === 'function') taskinHeatmapRender('sv-rep-activity-heatmap', { id: 'reporting', preset: { period: '28d' } });
  const agents = agentsOnly();
  const heatEl = document.getElementById('sv-rep-heatmap');
  heatEl.innerHTML = agents.map(a => {
    const review = svLatestReview(a.id);
    if (!review) return `<div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center;cursor:pointer" onclick="svSwitchSubTab('overview');setTimeout(()=>{document.getElementById('sv-ov-agent-picker').value='${a.id}';svRenderAgentFocusCard('${a.id}')},50)"><div style="font-size:11px;color:var(--text2)">${escHtml(a.name)}</div><div style="font-size:10px;color:var(--text2);margin-top:4px">Pas de donnée</div></div>`;
    const pct = svReviewPct(review);
    const bg = pct >= 75 ? 'var(--green-dim)' : pct >= 55 ? 'var(--amber-dim)' : 'var(--red-dim)';
    const fg = pct >= 75 ? 'var(--green)' : pct >= 55 ? 'var(--amber)' : 'var(--red)';
    return `<div style="background:${bg};border-radius:8px;padding:8px;text-align:center;cursor:pointer" onclick="svSwitchSubTab('overview');setTimeout(()=>{document.getElementById('sv-ov-agent-picker').value='${a.id}';svRenderAgentFocusCard('${a.id}')},50)">
      <div style="font-size:11px;font-weight:600;color:${fg}">${escHtml(a.name)}</div>
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
      <span style="font-size:12px;width:110px;flex-shrink:0">${escHtml(a.name)}</span>
      <div style="flex:1;height:8px;background:var(--surface2);border-radius:4px;position:relative">
        <div style="position:absolute;${pos ? 'left:50%' : 'right:50%'};width:${Math.min(Math.abs(dev), 50)}%;height:100%;background:${pos ? 'var(--green)' : 'var(--red)'};border-radius:4px"></div>
      </div>
      <span style="font-size:11.5px;color:${pos ? 'var(--green)' : 'var(--red)'};width:44px;text-align:right">${pos ? '+' : ''}${dev}%</span>
    </div>`;
  }).join('') : svEmptyState('headset', 'Pas encore de grille d’écoute', 'L’écart à la moyenne apparaîtra dès les premières évaluations.', '#0EA5E9');

  svRenderOneOnOnePrep();
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
      <span style="font-size:12px">${escHtml(a.name)}</span>
      <div style="position:relative;height:16px;background:var(--surface2);border-radius:6px"></div>
    </div>`;
    // Chaque segment est borné à la plage 8h–18h : rien ne déborde sur le nom de l'agent.
    const segment = (from, to, style, title = '') => {
      const a = Math.max(from, dayStartMin), b = Math.min(to, dayStartMin + totalMin);
      if (b <= a) return '';
      const left = (a - dayStartMin) / totalMin * 100, width = Math.max(0.5, (b - a) / totalMin * 100);
      return `<div style="position:absolute;left:${left}%;width:${width}%;height:100%;${style};border-radius:4px"${title ? ` title="${title}"` : ''}></div>`;
    };
    let blocks = '';
    todays.forEach((t, i) => {
      blocks += segment(t.startMin, t.endMin, 'background:var(--ocean)');
      if (i < todays.length - 1) {
        const gapMin = todays[i + 1].startMin - t.endMin;
        if (gapMin > 15) blocks += segment(t.endMin, todays[i + 1].startMin, 'background:var(--red)', `Trou de ${Math.round(gapMin)} min`);
      }
    });
    return `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-bottom:6px">
      <span style="font-size:12px">${escHtml(a.name)}</span>
      <div style="position:relative;height:16px;background:var(--surface2);border-radius:6px;overflow:hidden">${blocks}</div>
    </div>`;
  }).join('');
  const scale = `<div style="display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:10px;color:var(--text2);margin-bottom:6px">
    <div></div><div style="display:flex;justify-content:space-between">${Array.from({length:(dayEndH-dayStartH)/2+1},(_,i)=>`<span>${dayStartH+i*2}h</span>`).join('')}</div>
  </div>`;
  el.innerHTML = scale + (rows || '<div class="sv-empty">Aucun agent.</div>');
}

// ---- GRILLE D'ÉCOUTE ----
function svPopulateReviewAgentFilters() {
  const opts = '<option value="__all">Tous les agents</option>' + agentsOnly().map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');
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
  if (!list.length) { container.innerHTML = svEmptyState('headset', 'Aucune grille d’écoute', 'Évalue un appel ou un échange avec « + Nouvelle grille ».', '#0EA5E9'); return; }
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
      ${r.agentFeedback ? `<div class="sv-review-fb"><b>Retour à l’agent :</b> ${docEsc(r.agentFeedback)}</div>` : ''}
      <div class="sv-review-share-state">${r.sharedWithAgent ? (r.agentAckAt ? `✓ Partagée · lue par l’agent le ${new Date(r.agentAckAt).toLocaleDateString('fr-FR')}` : '↗ Partagée avec l’agent · pas encore lue') : 'Non partagée avec l’agent'}${(coachingNotes || []).some(n => n.ref_id === r.id) ? ' · 📝 note 1:1' : ''}</div>
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
  document.getElementById('sv-review-feedback').value = '';
  document.getElementById('sv-review-share').checked = true;
  document.getElementById('sv-review-private').value = '';
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
    agentFeedback: document.getElementById('sv-review-feedback').value.trim(),
    sharedWithAgent: document.getElementById('sv-review-share').checked,
    createdAt: Date.now(),
  };
  const privateNote = document.getElementById('sv-review-private').value.trim();
  try {
    const id = await svCreateDoc('qualityReviews', obj);
    qualityReviews.push({ id, ...obj });
    if (privateNote) await svAddNote(agentId, 'review', privateNote, id).catch(e => console.warn('Note 1:1 non enregistrée :', e.message));
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
  if (!list.length) { container.innerHTML = svEmptyState('coaching', 'Aucune fiche de coaching', 'Planifie un point 1:1 avec « + Nouvelle fiche ».', '#7C3AED'); return; }
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
  const agentSel = document.getElementById('sv-coaching-agent');
  agentSel.onchange = () => svRenderCoachingPending(agentSel.value);
  svRenderCoachingPending(agentSel.value);
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
      svEditingCoachingId = id;
    }
    const covered = [...document.querySelectorAll('#sv-coaching-pending input[data-note]:checked')].map(i => i.dataset.note);
    await Promise.all(covered.map(id => svSetNoteStatus(id, 'done', svEditingCoachingId).catch(e => console.warn('Note non clôturée :', e.message))));
    svCloseCoachingModal();
    if (typeof pilPaint === 'function' && document.getElementById('pilotage-panel') && !document.getElementById('pilotage-panel').classList.contains('hidden')) pilPaint();
    if (document.getElementById('sv-rep-coaching')) svRenderOneOnOnePrep();
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


// ---- NOTES DE COACHING (privées, préparation des 1:1) ----
// Prises sur une écoute, la fiche 360° ou le reporting ; jamais visibles par l’agent (table coaching_notes).
let coachingNotes = null;
const SV_NOTE_SOURCE = { review: 'Écoute', pilotage: 'Fiche 360°', reporting: 'Reporting', other: 'Note' };
async function svLoadNotes(force = false) {
  if (coachingNotes && !force) return coachingNotes;
  try { coachingNotes = await dispatchRest('coaching_notes?select=*&order=created_at.desc&limit=2000'); }
  catch (e) { console.warn('Notes de coaching indisponibles :', e.message); coachingNotes = []; }
  return coachingNotes;
}
function svOpenNotes(agentId) { return (coachingNotes || []).filter(n => n.agent_id === agentId && n.status === 'open'); }
async function svAddNote(agentId, source, body, refId = null) {
  const [row] = await dispatchRest('coaching_notes', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ agent_id: agentId, source, body, ref_id: refId }) });
  coachingNotes = [row, ...(coachingNotes || [])];
  return row;
}
async function svSetNoteStatus(id, status, sheetId = null) {
  await dispatchRest(`coaching_notes?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status, sheet_id: sheetId, updated_at: new Date().toISOString() }) });
  const n = (coachingNotes || []).find(x => x.id === id);
  if (n) Object.assign(n, { status, sheet_id: sheetId });
}
async function svDeleteNote(id) {
  await dispatchRest(`coaching_notes?id=eq.${id}`, { method: 'DELETE' });
  coachingNotes = (coachingNotes || []).filter(x => x.id !== id);
}
function svNoteMeta(n) { return `${SV_NOTE_SOURCE[n.source] || 'Note'} · ${new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${escHtml(svAgentName(n.author_id))}`; }

// Bloc réutilisable : ajouter / traiter les notes d’un agent, puis préparer le 1:1.
async function svRenderNotesBox(target, agentId, source) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el || !agentId) return;
  if (!coachingNotes) { el.innerHTML = '<p class="dr-muted">Chargement des notes…</p>'; await svLoadNotes(); }
  const notes = svOpenNotes(agentId);
  el.innerHTML = `<div class="cn-box">
    <div class="cn-head"><b>Notes pour le prochain 1:1</b><small>privées · jamais visibles par l’agent</small></div>
    <div class="cn-add"><textarea class="form-input" rows="2" maxlength="4000" placeholder="Ce que tu veux aborder au prochain point avec l’agent…"></textarea><button type="button" class="btn btn-primary">Ajouter</button></div>
    ${notes.length ? `<ul class="cn-list">${notes.map(n => `<li><small>${svNoteMeta(n)}</small><p>${escHtml(n.body)}</p><span class="cn-actions"><button type="button" class="dr-edit-btn" data-done="${n.id}">✓ Abordée</button><button type="button" class="dr-edit-btn" data-del="${n.id}">Supprimer</button></span></li>`).join('')}</ul>` : '<p class="dr-muted cn-empty">Aucune note en attente pour cet agent.</p>'}
    <button type="button" class="btn btn-ghost cn-prepare">Préparer le 1:1 (${notes.length} note${notes.length > 1 ? 's' : ''}) →</button>
  </div>`;
  const rerender = () => svRenderNotesBox(el, agentId, source);
  const area = el.querySelector('.cn-add textarea');
  el.querySelector('.cn-add button').onclick = async () => {
    const body = area.value.trim();
    if (!body) { area.focus(); return; }
    try { await svAddNote(agentId, source, body); rerender(); } catch (e) { alert('Note non enregistrée : ' + e.message); }
  };
  el.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => { try { await svSetNoteStatus(b.dataset.done, 'done'); rerender(); } catch (e) { alert(e.message); } });
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Supprimer cette note ?')) return; try { await svDeleteNote(b.dataset.del); rerender(); } catch (e) { alert(e.message); } });
  el.querySelector('.cn-prepare').onclick = () => svOpenCoachingModal(null, agentId);
}

// Dans la fiche 1:1 : les notes en attente + le dernier retour d’écoute, cochées par défaut.
async function svRenderCoachingPending(agentId) {
  const el = document.getElementById('sv-coaching-pending');
  if (!el) return;
  if (!agentId) { el.innerHTML = ''; return; }
  await svLoadNotes();
  const notes = svOpenNotes(agentId);
  const review = svLatestReview(agentId);
  if (!notes.length && !review) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="cn-pending">
    <div class="cn-head"><b>À aborder pendant ce 1:1</b><small>les notes cochées seront marquées « abordées » à l’enregistrement</small></div>
    ${review ? `<p class="cn-review">Dernière écoute : <b>${svReviewPct(review)} %</b> le ${review.date ? new Date(review.date).toLocaleDateString('fr-FR') : '—'}${review.agentFeedback ? ` · retour donné : « ${docEsc(review.agentFeedback)} »` : ''}</p>` : ''}
    ${notes.map(n => `<label class="cn-check"><input type="checkbox" data-note="${n.id}" checked><span><small>${svNoteMeta(n)}</small>${escHtml(n.body)}</span></label>`).join('')}
    ${notes.length ? '<button type="button" class="dr-edit-btn" id="sv-coaching-insert">Insérer les notes cochées dans l’entretien</button>' : ''}
  </div>`;
  document.getElementById('sv-coaching-insert')?.addEventListener('click', () => {
    const ta = document.getElementById('sv-coaching-notes');
    const lines = [...el.querySelectorAll('input[data-note]:checked')].map(i => '• ' + (coachingNotes.find(n => n.id === i.dataset.note)?.body || ''));
    ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n') : '') + lines.join('\n');
  });
}

// Reporting superviseur : un tableau par agent pour préparer les 1:1.
async function svRenderOneOnOnePrep() {
  const el = document.getElementById('sv-rep-coaching');
  if (!el) return;
  await svLoadNotes();
  const agents = agentsOnly();
  if (!agents.length) { el.innerHTML = '<div class="sv-empty">Aucun agent.</div>'; return; }
  const rows = agents.map(a => {
    const notes = svOpenNotes(a.id), review = svLatestReview(a.id), coaching = svLatestCoaching(a.id);
    return { a, notes, review, coaching };
  }).sort((x, y) => y.notes.length - x.notes.length || x.a.name.localeCompare(y.a.name, 'fr'));
  el.innerHTML = `<div class="dr-table-wrap"><table class="dr-table cn-prep">
    <thead><tr><th>Agent</th><th>Notes en attente</th><th>Dernière écoute</th><th>Dernier 1:1</th><th></th></tr></thead>
    <tbody>${rows.map(({ a, notes, review, coaching }) => `<tr>
      <td><strong>${escHtml(a.name)}</strong></td>
      <td>${notes.length ? `<b>${notes.length}</b> <small class="dr-muted">${escHtml(notes[0].body.slice(0, 60))}${notes[0].body.length > 60 ? '…' : ''}</small>` : '<span class="dr-muted">—</span>'}</td>
      <td>${review ? `${svReviewPct(review)} % <small class="dr-muted">${review.date ? new Date(review.date).toLocaleDateString('fr-FR') : ''}</small>` : '<span class="dr-muted">aucune</span>'}</td>
      <td>${coaching?.date ? new Date(coaching.date).toLocaleDateString('fr-FR') : '<span class="dr-muted">aucun</span>'}</td>
      <td class="dr-row-action"><button type="button" class="dr-edit-btn" data-cn-toggle="${a.id}">Notes</button> <button type="button" class="dr-edit-btn" data-cn-prep="${a.id}">Préparer le 1:1</button></td>
    </tr><tr class="cn-row hidden" data-cn-row="${a.id}"><td colspan="5"><div data-cn-box="${a.id}"></div></td></tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('[data-cn-toggle]').forEach(b => b.onclick = () => {
    const row = el.querySelector(`[data-cn-row="${b.dataset.cnToggle}"]`);
    row.classList.toggle('hidden');
    if (!row.classList.contains('hidden')) svRenderNotesBox(el.querySelector(`[data-cn-box="${b.dataset.cnToggle}"]`), b.dataset.cnToggle, 'reporting');
  });
  el.querySelectorAll('[data-cn-prep]').forEach(b => b.onclick = () => svOpenCoachingModal(null, b.dataset.cnPrep));
}
