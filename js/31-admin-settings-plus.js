// Task’in — Admin › Paramètres (lot U9) : sections réécrites, branchées sur le rendu existant (16-admin-settings.js).
// · Procédures : un seul bloc (modifier, créer, importer avec l'IA) sur les vraies procédures de la Documentation.
// · API IA : plusieurs API (bouton +), clé envoyée au serveur seulement, donut d'état, comportement quoi / où / quand.
// · Objectifs journaliers : cartes par pôle, réalisé du jour en regard.
// · Types de traitement : rangs modifiables (glisser ou flèches), même ordre dans la web app et l'extension.
// · Team's shift : par agent (édition), par pôle (lecture), emploi du temps filtrable (jour / semaine / mois).

const ASP = {
  ai: null, aiLoading: false, aiError: '', aiEdit: null,
  procQuery: '', procStatus: 'all', procCat: 'all',
  types: null, typesDirty: false,
  shiftView: 'agent', shiftPole: 'all', shiftAgent: 'all', shiftSpan: 'week', shiftDate: '',
};
const ASP_SECTIONS = ['procedures', 'ai', 'goals', 'types', 'shifts'];
const ASP_POLES = [['fo', 'Front Office', '#2563EB'], ['bo', 'Back Office', '#7C3AED'], ['reconf', 'Reconfirmation', '#16A34A']];
const ASP_PROVIDERS = {
  gemini: { label: 'Google Gemini', models: ['gemini-3.6-flash', 'gemini-3.6-pro'], color: '#2563EB' },
  anthropic: { label: 'Anthropic Claude', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'], color: '#D97706' },
  openai: { label: 'OpenAI / compatible', models: ['gpt-5', 'gpt-5-mini'], color: '#16A34A' },
};
const ASP_TASKS = [['structure_procedure', 'Structurer un document en procédure ou en formation']];
const ASP_MODULES = [['documentation', 'Documentation · import de procédure'], ['formation', 'Formation · création de parcours']];
const ASP_WHEN = [['always', 'Tout le temps'], ['business_hours', 'Heures de bureau (8 h – 18 h, lun.–sam.)'], ['off_hours', 'Hors heures de bureau (relais)']];

function aspEsc(v) { return adminSettingsEsc(v); }
function aspDonut(segments, center, sub, size = 92, stroke = 11) {
  const total = segments.reduce((s, x) => s + x.value, 0), r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const arcs = total ? segments.filter(x => x.value > 0).map(x => { const len = x.value / total * c; const a = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${x.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"><title>${aspEsc(x.label)} : ${x.value}</title></circle>`; off += len; return a; }).join('') : '';
  return `<svg class="asp-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${aspEsc(center)} ${aspEsc(sub || '')}"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--surface2)" stroke-width="${stroke}"/><g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g><text x="50%" y="${sub ? '46%' : '52%'}" text-anchor="middle" dominant-baseline="middle" class="asp-donut-val">${aspEsc(center)}</text>${sub ? `<text x="50%" y="66%" text-anchor="middle" dominant-baseline="middle" class="asp-donut-sub">${aspEsc(sub)}</text>` : ''}</svg>`;
}
function aspStatus(id, text, error = false) { const el = document.getElementById(id); if (el) { el.textContent = text; el.style.color = error ? 'var(--clay)' : 'var(--green)'; } }

// Branche les nouvelles sections sur le rendu existant (même coquille, même bouton retour).
(function aspHook() {
  if (typeof adminSettingsRender !== 'function' || adminSettingsRender.__asp) return;
  const original = adminSettingsRender;
  const wrapped = function () {
    if (adminSettingsSection === 'addProcedure') adminSettingsSection = 'procedures';
    original.apply(this, arguments);
    if (!ASP_SECTIONS.includes(adminSettingsSection)) return;
    const main = document.querySelector('#admin-settings-panel .admin-settings-content');
    if (!main) return;
    const back = main.querySelector('.admin-settings-back');
    main.innerHTML = '';
    if (back) main.appendChild(back);
    const box = document.createElement('div');
    box.className = 'asp';
    main.appendChild(box);
    ({ procedures: aspProcedures, ai: aspAi, goals: aspGoals, types: aspTypes, shifts: aspShifts })[adminSettingsSection](box);
    const head = document.querySelector('#admin-settings-panel .admin-settings-head p');
    const meta = { procedures: 'Procédures · modifier, créer ou importer au même endroit', ai: 'API IA · plusieurs fournisseurs, état et comportement', goals: 'Objectifs journaliers · cibles par pôle', types: 'Types de traitement · ordre de la web app et de l’extension', shifts: 'Team’s shift · par agent, par pôle, emploi du temps' }[adminSettingsSection];
    if (head && meta) head.textContent = meta;
  };
  wrapped.__asp = true;
  adminSettingsRender = wrapped;
  window.adminSettingsRender = wrapped;
})();

// ======================= PROCÉDURES =======================
async function aspProcedures(box) {
  box.innerHTML = '<p class="asp-loading">Chargement des procédures…</p>';
  if (typeof docLoadProcedures !== 'function') await loadModule('09-documentation.js').catch(() => {});
  if (typeof docLoadProcedures === 'function' && !(docProcedures || []).length) await docLoadProcedures();
  aspWrapDocEditor();
  aspProceduresPaint(box);
}
function aspProcStatus(p) { return p.status === 'published' ? ['Publiée', 'good'] : p.status === 'archived' ? ['Archivée', 'muted'] : ['Brouillon', 'warn']; }
function aspProceduresPaint(box) {
  const all = (typeof docProcedures !== 'undefined' ? docProcedures : []) || [];
  const old = p => p.updatedAt && Date.now() - new Date(p.updatedAt).getTime() > 180 * 864e5;
  const cats = [...new Set(all.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const q = ASP.procQuery.trim().toLowerCase();
  const list = all.filter(p => (ASP.procStatus === 'all' || (ASP.procStatus === 'review' ? old(p) : (p.status || 'draft') === ASP.procStatus))
    && (ASP.procCat === 'all' || p.category === ASP.procCat)
    && (!q || `${p.title} ${p.category || ''} ${p.description || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  const count = s => all.filter(p => (p.status || 'draft') === s).length;
  box.innerHTML = `<section class="admin-settings-card asp-card">
    <div class="admin-workflow-card-head"><div><span>PROCÉDURES</span><h3>Un seul endroit pour toutes les procédures</h3></div>${adminSettingsStatusBadge(`${all.length} procédure${all.length > 1 ? 's' : ''}`, 'good')}</div>
    <div class="asp-choices">
      <button type="button" class="asp-choice" data-asp-proc="new"><b>＋ Nouvelle procédure</b><span>Éditeur complet : textes, listes, encadrés, contacts, tableaux d’action.</span></button>
      <button type="button" class="asp-choice" data-asp-proc="import"><b>⇪ Importer un fichier</b><span>PDF, image ou texte : l’IA en fait une procédure structurée, à relire avant publication.</span></button>
      <button type="button" class="asp-choice" data-asp-proc="edit"><b>✎ Modifier une procédure</b><span>Rechercher ci-dessous puis « Modifier » : la mise en forme d’origine est conservée.</span></button>
    </div>
    <div class="asp-kpis"><div><b>${count('published')}</b><span>publiées</span></div><div><b>${count('draft')}</b><span>brouillons</span></div><div><b>${count('archived')}</b><span>archivées</span></div><div><b class="${all.filter(old).length ? 'asp-warn' : ''}">${all.filter(old).length}</b><span>à revoir (&gt; 6 mois)</span></div></div>
    <div class="asp-toolbar">
      <input type="search" class="form-input" id="asp-proc-search" placeholder="Rechercher une procédure (titre, catégorie, résumé)" value="${aspEsc(ASP.procQuery)}">
      <select class="form-input" id="asp-proc-status">${[['all', 'Tous les statuts'], ['published', 'Publiées'], ['draft', 'Brouillons'], ['archived', 'Archivées'], ['review', 'À revoir (> 6 mois)']].map(([v, l]) => `<option value="${v}" ${ASP.procStatus === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="form-input" id="asp-proc-cat"><option value="all">Toutes les catégories</option>${cats.map(c => `<option ${ASP.procCat === c ? 'selected' : ''}>${aspEsc(c)}</option>`).join('')}</select>
    </div>
    <div class="asp-proc-list">${list.map(p => { const [label, tone] = aspProcStatus(p); return `<div class="asp-proc-row">
        <span class="asp-proc-main"><strong>${aspEsc(p.title || 'Sans titre')}</strong><small>${aspEsc(p.category || 'Sans catégorie')}${p.version ? ` · v${aspEsc(p.version)}` : ''} · ${(p.sections || []).length} bloc${(p.sections || []).length > 1 ? 's' : ''}${p.updatedAt ? ` · mise à jour le ${new Date(p.updatedAt).toLocaleDateString('fr-FR')}` : ''}${old(p) ? ' · <b class="asp-warn">à revoir</b>' : ''}</small></span>
        <span class="asp-pill ${tone}">${label}</span>
        <button type="button" class="dr-edit-btn" data-asp-read="${aspEsc(p.id)}">Voir</button>
        <button type="button" class="admin-settings-primary" data-asp-edit="${aspEsc(p.id)}">Modifier</button>
      </div>`; }).join('') || '<p class="admin-workflow-empty">Aucune procédure ne correspond.</p>'}</div>
  </section>`;
  const search = box.querySelector('#asp-proc-search');
  search.addEventListener('input', () => { ASP.procQuery = search.value; clearTimeout(aspProceduresPaint.t); aspProceduresPaint.t = setTimeout(() => { aspProceduresPaint(box); const s = box.querySelector('#asp-proc-search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 180); });
  box.querySelector('#asp-proc-status').onchange = e => { ASP.procStatus = e.target.value; aspProceduresPaint(box); };
  box.querySelector('#asp-proc-cat').onchange = e => { ASP.procCat = e.target.value; aspProceduresPaint(box); };
  box.querySelector('[data-asp-proc="new"]').onclick = () => docOpenEditor(null);
  box.querySelector('[data-asp-proc="import"]').onclick = () => docOpenImportModal();
  box.querySelector('[data-asp-proc="edit"]').onclick = () => search.focus();
  box.querySelectorAll('[data-asp-edit]').forEach(b => b.onclick = () => docOpenEditor(all.find(p => p.id === b.dataset.aspEdit)));
  box.querySelectorAll('[data-asp-read]').forEach(b => b.onclick = () => docOpenReadModal(all.find(p => p.id === b.dataset.aspRead)));
}
// Après un enregistrement / une suppression dans l'éditeur de la Documentation, la liste se met à jour.
function aspWrapDocEditor() {
  ['docSaveProcedure', 'docDeleteProcedure'].forEach(name => {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__asp) return;
    const wrapped = async function () {
      const r = await fn.apply(this, arguments);
      if (adminSettingsSection === 'procedures' && !document.getElementById('admin-settings-panel')?.classList.contains('hidden')) { await docLoadProcedures(); adminSettingsRender(); }
      return r;
    };
    wrapped.__asp = true; window[name] = wrapped;
  });
}

// ======================= API IA =======================
async function aspAiLoad(force = false) {
  if (ASP.aiLoading || (ASP.ai && !force)) return;
  ASP.aiLoading = true; ASP.aiError = '';
  try { ASP.ai = await adminSettingsServerAction('listAiProviders', {}); }
  catch (e) { ASP.aiError = e.message; ASP.ai = ASP.ai || { providers: [], env: { configured: false, stats: {} } }; }
  ASP.aiLoading = false;
}
// État : « Intelligente » (≥ 95 % de réussite et réponse < 20 s), « Moyenne » (≥ 80 %), « Faible » sinon.
function aspHealth(stats) {
  if (!stats || !stats.calls) return { label: 'Pas encore utilisée', tone: 'muted', pct: null };
  const pct = Math.round(stats.ok / stats.calls * 100);
  if (pct >= 95 && (stats.avgLatency === null || stats.avgLatency < 20000)) return { label: 'Intelligente', tone: 'good', pct };
  if (pct >= 80) return { label: 'Moyenne', tone: 'warn', pct };
  return { label: 'Faible', tone: 'bad', pct };
}
function aspAiCard(p, isEnv = false) {
  const s = p.stats || {}, h = aspHealth(s), meta = ASP_PROVIDERS[p.provider] || ASP_PROVIDERS.gemini;
  const b = p.behavior || {};
  const what = (b.tasks?.length ? b.tasks : ASP_TASKS.map(t => t[0])).map(k => ASP_TASKS.find(t => t[0] === k)?.[1] || k).join(', ');
  const where = (b.modules?.length ? b.modules : ASP_MODULES.map(m => m[0])).map(k => ASP_MODULES.find(m => m[0] === k)?.[1].split(' · ')[0] || k).join(', ');
  const when = ASP_WHEN.find(w => w[0] === (b.when || 'always'))?.[1] || 'Tout le temps';
  const donut = aspDonut([{ value: s.ok || 0, color: 'var(--green)', label: 'Réussis' }, { value: s.errors || 0, color: 'var(--red)', label: 'Échecs' }], h.pct === null ? '—' : `${h.pct}%`, 'réussite');
  const quota = p.daily_quota ? `${s.today || 0} / ${p.daily_quota} aujourd’hui` : `${s.today || 0} appel${(s.today || 0) > 1 ? 's' : ''} aujourd’hui`;
  return `<article class="asp-ai-card ${p.enabled === false ? 'is-off' : ''}" style="--c:${meta.color}">
    <header><span class="asp-ai-prov">${aspEsc(meta.label)}</span>${isEnv ? '<span class="asp-pill muted">Variable serveur</span>' : `<span class="asp-pill ${p.enabled === false ? 'muted' : 'good'}">${p.enabled === false ? 'Désactivée' : `Rang ${p.rank}`}</span>`}</header>
    <div class="asp-ai-body">${donut}<div class="asp-ai-copy"><strong>${aspEsc(p.name)}</strong><small>${aspEsc(p.model)}${p.key_hint ? ` · clé ${aspEsc(p.key_hint)}` : ''}</small>
      <span class="asp-health ${h.tone}"><i></i>${h.label}</span><small>${s.calls || 0} appel${(s.calls || 0) > 1 ? 's' : ''} sur 7 jours${s.avgLatency ? ` · ${(s.avgLatency / 1000).toFixed(1)} s en moyenne` : ''}</small><small>${quota}</small></div></div>
    <dl class="asp-behavior"><div><dt>Quoi</dt><dd>${aspEsc(isEnv ? 'Dernier recours pour toutes les tâches' : what)}</dd></div><div><dt>Où</dt><dd>${aspEsc(isEnv ? 'Documentation, Formation' : where)}</dd></div><div><dt>Quand</dt><dd>${aspEsc(isEnv ? 'Si aucune API ci-contre ne répond' : when)}</dd></div></dl>
    ${s.lastError ? `<p class="asp-ai-err" title="${aspEsc(s.lastError)}">Dernière erreur : ${aspEsc(String(s.lastError).slice(0, 90))}</p>` : ''}
    <footer><button type="button" class="dr-edit-btn" data-asp-ai-test="${isEnv ? 'env' : aspEsc(p.id)}">Tester</button>${isEnv ? '' : `<button type="button" class="dr-edit-btn" data-asp-ai-edit="${aspEsc(p.id)}">Modifier</button><button type="button" class="asp-danger" data-asp-ai-del="${aspEsc(p.id)}">Supprimer</button>`}<span class="asp-ai-status" data-asp-ai-status="${isEnv ? 'env' : aspEsc(p.id)}"></span></footer>
  </article>`;
}
function aspAiForm(p) {
  const prov = p?.provider || 'anthropic', b = p?.behavior || {};
  const checks = (list, sel, name) => list.map(([k, l]) => `<label class="asp-check"><input type="checkbox" name="${name}" value="${k}" ${!sel?.length || sel.includes(k) ? 'checked' : ''}> ${l}</label>`).join('');
  return `<form class="asp-ai-form" id="asp-ai-form" autocomplete="off">
    <h4>${p ? `Modifier « ${aspEsc(p.name)} »` : 'Ajouter une API IA'}</h4>
    <div class="asp-grid">
      <label class="admin-settings-field">Nom affiché<input name="name" required maxlength="80" value="${aspEsc(p?.name || '')}" placeholder="Ex. Claude · structuration"></label>
      <label class="admin-settings-field">Fournisseur<select name="provider">${Object.entries(ASP_PROVIDERS).map(([k, v]) => `<option value="${k}" ${prov === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="admin-settings-field">Modèle<input name="model" list="asp-models" value="${aspEsc(p?.model || ASP_PROVIDERS[prov].models[0])}"><datalist id="asp-models">${ASP_PROVIDERS[prov].models.map(m => `<option value="${m}">`).join('')}</datalist></label>
      <label class="admin-settings-field asp-baseurl ${prov === 'openai' ? '' : 'hidden'}">URL de l’API (compatible OpenAI)<input name="baseUrl" value="${aspEsc(p?.base_url || '')}" placeholder="https://api.openai.com/v1"></label>
      <label class="admin-settings-field asp-key">Clé API ${p?.key_hint ? `<small>(actuelle ${aspEsc(p.key_hint)} — laisser vide pour la garder)</small>` : ''}<input name="apiKey" type="password" ${p ? '' : 'required'} placeholder="Coller la clé ou charger un fichier"><span class="asp-upload"><input type="file" accept=".txt,.json,.key,text/plain,application/json" id="asp-key-file"> <small>Charger depuis un fichier (.txt / .json)</small></span></label>
      <label class="admin-settings-field">Rang (ordre d’essai)<input name="rank" type="number" min="0" max="1000" value="${p?.rank ?? 100}"></label>
      <label class="admin-settings-field">Quota par jour <small>(vide = illimité)</small><input name="dailyQuota" type="number" min="1" max="100000" value="${p?.daily_quota ?? ''}"></label>
      <label class="asp-check asp-enabled"><input type="checkbox" name="enabled" ${p?.enabled === false ? '' : 'checked'}> API active</label>
    </div>
    <fieldset class="asp-fs"><legend>Comportement</legend>
      <div class="asp-fs-grid"><div><b>Quoi</b>${checks(ASP_TASKS, b.tasks, 'tasks')}</div><div><b>Où</b>${checks(ASP_MODULES, b.modules, 'modules')}</div>
      <div><b>Quand</b>${ASP_WHEN.map(([k, l]) => `<label class="asp-check"><input type="radio" name="when" value="${k}" ${(b.when || 'always') === k ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <label class="admin-settings-field">Note interne<input name="note" maxlength="300" value="${aspEsc(b.note || '')}" placeholder="Ex. clé du compte agence, réservée aux imports volumineux"></label>
    </fieldset>
    <div class="admin-settings-actions"><button type="submit" class="admin-settings-primary">Enregistrer l’API</button><button type="button" class="dr-edit-btn" data-asp-ai-cancel>Annuler</button><span id="asp-ai-form-status"></span></div>
    <p class="admin-settings-copy">La clé part directement au serveur et n’est jamais renvoyée au navigateur (seuls ses 4 derniers caractères sont affichés).</p>
  </form>`;
}
async function aspAi(box) {
  box.innerHTML = '<p class="asp-loading">Lecture des API IA…</p>';
  await aspAiLoad(!ASP.ai);
  aspAiPaint(box);
}
function aspAiPaint(box) {
  const data = ASP.ai || { providers: [], env: {} };
  const providers = data.providers || [];
  const all = [...providers, ...(data.env?.configured ? [{ provider: 'gemini', name: 'Gemini (variable serveur)', stats: data.env.stats }] : [])];
  const totalCalls = all.reduce((n, p) => n + (p.stats?.calls || 0), 0);
  const ok = all.reduce((n, p) => n + (p.stats?.ok || 0), 0);
  const health = aspHealth({ calls: totalCalls, ok, avgLatency: null });
  const usage = aspDonut(all.map((p, i) => ({ value: p.stats?.calls || 0, color: ['#2563EB', '#D97706', '#16A34A', '#7C3AED', '#DB2777', '#0891B2'][i % 6], label: p.name })), String(totalCalls), 'appels · 7 j', 120, 14);
  box.innerHTML = `<section class="admin-settings-card asp-card">
    <div class="admin-workflow-card-head"><div><span>API IA</span><h3>Fournisseurs branchés</h3></div>${adminSettingsStatusBadge('Clés côté serveur', 'good')}</div>
    ${ASP.aiError ? `<p class="asp-ai-err">${aspEsc(ASP.aiError)}</p>` : ''}
    <div class="asp-ai-overview">${usage}<div><span class="asp-health big ${health.tone}"><i></i>Niveau global : ${health.label}${health.pct !== null ? ` · ${health.pct} % de réussite` : ''}</span>
      <p class="admin-settings-copy">Chaque import de procédure ou de formation essaie les API actives par rang, selon leur comportement (quoi / où / quand) et leur quota. Si une API échoue, la suivante prend le relais ; la variable serveur Gemini sert de dernier recours.</p>
      <ul class="asp-legend">${all.map((p, i) => `<li><i style="background:${['#2563EB', '#D97706', '#16A34A', '#7C3AED', '#DB2777', '#0891B2'][i % 6]}"></i>${aspEsc(p.name)}<b>${p.stats?.calls || 0}</b></li>`).join('') || '<li>Aucun appel sur 7 jours.</li>'}</ul></div></div>
    <div class="asp-ai-grid">${providers.map(p => aspAiCard(p)).join('')}${data.env?.configured ? aspAiCard({ provider: 'gemini', name: 'Gemini (variable serveur)', model: 'gemini-3.6-flash', stats: data.env.stats }, true) : ''}
      <button type="button" class="asp-ai-add" data-asp-ai-add><span>＋</span><b>Ajouter une API IA</b><small>Gemini, Claude ou compatible OpenAI</small></button></div>
    <div id="asp-ai-form-wrap">${ASP.aiEdit !== null ? aspAiForm(ASP.aiEdit === 'new' ? null : providers.find(p => p.id === ASP.aiEdit)) : ''}</div>
  </section>`;
  box.querySelector('[data-asp-ai-add]').onclick = () => { ASP.aiEdit = 'new'; aspAiPaint(box); box.querySelector('#asp-ai-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  box.querySelectorAll('[data-asp-ai-edit]').forEach(b => b.onclick = () => { ASP.aiEdit = b.dataset.aspAiEdit; aspAiPaint(box); box.querySelector('#asp-ai-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  box.querySelectorAll('[data-asp-ai-del]').forEach(b => b.onclick = async () => {
    const p = providers.find(x => x.id === b.dataset.aspAiDel);
    if (!p || !confirm(`Supprimer l’API « ${p.name} » et sa clé ?`)) return;
    try { await adminSettingsServerAction('deleteAiProvider', { id: p.id }); await aspAiLoad(true); aspAiPaint(box); } catch (e) { alert(e.message); }
  });
  box.querySelectorAll('[data-asp-ai-test]').forEach(b => b.onclick = async () => {
    const st = box.querySelector(`[data-asp-ai-status="${b.dataset.aspAiTest}"]`);
    b.disabled = true; st.textContent = 'Test…'; st.className = 'asp-ai-status';
    try { const r = await adminSettingsServerAction('testAiProvider', { id: b.dataset.aspAiTest }); st.textContent = `✓ ${r.message}`; st.classList.add('ok'); }
    catch (e) { st.textContent = e.message; st.classList.add('ko'); }
    b.disabled = false;
    await aspAiLoad(true); setTimeout(() => aspAiPaint(box), 1800);
  });
  const form = box.querySelector('#asp-ai-form');
  if (!form) return;
  form.querySelector('[data-asp-ai-cancel]').onclick = () => { ASP.aiEdit = null; aspAiPaint(box); };
  form.provider.onchange = () => {
    const prov = form.provider.value;
    form.querySelector('.asp-baseurl').classList.toggle('hidden', prov !== 'openai');
    form.querySelector('#asp-models').innerHTML = ASP_PROVIDERS[prov].models.map(m => `<option value="${m}">`).join('');
    if (!Object.values(ASP_PROVIDERS).some(v => v.models.includes(form.model.value)) || !ASP_PROVIDERS[prov].models.includes(form.model.value)) form.model.value = ASP_PROVIDERS[prov].models[0];
  };
  // Chargement de la clé depuis un fichier : texte brut, ou JSON avec un champ « api_key » / « key ».
  form.querySelector('#asp-key-file').onchange = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 20000) { aspStatus('asp-ai-form-status', 'Fichier trop volumineux pour une clé.', true); return; }
    let text = (await file.text()).trim();
    try { const j = JSON.parse(text); text = j.api_key || j.apiKey || j.key || j.private_key || text; } catch (_) {}
    form.apiKey.value = String(text).trim().split(/\s+/)[0];
    aspStatus('asp-ai-form-status', `Clé chargée depuis ${file.name}.`);
  };
  form.onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const payload = { id: ASP.aiEdit === 'new' ? '' : ASP.aiEdit, name: fd.get('name'), provider: fd.get('provider'), model: fd.get('model'), baseUrl: fd.get('baseUrl') || '', apiKey: fd.get('apiKey') || '',
      rank: fd.get('rank'), dailyQuota: fd.get('dailyQuota'), enabled: form.enabled.checked,
      behavior: { tasks: fd.getAll('tasks'), modules: fd.getAll('modules'), when: fd.get('when'), note: fd.get('note') || '' } };
    if (!payload.behavior.tasks.length || !payload.behavior.modules.length) { aspStatus('asp-ai-form-status', 'Coche au moins une tâche et un endroit.', true); return; }
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true; aspStatus('asp-ai-form-status', 'Enregistrement…');
    try { await adminSettingsServerAction('upsertAiProvider', payload); ASP.aiEdit = null; await aspAiLoad(true); aspAiPaint(box); }
    catch (e) { aspStatus('asp-ai-form-status', e.message, true); btn.disabled = false; }
  };
}

// ======================= OBJECTIFS JOURNALIERS =======================
function aspGoals(box) {
  const goals = adminSettingsGoals(), poles = (typeof poleGoals !== 'undefined' && poleGoals) || {};
  const metrics = [['count', 'Traitements', 'par agent / jour', ''], ['total', 'Temps traité', 'par agent / jour', 'min'], ['dmt', 'DMT cible', 'durée moyenne', 'min'], ['frt', '1re réponse', 'FRT', 'min']];
  const today = (typeof entries !== 'undefined' ? entries : []).filter(e => typeof isToday === 'function' && isToday(e.startTimeStr));
  const agentsOf = pole => (TEAM || []).filter(u => u.role === 'agent' && (pole === 'global' || u.pole === pole));
  const actual = (pole, key) => {
    const ids = new Set(agentsOf(pole).map(a => a.id)), list = today.filter(e => ids.has(e.agent));
    const active = new Set(list.map(e => e.agent)).size;
    if (!list.length) return null;
    if (key === 'count') return Math.round(list.length / active * 10) / 10;
    if (key === 'total') return Math.round(list.reduce((s, e) => s + e.durationSec, 0) / 60 / active);
    if (key === 'dmt') return Math.round(list.reduce((s, e) => s + e.durationSec, 0) / list.length / 60 * 10) / 10;
    return null;
  };
  const card = (pole, label, color, sub) => {
    const vals = metrics.map(([key, name, hint, unit]) => {
      const own = pole === 'global' ? goals[key] : poles[pole]?.[key];
      const effective = own ?? goals[key];
      const act = actual(pole, key);
      const lower = key === 'dmt' || key === 'frt';
      const pct = act !== null && effective ? Math.min(100, Math.round((lower ? effective / Math.max(act, 0.1) : act / effective) * 100)) : null;
      return `<label class="asp-goal">
        <span class="asp-goal-name">${name}<small>${hint}</small></span>
        <span class="asp-goal-input"><input type="number" min="0" inputmode="numeric" data-goal-pole="${pole}" data-goal-key="${key}" value="${own === undefined || own === null ? '' : aspEsc(own)}" placeholder="${pole === 'global' ? '—' : aspEsc(goals[key] ?? '')}">${unit ? `<em>${unit}</em>` : ''}</span>
        ${pct !== null ? `<span class="asp-goal-bar ${pct >= 100 ? 'good' : pct >= 80 ? 'warn' : 'bad'}" title="Aujourd’hui : ${act}${unit ? ' ' + unit : ''}"><i style="width:${pct}%"></i></span><small class="asp-goal-today">aujourd’hui ${act}${unit ? ' ' + unit : ''}${lower ? ' (plus bas = mieux)' : ''}</small>` : '<small class="asp-goal-today dr-muted">pas encore de traitement aujourd’hui</small>'}
      </label>`;
    }).join('');
    return `<section class="asp-goal-card ${pole === 'global' ? 'is-global' : ''}" style="--c:${color}"><header><span class="asp-goal-tag">${sub}</span><h4>${label}</h4><small>${agentsOf(pole).length} agent${agentsOf(pole).length > 1 ? 's' : ''}</small></header>${vals}</section>`;
  };
  box.innerHTML = `<section class="admin-settings-card asp-card">
    <div class="admin-workflow-card-head"><div><span>OBJECTIFS JOURNALIERS</span><h3>Cibles par pôle</h3></div>${adminSettingsStatusBadge('Configuration active', 'good')}</div>
    <p class="admin-settings-copy">Chaque agent est mesuré sur les objectifs de son pôle. Une case vide reprend la valeur par défaut (en grisé). La barre montre où en est le pôle aujourd’hui.</p>
    <div class="asp-goal-grid">${card('global', 'Valeur par défaut', '#64748B', 'TOUS')}${ASP_POLES.map(([k, l, c]) => card(k, l, c, k.toUpperCase())).join('')}</div>
    <div class="admin-settings-actions asp-sticky"><button class="admin-settings-primary" id="asp-goals-save">Enregistrer les objectifs</button><span id="asp-goals-status"></span></div>
  </section>`;
  box.querySelector('#asp-goals-save').onclick = async () => {
    const btn = box.querySelector('#asp-goals-save');
    const read = (pole, key) => box.querySelector(`[data-goal-pole="${pole}"][data-goal-key="${key}"]`)?.value.trim() ?? '';
    const keys = ['count', 'total', 'dmt', 'frt'], payload = {};
    keys.forEach(k => payload[k] = read('global', k));
    payload.poles = Object.fromEntries(['fo', 'bo', 'reconf'].map(p => [p, Object.fromEntries(keys.map(k => [k, read(p, k)]).filter(([, v]) => v !== ''))]));
    btn.disabled = true; aspStatus('asp-goals-status', 'Enregistrement…');
    try {
      const result = await adminSettingsServerAction('updateGoals', payload); const v = result.value || {};
      if (typeof agentGoals !== 'undefined') agentGoals = { count: Number(v.count ?? payload.count), total: Number(v.total ?? payload.total), dmt: Number(v.dmt ?? payload.dmt), frt: Number(v.frt ?? payload.frt) };
      if (typeof poleGoals !== 'undefined') poleGoals = v.poles && typeof v.poles === 'object' ? v.poles : {};
      if (typeof renderGoalInputs === 'function') renderGoalInputs();
      aspStatus('asp-goals-status', 'Objectifs enregistrés.');
      setTimeout(() => aspGoals(box), 900);
    } catch (e) { aspStatus('asp-goals-status', e.message, true); }
    btn.disabled = false;
  };
}

// ======================= TYPES DE TRAITEMENT (rangs) =======================
function aspTypes(box) {
  if (!ASP.types) ASP.types = (typeof customTreatmentTypes !== 'undefined' && customTreatmentTypes.length ? customTreatmentTypes : TREATMENT_TYPES_DEFAULT).slice();
  const list = ASP.types;
  const split = t => { const m = String(t).match(/^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)\s*(.*)$/u); return m ? [m[1], m[2]] : ['📝', String(t)]; };
  box.innerHTML = `<section class="admin-settings-card asp-card">
    <div class="admin-workflow-card-head"><div><span>RÉFÉRENTIEL</span><h3>Types de traitement · rang d’affichage</h3></div>${adminSettingsStatusBadge(`${list.length} types`, 'good')}</div>
    <p class="admin-settings-copy">Glisse une ligne (ou utilise les flèches) pour changer son rang. L’ordre enregistré est celui de la web app et du pop-up de l’extension, dès sa prochaine ouverture.</p>
    <div class="asp-types">
      <ol class="asp-type-list" id="asp-type-list">${list.map((t, i) => { const [emoji, text] = split(t); return `<li draggable="true" data-i="${i}"><span class="asp-grip" aria-hidden="true">⋮⋮</span><b class="asp-rank">${i + 1}</b><span class="asp-type-emoji">${emoji}</span><span class="asp-type-text">${aspEsc(text)}</span>
        <button type="button" data-asp-move="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button><button type="button" data-asp-move="${i}:1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button><button type="button" class="asp-danger" data-asp-remove="${i}" aria-label="Retirer">✕</button></li>`; }).join('')}</ol>
      <aside class="asp-type-preview"><b>Aperçu du pop-up de l’extension</b><div>${list.slice(0, 12).map(t => { const [emoji, text] = split(t); return `<span><i>${emoji}</i>${aspEsc(text)}</span>`; }).join('')}${list.length > 12 ? `<em>+ ${list.length - 12} autres</em>` : ''}</div></aside>
    </div>
    <div class="admin-settings-type-add"><input id="asp-type-input" type="text" maxlength="100" placeholder="Nouveau type (ex. 🛂 Visa)"><button type="button" class="dr-edit-btn" id="asp-type-add">Ajouter en bas</button></div>
    <div class="admin-settings-actions asp-sticky"><button type="button" class="admin-settings-primary" id="asp-types-save" ${ASP.typesDirty ? '' : 'disabled'}>Enregistrer l’ordre et la liste</button><button type="button" class="dr-edit-btn" id="asp-types-reset" ${ASP.typesDirty ? '' : 'disabled'}>Annuler les changements</button><span id="asp-types-status">${ASP.typesDirty ? 'Modifications non enregistrées.' : ''}</span></div>
  </section>`;
  const changed = () => { ASP.typesDirty = true; aspTypes(box); };
  box.querySelectorAll('[data-asp-move]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.aspMove.split(':').map(Number); [list[i], list[i + d]] = [list[i + d], list[i]]; changed(); });
  box.querySelectorAll('[data-asp-remove]').forEach(b => b.onclick = () => { if (list.length <= 1) return; list.splice(Number(b.dataset.aspRemove), 1); changed(); });
  box.querySelector('#asp-type-add').onclick = () => { const input = box.querySelector('#asp-type-input'), v = input.value.trim(); if (!v || list.some(t => t.toLowerCase() === v.toLowerCase())) { aspStatus('asp-types-status', 'Nom vide ou déjà présent.', true); return; } list.push(v); changed(); };
  box.querySelector('#asp-types-reset').onclick = () => { ASP.types = null; ASP.typesDirty = false; aspTypes(box); };
  let from = null;
  box.querySelectorAll('#asp-type-list li').forEach(li => {
    li.addEventListener('dragstart', e => { from = Number(li.dataset.i); li.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => li.classList.remove('is-drag'));
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('is-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('is-over'));
    li.addEventListener('drop', e => { e.preventDefault(); const to = Number(li.dataset.i); if (from === null || from === to) return; const [item] = list.splice(from, 1); list.splice(to, 0, item); from = null; changed(); });
  });
  box.querySelector('#asp-types-save').onclick = async () => {
    const btn = box.querySelector('#asp-types-save'); btn.disabled = true; aspStatus('asp-types-status', 'Enregistrement…');
    try {
      const r = await adminSettingsServerAction('saveTreatmentTypes', { list });
      customTreatmentTypes = (r.value || list).slice(); adminSettingsDraftTypes = customTreatmentTypes.slice();
      ASP.types = null; ASP.typesDirty = false;
      if (typeof populateFilters === 'function') populateFilters();
      aspTypes(box); aspStatus('asp-types-status', 'Enregistré : la web app et l’extension suivent ce nouvel ordre.');
    } catch (e) { aspStatus('asp-types-status', e.message, true); btn.disabled = false; }
  };
}

// ======================= TEAM'S SHIFT (3 vues) =======================
function aspShiftOf(u) { const s = typeof agentSessionsShift === 'function' ? agentSessionsShift(u) : null; return s && s.start !== undefined ? s : null; }
function aspHm(min) { const m = ((min % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function aspDayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function aspParseDay(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
// Règle de travail par défaut tant que le module Planning n'existe pas : du lundi au samedi, repos le dimanche.
function aspWorks(date) { return date.getDay() !== 0; }
function aspShiftPeople() {
  return (TEAM || []).filter(u => u.role === 'agent' && (ASP.shiftPole === 'all' || u.pole === ASP.shiftPole) && (ASP.shiftAgent === 'all' || u.id === ASP.shiftAgent))
    .sort((a, b) => (aspShiftOf(a)?.start ?? 9999) - (aspShiftOf(b)?.start ?? 9999) || String(a.name).localeCompare(String(b.name), 'fr'));
}
function aspShifts(box) {
  const tabs = [['agent', 'Par agent', 'modifier les horaires'], ['pole', 'Par pôle', 'planning de chaque pôle'], ['calendar', 'Emploi du temps', 'jour · semaine · mois']];
  box.innerHTML = `<section class="admin-settings-card asp-card">
    <div class="admin-workflow-card-head"><div><span>TEAM’S SHIFT</span><h3>Horaires de l’équipe</h3></div>${adminSettingsStatusBadge(`${(TEAM || []).filter(u => u.role === 'agent').length} agents`, 'good')}</div>
    <div class="asp-tabs" role="tablist">${tabs.map(([k, l, s]) => `<button type="button" role="tab" aria-selected="${ASP.shiftView === k}" class="${ASP.shiftView === k ? 'active' : ''}" data-asp-shift-view="${k}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>
    <div id="asp-shift-body"></div>
  </section>`;
  box.querySelectorAll('[data-asp-shift-view]').forEach(b => b.onclick = () => { ASP.shiftView = b.dataset.aspShiftView; aspShifts(box); });
  const body = box.querySelector('#asp-shift-body');
  ({ agent: aspShiftByAgent, pole: aspShiftByPole, calendar: aspShiftCalendar })[ASP.shiftView](body, box);
}
function aspShiftFilters(withAgent = true, withSpan = false) {
  const agents = (TEAM || []).filter(u => u.role === 'agent' && (ASP.shiftPole === 'all' || u.pole === ASP.shiftPole));
  return `<div class="asp-toolbar">
    <select class="form-input" data-asp-sf="shiftPole">${[['all', 'Tous les pôles'], ...ASP_POLES.map(([k, l]) => [k, l])].map(([v, l]) => `<option value="${v}" ${ASP.shiftPole === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${withAgent ? `<select class="form-input" data-asp-sf="shiftAgent"><option value="all">Tous les agents</option>${agents.map(a => `<option value="${a.id}" ${ASP.shiftAgent === a.id ? 'selected' : ''}>${aspEsc(a.name)}</option>`).join('')}</select>` : ''}
    ${withSpan ? `<div class="aq-poles">${[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, l]) => `<button type="button" class="${ASP.shiftSpan === k ? 'active' : ''}" data-asp-span="${k}">${l}</button>`).join('')}</div>
      <span class="asp-nav"><button type="button" class="dr-icon-btn" data-asp-nav="-1" aria-label="Précédent">‹</button><input type="date" class="form-input" data-asp-date value="${ASP.shiftDate}"><button type="button" class="dr-icon-btn" data-asp-nav="1" aria-label="Suivant">›</button><button type="button" class="dr-edit-btn" data-asp-nav="0">Aujourd’hui</button></span>` : ''}
  </div>`;
}
function aspBindFilters(el, box) {
  el.querySelectorAll('[data-asp-sf]').forEach(s => s.onchange = () => { ASP[s.dataset.aspSf] = s.value; if (s.dataset.aspSf === 'shiftPole') ASP.shiftAgent = 'all'; aspShifts(box); });
  el.querySelectorAll('[data-asp-span]').forEach(b => b.onclick = () => { ASP.shiftSpan = b.dataset.aspSpan; aspShifts(box); });
  el.querySelector('[data-asp-date]')?.addEventListener('change', e => { if (e.target.value) { ASP.shiftDate = e.target.value; aspShifts(box); } });
  el.querySelectorAll('[data-asp-nav]').forEach(b => b.onclick = () => {
    const step = Number(b.dataset.aspNav), d = aspParseDay(ASP.shiftDate);
    if (!step) ASP.shiftDate = aspDayKey(new Date());
    else { if (ASP.shiftSpan === 'day') d.setDate(d.getDate() + step); else if (ASP.shiftSpan === 'week') d.setDate(d.getDate() + 7 * step); else d.setMonth(d.getMonth() + step); ASP.shiftDate = aspDayKey(d); }
    aspShifts(box);
  });
}
// Vue 1 : par agent — saisie des horaires avec deux champs heure (début / fin).
function aspShiftByAgent(el, box) {
  const people = aspShiftPeople();
  el.innerHTML = aspShiftFilters(true) + `<div class="asp-shift-rows">${people.map(u => { const s = aspShiftOf(u); const pole = ASP_POLES.find(p => p[0] === u.pole); return `<div class="asp-shift-row" style="--c:${pole?.[2] || '#64748B'}">
      <span class="mini-avatar" style="background:${safeColor(u.color)}20;color:${safeColor(u.color)}">${aspEsc(u.initials || '??')}</span>
      <span class="asp-shift-who"><strong>${aspEsc(u.name)}</strong><small>${pole ? pole[1] : 'Sans pôle'}${s ? ` · ${Math.round(((s.end - s.start + 1440) % 1440 || 1440) / 60 * 10) / 10} h` : ''}</small></span>
      <label>Début<input type="time" class="form-input" data-asp-start="${aspEsc(u.id)}" value="${s ? aspHm(s.start) : ''}"></label>
      <label>Fin<input type="time" class="form-input" data-asp-end="${aspEsc(u.id)}" value="${s ? aspHm(s.end) : ''}"></label>
      <span class="asp-mini-bar" title="${s ? `${aspHm(s.start)} → ${aspHm(s.end)}` : 'Non configuré'}">${s ? aspBar(s) : ''}</span>
      <button type="button" class="admin-settings-account-save" data-asp-shift-save="${aspEsc(u.id)}">Enregistrer</button>
    </div>`; }).join('') || '<p class="admin-workflow-empty">Aucun agent pour ce filtre.</p>'}</div>
    <p class="admin-settings-copy">Les horaires alimentent le statut « Attente flux / Hors shift », l’écart d’arrivée dans les Connexions et l’emploi du temps.</p>`;
  aspBindFilters(el, box);
  el.querySelectorAll('[data-asp-shift-save]').forEach(b => b.onclick = async () => {
    const uid = b.dataset.aspShiftSave, start = el.querySelector(`[data-asp-start="${uid}"]`).value, end = el.querySelector(`[data-asp-end="${uid}"]`).value;
    if (!start || !end) { alert('Renseigne une heure de début et de fin.'); return; }
    b.disabled = true;
    try { const shift = `${start}-${end}`; await adminSettingsServerAction('updateShift', { uid, shift }); const u = (TEAM || []).find(t => t.id === uid); if (u) u.shift = shift; b.textContent = '✓ Enregistré'; setTimeout(() => aspShifts(box), 700); }
    catch (e) { alert(e.message); b.disabled = false; }
  });
}
function aspBar(s, from = 0, to = 1440) {
  const span = to - from, seg = (a, b) => `<i style="left:${(a - from) / span * 100}%;width:${(b - a) / span * 100}%"></i>`;
  return s.end > s.start ? seg(Math.max(from, s.start), Math.min(to, s.end)) : seg(Math.max(from, s.start), to) + seg(from, Math.min(to, s.end));
}
// Vue 2 : par pôle — barres 0 h → 24 h et couverture heure par heure.
function aspShiftByPole(el, box) {
  const scale = `<div class="asp-scale">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${h / 24 * 100}%">${h}h</span>`).join('')}</div>`;
  const cols = ASP_POLES.filter(([k]) => ASP.shiftPole === 'all' || ASP.shiftPole === k).map(([k, label, color]) => {
    const people = (TEAM || []).filter(u => u.role === 'agent' && u.pole === k);
    const withShift = people.map(u => ({ u, s: aspShiftOf(u) }));
    const cover = Array.from({ length: 24 }, (_, h) => withShift.filter(({ s }) => s && (s.end > s.start ? h * 60 >= s.start && h * 60 < s.end : h * 60 >= s.start || h * 60 < s.end)).length);
    const max = Math.max(1, ...cover);
    const known = withShift.filter(x => x.s);
    const first = known.length ? Math.min(...known.map(x => x.s.start)) : null, last = known.length ? Math.max(...known.map(x => x.s.end > x.s.start ? x.s.end : x.s.end + 1440)) : null;
    return `<section class="asp-pole" style="--c:${color}"><header><span class="tp-tag">${k.toUpperCase()}</span><h4>${label}</h4><small>${people.length} agent${people.length > 1 ? 's' : ''}${first !== null ? ` · ${aspHm(first)} → ${aspHm(last)}` : ''}</small></header>
      ${scale}<div class="asp-gantt">${withShift.sort((a, b) => (a.s?.start ?? 9999) - (b.s?.start ?? 9999)).map(({ u, s }) => `<div class="asp-gantt-row"><span>${aspEsc(u.name)}</span><div class="asp-track">${s ? aspBar(s) : '<em>non configuré</em>'}</div><small>${s ? `${aspHm(s.start)}–${aspHm(s.end)}` : '—'}</small></div>`).join('') || '<p class="tp-empty">Aucun agent.</p>'}</div>
      <div class="asp-cover" title="Nombre d’agents en shift, heure par heure">${cover.map((n, h) => `<i style="height:${n / max * 100}%" title="${h}h : ${n} agent${n > 1 ? 's' : ''}"></i>`).join('')}</div>
      <small class="asp-cover-label">Couverture heure par heure · maximum ${Math.max(...cover)} agent${Math.max(...cover) > 1 ? 's' : ''}${cover.slice(7, 22).some(n => !n) ? ' · <b class="asp-warn">créneaux sans personne entre 7 h et 22 h</b>' : ''}</small>
    </section>`;
  }).join('');
  el.innerHTML = aspShiftFilters(false) + `<div class="asp-poles">${cols}</div>`;
  aspBindFilters(el, box);
}
// Vue 3 : emploi du temps — jour (Gantt + couverture), semaine (agents × jours), mois (calendrier de couverture).
function aspShiftCalendar(el, box) {
  if (!ASP.shiftDate) ASP.shiftDate = aspDayKey(new Date());
  const people = aspShiftPeople(), ref = aspParseDay(ASP.shiftDate), todayKey = aspDayKey(new Date());
  const poleColor = u => ASP_POLES.find(p => p[0] === u.pole)?.[2] || '#64748B';
  let html = '';
  if (ASP.shiftSpan === 'day') {
    const works = aspWorks(ref), from = 6 * 60, to = 24 * 60;
    const nowMin = aspDayKey(new Date()) === ASP.shiftDate ? new Date().getHours() * 60 + new Date().getMinutes() : null;
    const cover = Array.from({ length: 18 }, (_, i) => { const h = 6 + i; return works ? people.filter(u => { const s = aspShiftOf(u); return s && (s.end > s.start ? h * 60 >= s.start && h * 60 < s.end : h * 60 >= s.start || h * 60 < s.end); }).length : 0; });
    const max = Math.max(1, ...cover);
    html = `<h4 class="asp-cal-title">${ref.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${works ? '' : ' · repos (dimanche)'}</h4>
      <div class="asp-day"><div class="asp-day-scale"><span></span><div>${Array.from({ length: 10 }, (_, i) => `<span style="left:${i * 2 / 18 * 100}%">${6 + i * 2}h</span>`).join('')}</div></div>
      ${people.map(u => { const s = aspShiftOf(u); return `<div class="asp-day-row"><span><b>${aspEsc(u.name)}</b><small>${u.pole ? u.pole.toUpperCase() : '—'}</small></span><div class="asp-track" style="--c:${poleColor(u)}">${works && s ? aspBar(s, from, to) : `<em>${works ? 'non configuré' : 'repos'}</em>`}${nowMin !== null && nowMin >= from ? `<b class="asp-now" style="left:${(nowMin - from) / (to - from) * 100}%"></b>` : ''}</div></div>`; }).join('') || '<p class="admin-workflow-empty">Aucun agent pour ce filtre.</p>'}
      <div class="asp-day-row asp-day-cover"><span><b>Couverture</b><small>agents en shift</small></span><div class="asp-cover">${cover.map((n, i) => `<i style="height:${n / max * 100}%" title="${6 + i}h : ${n}"><em>${n || ''}</em></i>`).join('')}</div></div></div>`;
  } else if (ASP.shiftSpan === 'week') {
    const monday = new Date(ref); monday.setDate(ref.getDate() - (ref.getDay() + 6) % 7);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
    html = `<h4 class="asp-cal-title">Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</h4>
      <div class="asp-week-wrap"><table class="asp-week"><thead><tr><th>Agent</th>${days.map(d => `<th class="${aspDayKey(d) === todayKey ? 'is-today' : ''}">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '')}</th>`).join('')}<th>Heures</th></tr></thead>
      <tbody>${people.map(u => { const s = aspShiftOf(u); const len = s ? ((s.end - s.start + 1440) % 1440 || 1440) / 60 : 0; const n = days.filter(aspWorks).length; return `<tr><th><span class="asp-dot" style="background:${poleColor(u)}"></span>${aspEsc(u.name)}</th>${days.map(d => `<td class="${aspDayKey(d) === todayKey ? 'is-today' : ''}">${aspWorks(d) ? (s ? `<span class="asp-chip" style="--c:${poleColor(u)}">${aspHm(s.start)}–${aspHm(s.end)}</span>` : '<span class="dr-muted">?</span>') : '<span class="asp-off">repos</span>'}</td>`).join('')}<td><b>${s ? Math.round(len * n * 10) / 10 + ' h' : '—'}</b></td></tr>`; }).join('') || `<tr><td colspan="9" class="admin-workflow-empty">Aucun agent pour ce filtre.</td></tr>`}</tbody>
      <tfoot><tr><th>Agents planifiés</th>${days.map(d => `<td>${aspWorks(d) ? people.filter(aspShiftOf).length : 0}</td>`).join('')}<td></td></tr></tfoot></table></div>`;
  } else {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1), start = new Date(first); start.setDate(1 - (first.getDay() + 6) % 7);
    const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const per = d => ASP_POLES.map(([k, , c]) => [k, c, aspWorks(d) ? people.filter(u => u.pole === k && aspShiftOf(u)).length : 0]);
    html = `<h4 class="asp-cal-title">${ref.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h4>
      <div class="asp-month"><div class="asp-month-head">${['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="asp-month-grid">${cells.map(d => `<button type="button" class="asp-mday ${d.getMonth() !== ref.getMonth() ? 'is-out' : ''} ${aspDayKey(d) === todayKey ? 'is-today' : ''} ${aspWorks(d) ? '' : 'is-off'}" data-asp-day="${aspDayKey(d)}"><b>${d.getDate()}</b>${aspWorks(d) ? per(d).filter(([, , n]) => n).map(([k, c, n]) => `<span style="--c:${c}">${k.toUpperCase()} ${n}</span>`).join('') : '<em>repos</em>'}</button>`).join('')}</div></div>`;
  }
  el.innerHTML = aspShiftFilters(true, true) + html + '<p class="admin-settings-copy">Règle actuelle : chaque agent travaille du lundi au samedi selon son shift, repos le dimanche. Les congés et rotations arriveront avec le module Planning.</p>';
  aspBindFilters(el, box);
  el.querySelectorAll('[data-asp-day]').forEach(b => b.onclick = () => { ASP.shiftDate = b.dataset.aspDay; ASP.shiftSpan = 'day'; aspShifts(box); });
}
