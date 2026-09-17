// ===== FORMATION =====
let trainingSubTab = 'dashboard';
let trainingLoaded = false;
let trainingModules = [];
let trainingQuizzes = [];
let trainingProgress = [];
let trainingUpdates = [];
let trainingSkills = [];
let trainingAcknowledgements = [];
let trainingGeneratedDraft = null;

function trainingCanManage() { return currentUser && (currentUser.role === 'formateur' || currentUser.role === 'admin'); }
function trainingDate(ms) { return ms ? new Date(ms).toLocaleDateString('fr-FR') : '—'; }
function trainingStatus(status) { return status === 'published' ? '<span class="training-status published">Publié</span>' : '<span class="training-status draft">Brouillon</span>'; }
function trainingEmpty(text) { return `<div class="training-empty">${text}</div>`; }

async function trFetchCollection(name) {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const tableMap = { trainingModules: 'training_modules', trainingQuizzes: 'training_quizzes', trainingProgress: 'training_progress', trainingUpdates: 'training_updates', trainingSkills: 'training_skills', trainingAcknowledgements: 'training_acknowledgements' };
  const rows = await supabase.listTable(tableMap[name] || name, 500);
  return (rows || []).map(row => ({ id: row.id, ...(row.data && typeof row.data === 'object' ? row.data : {}), title: row.title || row.data?.title, description: row.description || row.data?.description, status: row.status || row.data?.status, agentId: row.agent_id || row.data?.agentId, moduleId: row.module_id || row.data?.moduleId, progressPct: row.progress_pct ?? row.data?.progressPct }));
}
async function trCreateDoc(collection, obj) {
  if (!requireRoles('admin', 'formateur')) return null;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const tableMap = { trainingModules: 'training_modules', trainingQuizzes: 'training_quizzes', trainingProgress: 'training_progress', trainingUpdates: 'training_updates', trainingSkills: 'training_skills', trainingAcknowledgements: 'training_acknowledgements' };
  const table = tableMap[collection] || collection;
  const row = table === 'training_modules' ? { title: obj.title || '', description: obj.description || '', category: obj.category || '', duration_min: Number(obj.durationMin || 0), status: obj.status || 'draft', objectives: obj.objectives || [], modules: obj.modules || [], source_procedure_id: obj.sourceProcedureId || null, created_by: currentUser.id, data: obj }
    : table === 'training_quizzes' ? { title: obj.title || '', description: obj.description || '', passing_score: Number(obj.passingScore || 70), status: obj.status || 'draft', questions: obj.questions || [], module_id: obj.moduleId || null, data: obj }
      : table === 'training_progress' ? { agent_id: obj.agentId || currentUser.id, module_id: obj.moduleId, status: obj.status || 'not_started', progress_pct: Number(obj.progressPct || 0), data: obj }
        : table === 'training_updates' ? { title: obj.title || '', summary: obj.summary || '', type: obj.type || 'processus', published_at: obj.publishedAt || null, created_by: currentUser.id, data: obj }
          : table === 'training_skills' ? { name: obj.name || obj.title || '', description: obj.description || '', data: obj }
            : { agent_id: obj.agentId || currentUser.id, module_id: obj.moduleId || null, update_id: obj.updateId || null, data: obj };
  const created = await supabase.insertRow(table, row);
  return Array.isArray(created) ? created[0]?.id || null : created?.id || null;
}
async function trUpdateDoc(collection, id, obj) {
  if (!requireRoles('admin', 'formateur')) return;
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) throw new Error('Supabase n’est pas configuré.');
  const tableMap = { trainingModules: 'training_modules', trainingQuizzes: 'training_quizzes', trainingProgress: 'training_progress', trainingUpdates: 'training_updates', trainingSkills: 'training_skills', trainingAcknowledgements: 'training_acknowledgements' };
  const table = tableMap[collection] || collection;
  const row = table === 'training_modules' ? { title: obj.title || '', description: obj.description || '', category: obj.category || '', duration_min: Number(obj.durationMin || 0), status: obj.status || 'draft', objectives: obj.objectives || [], modules: obj.modules || [], data: obj }
    : table === 'training_quizzes' ? { title: obj.title || '', description: obj.description || '', passing_score: Number(obj.passingScore || 70), status: obj.status || 'draft', questions: obj.questions || [], data: obj }
      : table === 'training_progress' ? { status: obj.status || 'not_started', progress_pct: Number(obj.progressPct || 0), data: obj }
        : table === 'training_updates' ? { title: obj.title || '', summary: obj.summary || '', type: obj.type || 'processus', published_at: obj.publishedAt || null, data: obj }
          : table === 'training_skills' ? { name: obj.name || obj.title || '', description: obj.description || '', data: obj }
            : { data: obj };
  await supabase.updateRow(table, id, row);
}
async function loadTrainingData(force = false) {
  if (trainingLoaded && !force) return;
  const [modules, quizzes, progress, updates, skills, acknowledgements] = await Promise.all([
    trFetchCollection('trainingModules').catch(() => []),
    trFetchCollection('trainingQuizzes').catch(() => []),
    trFetchCollection('trainingProgress').catch(() => []),
    trFetchCollection('trainingUpdates').catch(() => []),
    trFetchCollection('trainingSkills').catch(() => []),
    trFetchCollection('trainingAcknowledgements').catch(() => []),
  ]);
  trainingModules = modules; trainingQuizzes = quizzes; trainingProgress = progress; trainingUpdates = updates; trainingSkills = skills; trainingAcknowledgements = acknowledgements;
  trainingLoaded = true;
}
function trainingAgentName(id) { const a = TEAM.find(u => u.id === id); return a ? a.name : id || 'Agent'; }
function trainingModuleProgress(moduleId) {
  const list = trainingProgress.filter(p => p.moduleId === moduleId);
  if (!list.length) return null;
  return Math.round(list.reduce((sum, p) => sum + Math.max(0, Math.min(100, Number(p.progressPct ?? (p.status === 'completed' ? 100 : p.status === 'in_progress' ? 50 : 0)))), 0) / list.length);
}
function trainingSwitchSubTab(tab) {
  trainingSubTab = tab;
  document.querySelectorAll('.training-tab').forEach(b => b.classList.toggle('active', b.dataset.trainingTab === tab));
  if (tab === 'dashboard') renderTrainingDashboard();
  if (tab === 'sources') renderTrainingSources();
  if (tab === 'modules') renderTrainingModules();
  if (tab === 'quizzes') renderTrainingQuizzes();
  if (tab === 'skills') renderTrainingSkills();
  if (tab === 'updates') renderTrainingUpdates();
}
async function renderTrainingHub() {
  if (!document.getElementById('training-panel')) return;
  const header = document.getElementById('training-header');
  const trainingTitle = currentUser.role === 'agent' ? 'Mon espace formation' : 'Espace Formation';
  const trainingSubtitle = currentUser.role === 'agent' ? 'Retrouve tes parcours, les quiz et les dernières évolutions de procédure.' : 'Centralise les parcours, les quiz, les procédures et le suivi de montée en compétence de l’équipe.';
  header.innerHTML = `<div class="training-card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:220px"><div style="font:600 24px var(--display);color:var(--ocean)">${trainingTitle}</div><div class="training-meta">${trainingSubtitle}</div></div>
    ${trainingCanManage() ? '<button class="btn btn-primary" onclick="trainingCreateModule()">+ Nouvelle formation</button>' : ''}
  </div>
  <div class="training-tabs">
    ${[['dashboard','Vue d’ensemble'],['sources','Sources documentaires'],['modules','Parcours'],['quizzes','Quiz'],['skills','Compétences'],['updates','Évolutions']].map(([id,label]) => `<button class="training-tab ${trainingSubTab === id ? 'active' : ''}" data-training-tab="${id}" onclick="trainingSwitchSubTab('${id}')">${label}</button>`).join('')}
  </div>`;
  try { await loadTrainingData(); trainingSwitchSubTab(trainingSubTab); }
  catch (e) { document.getElementById('training-content').innerHTML = trainingEmpty('Impossible de charger les données de formation.'); }
}
function renderTrainingDashboard() {
  const published = trainingModules.filter(m => m.status === 'published').length;
  const inProgress = trainingProgress.filter(p => p.status === 'in_progress').length;
  const completed = trainingProgress.filter(p => p.status === 'completed').length;
  const totalProgress = trainingProgress.length ? Math.round(trainingProgress.reduce((s, p) => s + Number(p.progressPct ?? (p.status === 'completed' ? 100 : p.status === 'in_progress' ? 50 : 0)), 0) / trainingProgress.length) : 0;
  const recent = trainingUpdates.slice().sort((a,b) => (b.publishedAt || b.updatedAt || 0) - (a.publishedAt || a.updatedAt || 0)).slice(0, 5);
  const moduleCards = trainingModules.slice().sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4).map(m => {
    const pct = trainingModuleProgress(m.id);
    return `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div class="training-card-title">${docEsc(m.title || 'Formation sans titre')}</div>${trainingStatus(m.status)}</div><div class="training-meta" style="margin-top:7px">${docEsc(m.category || 'Général')} · ${m.durationMin || 0} min</div>${pct !== null ? `<div class="training-progress"><div class="training-progress-fill" style="width:${pct}%"></div></div><div class="training-meta" style="margin-top:5px">Progression moyenne : ${pct}%</div>` : '<div class="training-meta" style="margin-top:10px">Aucune progression enregistrée</div>'}</div>`;
  }).join('');
  const progressRows = trainingProgress.slice().sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 6).map(p => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)"><div style="flex:1"><div class="training-card-title">${docEsc(trainingAgentName(p.agentId))}</div><div class="training-meta">${docEsc(trainingModules.find(m => m.id === p.moduleId)?.title || 'Formation')}</div></div><strong style="font:600 13px var(--mono)">${Number(p.progressPct ?? (p.status === 'completed' ? 100 : p.status === 'in_progress' ? 50 : 0))}%</strong></div>`).join('');
  document.getElementById('training-content').innerHTML = `<div class="training-kpis"><div class="stat-card"><div class="stat-label">Formations publiées</div><div class="stat-value">${published}</div></div><div class="stat-card"><div class="stat-label">En cours</div><div class="stat-value">${inProgress}</div></div><div class="stat-card"><div class="stat-label">Terminées</div><div class="stat-value">${completed}</div></div><div class="stat-card"><div class="stat-label">Progression moyenne</div><div class="stat-value">${totalProgress}%</div></div></div>
  <div class="training-grid"><div class="training-card"><h3>Parcours récents</h3>${moduleCards || trainingEmpty('Aucun parcours pour le moment.')}</div><div class="training-card"><h3>Progression de l’équipe</h3>${progressRows || trainingEmpty('Aucune progression enregistrée.')}</div></div>
  <div class="training-card"><h3>Dernières évolutions</h3>${recent.length ? recent.map(u => `<div style="padding:9px 0;border-bottom:1px solid var(--border)"><div class="training-card-title">${docEsc(u.title || 'Mise à jour')}</div><div class="training-meta">${trainingDate(u.publishedAt || u.updatedAt)} · ${docEsc(u.type || 'Processus')}</div><div class="training-meta" style="margin-top:3px">${docEsc(u.summary || '')}</div></div>`).join('') : trainingEmpty('Aucune évolution publiée.')}</div>`;
}
async function renderTrainingSources() {
  const content = document.getElementById('training-content');
  content.innerHTML = `<div class="training-card"><h3>Documents importés par le Formateur</h3><div class="training-meta">Importe et valide ton document dans Documentation pour demander à l’IA de préparer un parcours de formation.</div></div><div class="training-grid">${trainingEmpty('Chargement des procédures…')}</div>`;
  try {
    await docLoadProcedures();
    const visible = currentUser.role === 'admin' ? docProcedures : docProcedures.filter(p => p.trainingOwnerId === currentUser.id || (p.ownerRole === 'formateur' && p.createdBy === currentUser.id));
    const cards = visible.map(p => { const validated = p.validationStatus === 'validated' || p.status === 'validated'; return `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div class="training-card-title">${docEsc(p.title || 'Document sans titre')}</div><span class="training-status ${validated ? 'published' : 'draft'}">${validated ? 'Validé' : 'À valider'}</span></div><div class="training-meta" style="margin-top:8px">${docEsc(p.category || 'Sans catégorie')} · ${p.version ? `v${docEsc(p.version)}` : 'Version non renseignée'}</div><div class="training-meta" style="margin-top:8px">${docEsc(p.description || 'Aucune description.')}</div><div class="training-actions"><button class="btn btn-ghost" onclick="docCardClick('${p.id}')">${validated ? 'Relire le document' : 'Ouvrir et valider'}</button>${trainingCanManage() && validated ? `<button class="btn btn-primary" onclick="trainingGenerateFromProcedure('${p.id}')">✨ Générer une formation</button>` : ''}</div></div>`; }).join('');
    content.innerHTML = `<div class="training-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3>Mes documents de formation</h3><div class="training-meta">Importe un document, relis-le et enregistre-le pour le valider avant de lancer la génération IA.</div></div>${trainingCanManage() ? '<button class="btn btn-primary" onclick="docOpenImportModal()">+ Importer un document</button>' : ''}</div></div><div class="training-grid">${cards || trainingEmpty('Aucun document importé par ce Formateur. Utilise « Importer un document » pour commencer.')}</div>`;
  } catch (e) { content.innerHTML = trainingEmpty('Impossible de charger les procédures : ' + docEsc(e.message)); }
}
function trainingBlockToText(block) {
  if (!block) return '';
  if (block.type === 'text' || block.type === 'callout') return block.content || '';
  if (block.type === 'list') return (block.items || []).map(i => '- ' + i).join('\\n');
  if (block.type === 'contact') return (block.entries || []).map(e => `${e.label}: ${e.value}`).join('\\n');
  if (block.type === 'table') return (block.rows || []).map(r => [r.type, r.subject, r.impact, r.actionSteps, r.notes].filter(Boolean).join(' | ')).join('\\n');
  return '';
}
function trainingProcedureToText(p) {
  return [p.title, p.category, p.description, ...(p.sections || []).map(trainingBlockToText)].filter(Boolean).join('\\n\\n').slice(0, 50000);
}
async function trainingAIStructure(procedure) {
  const apiKey = await docGetStoredApiKey();
  const res = await apiFetch('/api/ai-structure', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'training', sourceProcedureId: procedure.id, sourceTitle: procedure.title, text: trainingProcedureToText(procedure), filename: `${procedure.title || 'procedure'}-formation`, apiKey: apiKey || undefined,
      instruction: 'Transforme cette procédure en parcours de formation. Retourne un objet training avec title, description, objectives, modules, quizzes et skills. Chaque quiz doit contenir text, options, correctIndex et explanation.' })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error((data && data.error) || `Erreur serveur (${res.status})`);
  if (data.training) return data.training;
  throw new Error('L’API IA répond bien, mais ne renvoie pas encore le format training attendu. Elle doit supporter mode=training et retourner { training: ... }.');
}
function trainingNormalizeQuiz(q, index) {
  const questions = q.questions || q.items || (q.question ? [q] : []);
  return { title: q.title || q.name || `Quiz ${index + 1}`, description: q.description || '', passingScore: Number(q.passingScore || 70), status: 'draft', questions: questions.map((item, i) => ({ id: item.id || `q${index + 1}-${i + 1}`, text: item.text || item.question || '', options: item.options || item.choices || [], correctIndex: Number(item.correctIndex ?? item.answerIndex ?? 0), explanation: item.explanation || item.answerExplanation || '' })) };
}
function trainingGeneratedPreview(training, procedure) {
  const objectives = (training.objectives || training.objectifs || []).map(o => `<li>${docEsc(typeof o === 'string' ? o : o.text || o.title || '')}</li>`).join('');
  const modules = (training.modules || []).map((m, i) => `<div style="padding:10px 0;border-top:1px solid var(--border)"><div class="training-card-title">${i + 1}. ${docEsc(m.title || m.name || 'Module')}</div><div class="training-meta" style="margin-top:4px">${docEsc(m.summary || m.description || '')}</div><div class="training-meta" style="margin-top:4px">${(m.lessons || m.lecons || []).length} leçon(s)</div></div>`).join('');
  const quizzes = (training.quizzes || []).map((q, i) => `<div style="padding:8px 0;border-top:1px solid var(--border)"><strong>${i + 1}. ${docEsc(q.title || q.name || 'Quiz')}</strong><div class="training-meta">${(q.questions || q.items || []).length} question(s)</div></div>`).join('');
  const skills = (training.skills || training.competencies || []).map(s => `<span class="training-status">${docEsc(typeof s === 'string' ? s : s.name || s.title || '')}</span>`).join('');
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button class="btn btn-ghost" onclick="trainingSwitchSubTab('sources')">← Retour aux sources</button><div><h3>Proposition générée par l’IA</h3><div class="training-meta">Source : ${docEsc(procedure.title || '')}</div></div></div><div class="form-row"><label class="form-label">Titre du parcours</label><input class="form-input" id="training-draft-title" value="${docEscAttr(training.title || procedure.title || '')}"></div><div class="form-row"><label class="form-label">Description</label><textarea class="form-input" id="training-draft-description" rows="3">${docEsc(training.description || '')}</textarea></div><div class="form-row"><label class="form-label">Objectifs pédagogiques</label><ul style="padding-left:20px;font-size:13px;line-height:1.7">${objectives || '<li>Aucun objectif généré.</li>'}</ul></div></div><div class="training-grid"><div class="training-card"><h3>Modules</h3>${modules || trainingEmpty('Aucun module généré.')}</div><div class="training-card"><h3>Quiz</h3>${quizzes || trainingEmpty('Aucun quiz généré.')}</div></div><div class="training-card"><h3>Compétences associées</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${skills || '<span class="training-meta">Aucune compétence générée.</span>'}</div><div class="training-actions"><button class="btn btn-primary" onclick="trainingSaveGenerated()">Enregistrer comme brouillon</button></div></div>`;
}
async function trainingGenerateFromProcedure(id) {
  if (!trainingCanManage()) return;
  const procedure = docProcedures.find(p => p.id === id); if (!procedure) return;
  const validated = procedure.validationStatus === 'validated' || procedure.status === 'validated';
  if (currentUser.role !== 'admin' && !validated) { alert('Le document doit être relu et validé avant de lancer la génération IA.'); return; }
  document.getElementById('training-content').innerHTML = trainingEmpty('✨ L’IA analyse la procédure et construit le parcours pédagogique…');
  try { trainingGeneratedDraft = { sourceProcedureId: id, sourceProcedureTitle: procedure.title, generatedAt: Date.now(), ...(await trainingAIStructure(procedure)) }; trainingGeneratedPreview(trainingGeneratedDraft, procedure); }
  catch (e) { document.getElementById('training-content').innerHTML = `<div class="training-card"><h3>Génération impossible</h3><div class="training-meta">${docEsc(e.message)}</div><div class="training-actions"><button class="btn btn-ghost" onclick="trainingSwitchSubTab('sources')">Retour aux sources</button></div></div>`; }
}
async function trainingSaveGenerated() {
  if (!trainingCanManage() || !trainingGeneratedDraft) return;
  const title = document.getElementById('training-draft-title')?.value.trim() || trainingGeneratedDraft.title || 'Parcours sans titre';
  const description = document.getElementById('training-draft-description')?.value.trim() || '';
  const modules = trainingGeneratedDraft.modules || [];
  const skills = trainingGeneratedDraft.skills || trainingGeneratedDraft.competencies || [];
  const moduleObj = { title, description, objectives: trainingGeneratedDraft.objectives || trainingGeneratedDraft.objectifs || [], modules, skills, sourceProcedureId: trainingGeneratedDraft.sourceProcedureId || null, sourceProcedureTitle: trainingGeneratedDraft.sourceProcedureTitle || '', status: 'draft', generatedBy: currentUser.id, createdBy: currentUser.id, createdAt: Date.now(), updatedAt: Date.now() };
  try {
    const moduleId = await trCreateDoc('trainingModules', moduleObj); trainingModules.push({ id: moduleId, ...moduleObj });
    for (let i = 0; i < (trainingGeneratedDraft.quizzes || []).length; i++) { const quiz = trainingNormalizeQuiz(trainingGeneratedDraft.quizzes[i], i); quiz.moduleId = moduleId; quiz.createdBy = currentUser.id; quiz.createdAt = Date.now(); quiz.updatedAt = Date.now(); const quizId = await trCreateDoc('trainingQuizzes', quiz); trainingQuizzes.push({ id: quizId, ...quiz }); }
    for (const skill of skills) { const name = typeof skill === 'string' ? skill : skill.name || skill.title; if (name) { const skillObj = { skill: name, level: 'À évaluer', moduleId, sourceProcedureId: moduleObj.sourceProcedureId, updatedAt: Date.now(), updatedBy: currentUser.id }; const skillId = await trCreateDoc('trainingSkills', skillObj); trainingSkills.push({ id: skillId, ...skillObj }); } }
    trainingGeneratedDraft = null; trainingSwitchSubTab('modules');
  } catch (e) { alert('Enregistrement impossible : ' + e.message); }
}
function renderTrainingModules() {
  const cards = trainingModules.slice().sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(m => `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div class="training-card-title">${docEsc(m.title || 'Formation sans titre')}</div>${trainingStatus(m.status)}</div><div class="training-meta" style="margin-top:8px">${docEsc(m.description || 'Aucune description.')}</div><div class="training-meta" style="margin-top:8px">${docEsc(m.category || 'Général')} · ${m.durationMin || 0} min · mis à jour le ${trainingDate(m.updatedAt)}</div><div class="training-actions"><button class="btn btn-ghost" onclick="switchTab('documentation',document.getElementById('tab-documentation'))">Voir les procédures</button>${trainingCanManage() ? `<button class="btn btn-ghost" onclick="trainingToggleModule('${m.id}')">${m.status === 'published' ? 'Repasser en brouillon' : 'Publier'}</button>` : ''}</div></div>`).join('');
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h3>Parcours de formation</h3><div class="training-meta">Un parcours peut regrouper des procédures, des quiz et des objectifs.</div></div>${trainingCanManage() ? '<button class="btn btn-primary" onclick="trainingCreateModule()">+ Créer</button>' : ''}</div></div><div class="training-grid">${cards || trainingEmpty('Aucun parcours créé. Commence par créer une formation.')}</div>`;
}
function renderTrainingQuizzes() {
  const cards = trainingQuizzes.slice().sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(q => `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div class="training-card-title">${docEsc(q.title || 'Quiz sans titre')}</div>${trainingStatus(q.status)}</div><div class="training-meta" style="margin-top:8px">${docEsc(q.description || 'Aucune description.')} · ${(q.questions || []).length} question(s)</div><div class="training-actions">${trainingCanManage() ? `<button class="btn btn-ghost" onclick="trainingAddQuizQuestion('${q.id}')">+ Ajouter une question</button>` : `<button class="btn btn-primary" onclick="trainingTakeQuiz('${q.id}')" ${!(q.questions || []).length ? 'disabled' : ''}>Commencer le quiz</button>`}</div></div>`).join('');
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><h3>Quiz et évaluations</h3><div class="training-meta">Crée d’abord un brouillon ; les questions et la correction seront enrichies dans l’étape suivante.</div></div>${trainingCanManage() ? '<button class="btn btn-primary" onclick="trainingCreateQuiz()">+ Nouveau quiz</button>' : ''}</div></div><div class="training-grid">${cards || trainingEmpty('Aucun quiz créé.')}</div>`;
}
function renderTrainingSkills() {
  const agents = agentsOnly();
  const skillsByAgent = agents.map(a => { const rows = trainingSkills.filter(s => s.agentId === a.id); return `<div class="training-card"><div class="training-card-title">${docEsc(a.name)}</div>${rows.length ? rows.map(s => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><span class="training-meta">${docEsc(s.skill || 'Compétence')}</span><strong style="font-size:12px;color:var(--ocean)">${docEsc(s.level || 'Non évalué')}</strong></div>`).join('') : '<div class="training-meta" style="margin-top:8px">Aucune compétence évaluée.</div>'}</div>`; }).join('');
  const manageButtons = trainingCanManage() ? agents.map(a => `<button class="btn btn-ghost" onclick="trainingAddSkill('${a.id}')">+ Compétence pour ${docEsc(a.name)}</button>`).join('') : '';
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h3>Matrice de compétences</h3><div class="training-meta">Visualise les compétences à renforcer et les agents qui nécessitent un accompagnement.</div></div><div class="training-actions" style="margin-top:0">${manageButtons}</div></div></div><div class="training-grid">${skillsByAgent || trainingEmpty('Aucun agent disponible.')}</div>`;
}
function trainingIsAcknowledged(updateId) { return trainingAcknowledgements.some(a => a.updateId === updateId && a.agentId === currentUser.id); }
async function trainingAcknowledgeUpdate(updateId) {
  if (!currentUser || currentUser.role !== 'agent' || trainingIsAcknowledged(updateId)) return;
  const obj = { updateId, agentId: currentUser.id, acknowledgedAt: Date.now() };
  try { const id = await trCreateDoc('trainingAcknowledgements', obj); trainingAcknowledgements.push({ id, ...obj }); renderTrainingUpdates(); } catch (e) { alert('Accusé de lecture impossible : ' + e.message); }
}
async function trainingAddSkill(agentId) {
  if (!trainingCanManage()) return;
  const skill = prompt('Nom de la compétence'); if (!skill || !skill.trim()) return;
  const level = prompt('Niveau (À renforcer, En cours, Acquis)', 'À renforcer') || 'À renforcer';
  const obj = { agentId, skill: skill.trim(), level: level.trim(), updatedAt: Date.now(), updatedBy: currentUser.id };
  try { const id = await trCreateDoc('trainingSkills', obj); trainingSkills.push({ id, ...obj }); renderTrainingSkills(); } catch (e) { alert('Compétence impossible à enregistrer : ' + e.message); }
}
function renderTrainingUpdates() {
  const rows = trainingUpdates.slice().sort((a,b) => (b.publishedAt || b.updatedAt || 0) - (a.publishedAt || a.updatedAt || 0)).map(u => `<div class="training-card"><div style="display:flex;justify-content:space-between;gap:10px"><div class="training-card-title">${docEsc(u.title || 'Mise à jour')}</div><span class="training-status published">${docEsc(u.type || 'Processus')}</span></div><div class="training-meta" style="margin-top:8px">Publié le ${trainingDate(u.publishedAt || u.updatedAt)}${u.version ? ` · Version ${docEsc(u.version)}` : ''}</div><div class="training-meta" style="margin-top:7px">${docEsc(u.summary || 'Aucun résumé.')}</div>${currentUser.role === 'agent' ? `<div class="training-actions"><button class="btn ${trainingIsAcknowledged(u.id) ? 'btn-ghost' : 'btn-primary'}" onclick="trainingAcknowledgeUpdate('${u.id}')" ${trainingIsAcknowledged(u.id) ? 'disabled' : ''}>${trainingIsAcknowledged(u.id) ? 'Lecture confirmée ✓' : 'Marquer comme lu'}</button></div>` : ''}</div>`).join('');
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;justify-content:space-between;align-items:center"><div><h3>Évolutions d’équipe</h3><div class="training-meta">Centralise les nouveautés à communiquer et les changements de processus à faire lire.</div></div>${trainingCanManage() ? '<button class="btn btn-primary" onclick="trainingCreateUpdate()">+ Nouvelle évolution</button>' : ''}</div></div><div class="training-grid">${rows || trainingEmpty('Aucune évolution publiée.')}</div>`;
}
async function trainingCreateModule() {
  if (!trainingCanManage()) return;
  const title = prompt('Nom de la formation'); if (!title || !title.trim()) return;
  const description = prompt('Description courte') || '';
  const category = prompt('Catégorie', 'Onboarding') || 'Général';
  const obj = { title: title.trim(), description: description.trim(), category: category.trim(), status: 'draft', durationMin: 30, linkedProcedureIds: [], createdBy: currentUser.id, createdAt: Date.now(), updatedAt: Date.now() };
  try { const id = await trCreateDoc('trainingModules', obj); trainingModules.push({ id, ...obj }); renderTrainingModules(); } catch (e) { alert('Création impossible : ' + e.message); }
}
async function trainingToggleModule(id) {
  if (!trainingCanManage()) return;
  const module = trainingModules.find(m => m.id === id); if (!module) return;
  const updated = { ...module, status: module.status === 'published' ? 'draft' : 'published', updatedAt: Date.now() }; delete updated.id;
  try { await trUpdateDoc('trainingModules', id, updated); Object.assign(module, updated); renderTrainingModules(); } catch (e) { alert('Publication impossible : ' + e.message); }
}
async function trainingCreateQuiz() {
  if (!trainingCanManage()) return;
  const title = prompt('Nom du quiz'); if (!title || !title.trim()) return;
  const description = prompt('Description courte') || '';
  const obj = { title: title.trim(), description: description.trim(), status: 'draft', questions: [], passingScore: 70, createdBy: currentUser.id, createdAt: Date.now(), updatedAt: Date.now() };
  try { const id = await trCreateDoc('trainingQuizzes', obj); trainingQuizzes.push({ id, ...obj }); renderTrainingQuizzes(); }
  catch (e) { alert('Création impossible : ' + e.message); }
}
async function trainingAddQuizQuestion(id) {
  if (!trainingCanManage()) return;
  const quiz = trainingQuizzes.find(q => q.id === id); if (!quiz) return;
  const text = prompt('Question'); if (!text || !text.trim()) return;
  const options = (prompt('Options séparées par des virgules') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (options.length < 2) { alert('Ajoute au moins deux options.'); return; }
  const correctIndex = Math.max(0, Math.min(options.length - 1, Number(prompt(`Index de la bonne réponse (0 à ${options.length - 1})`, '0')) || 0));
  const explanation = prompt('Explication de la réponse') || '';
  const updated = { ...quiz, questions: [...(quiz.questions || []), { id: 'q' + Date.now().toString(36), text: text.trim(), options, correctIndex, explanation: explanation.trim() }], updatedAt: Date.now() }; delete updated.id;
  try { await trUpdateDoc('trainingQuizzes', id, updated); Object.assign(quiz, updated); renderTrainingQuizzes(); } catch (e) { alert('Question impossible à enregistrer : ' + e.message); }
}
async function trainingTakeQuiz(id) {
  if (!currentUser || currentUser.role !== 'agent') return;
  const quiz = trainingQuizzes.find(q => q.id === id); if (!quiz || !(quiz.questions || []).length) return;
  document.getElementById('training-content').innerHTML = `<div class="training-card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button class="btn btn-ghost" onclick="trainingSwitchSubTab('quizzes')">← Retour</button><div><h3>${docEsc(quiz.title)}</h3><div class="training-meta">Score minimum : ${Number(quiz.passingScore || 70)}%</div></div></div><form id="training-quiz-form" onsubmit="event.preventDefault();trainingSubmitQuiz('${quiz.id}')">${quiz.questions.map((q, i) => `<div style="padding:14px 0;border-top:1px solid var(--border)"><div class="training-card-title">${i + 1}. ${docEsc(q.text || 'Question')}</div><div style="display:grid;gap:7px;margin-top:9px">${(q.options || []).map((option, j) => `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="radio" name="q-${q.id}" value="${j}"> ${docEsc(option)}</label>`).join('')}</div></div>`).join('')}<button class="btn btn-primary" type="submit" style="margin-top:14px">Valider mes réponses</button></form></div>`;
}
async function trainingSubmitQuiz(id) {
  if (!currentUser || currentUser.role !== 'agent') return;
  const quiz = trainingQuizzes.find(q => q.id === id); if (!quiz) return;
  let correct = 0;
  (quiz.questions || []).forEach(q => { const selected = document.querySelector(`input[name="q-${q.id}"]:checked`); if (selected && Number(selected.value) === Number(q.correctIndex)) correct++; });
  const total = (quiz.questions || []).length; const score = total ? Math.round(correct / total * 100) : 0; const passed = score >= Number(quiz.passingScore || 70);
  const attempt = { quizId: id, agentId: currentUser.id, score, passed, completedAt: Date.now() };
  try {
    await trCreateDoc('trainingAttempts', attempt);
    const progress = { agentId: currentUser.id, quizId: id, moduleId: quiz.moduleId || '', status: passed ? 'completed' : 'in_progress', progressPct: score, score, updatedAt: Date.now() };
    await trCreateDoc('trainingProgress', progress);
    trainingProgress.push(progress);
    document.getElementById('training-content').innerHTML = `<div class="training-card"><h3>${passed ? 'Quiz réussi' : 'Quiz terminé'}</h3><div class="training-kpis" style="margin-top:14px"><div class="stat-card"><div class="stat-label">Score</div><div class="stat-value">${score}%</div></div><div class="stat-card"><div class="stat-label">Résultat</div><div class="stat-value" style="font-size:20px">${passed ? 'Validé' : 'À revoir'}</div></div></div><div class="training-actions"><button class="btn btn-primary" onclick="trainingSwitchSubTab('quizzes')">Retour aux quiz</button></div></div>`;
  } catch (e) { alert('Enregistrement du quiz impossible : ' + e.message); }
}
async function trainingCreateUpdate() {
  if (!trainingCanManage()) return;
  const title = prompt('Titre de l’évolution'); if (!title || !title.trim()) return;
  const summary = prompt('Résumé à communiquer') || '';
  const obj = { title: title.trim(), summary: summary.trim(), type: 'Processus', version: '1.0', publishedAt: Date.now(), updatedAt: Date.now(), createdBy: currentUser.id };
  try { const id = await trCreateDoc('trainingUpdates', obj); trainingUpdates.push({ id, ...obj }); renderTrainingUpdates(); } catch (e) { alert('Création impossible : ' + e.message); }
}
