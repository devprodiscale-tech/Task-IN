// ======================= EFFACER LES DONNÉES D'UN AGENT (Admin) =======================
// Ouvert depuis Paramètres › Comptes équipe et depuis la fenêtre « Modifier le compte ».
// Le compte est conservé : seules les données choisies sont effacées, côté serveur
// (api/admin-settings.js, action purgeAgentData), après un aperçu du nombre de lignes
// et la saisie du nom de l'agent pour confirmer.

const AGENT_PURGE_SCOPES = [
  ['entries', 'Tâches et temps de traitement', 'Historique des tâches (tableau, statistiques, classement).'],
  ['timer', 'Timer en cours', 'Arrête et supprime le timer actif éventuel.'],
  ['sessions', 'Journal des connexions', 'Connexions et déconnexions enregistrées.'],
  ['quality', 'Qualité', 'Grilles d’écoute, fiches de coaching et cas complexes liés à l’agent.'],
  ['training', 'Formation', 'Progression des parcours et accusés de lecture.'],
];
let agentPurgeState = null;

function agentPurgeEl(id) { return document.getElementById(id); }

function openAgentPurgeModal(agentId) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const agent = (TEAM || []).find(u => u.id === agentId);
  if (!agent) return;
  agentPurgeState = { agent, preview: null, busy: false };
  let overlay = agentPurgeEl('agent-purge-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'agent-purge-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAgentPurgeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal agent-purge-modal" role="dialog" aria-modal="true" aria-labelledby="agent-purge-title">
    <div class="modal-header">
      <div class="modal-title" id="agent-purge-title">Effacer les données — ${escHtml(agent.name)}</div>
      <button class="modal-close" type="button" onclick="closeAgentPurgeModal()" aria-label="Fermer">×</button>
    </div>
    <div class="modal-body">
      <p class="agent-purge-intro">Le compte de <strong>${escHtml(agent.name)}</strong> est conservé : seules les données cochées sont effacées. Cette action est irréversible.</p>
      <div class="agent-purge-label">Données à effacer</div>
      <div class="agent-purge-scopes">${AGENT_PURGE_SCOPES.map(([key, label, help]) => `
        <label class="agent-purge-scope"><input type="checkbox" value="${key}" ${key === 'entries' || key === 'timer' ? 'checked' : ''}>
          <span><strong>${label}</strong><small>${help}</small></span><em data-purge-count="${key}"></em></label>`).join('')}
      </div>
      <div class="agent-purge-label">Période</div>
      <div class="agent-purge-modes">
        <label><input type="radio" name="agent-purge-mode" value="all" checked> Tout l’historique</label>
        <label><input type="radio" name="agent-purge-mode" value="before"> Avant le <input type="date" id="agent-purge-before" class="form-input"></label>
        <label><input type="radio" name="agent-purge-mode" value="demo"> Données de démonstration uniquement</label>
      </div>
      <div class="agent-purge-preview" id="agent-purge-preview">Calcul du nombre de lignes…</div>
      <label class="agent-purge-confirm">Pour confirmer, saisis le nom de l’agent : <b>${escHtml(agent.name)}</b>
        <input class="form-input" id="agent-purge-confirm-input" autocomplete="off" placeholder="${escHtml(agent.name)}">
      </label>
      <div class="agent-purge-status" id="agent-purge-status" role="status"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" type="button" onclick="closeAgentPurgeModal()">Annuler</button>
      <button class="btn agent-purge-danger" type="button" id="agent-purge-submit" disabled onclick="runAgentPurge()">Effacer les données</button>
    </div>
  </div>`;
  overlay.classList.remove('hidden');
  overlay.querySelectorAll('.agent-purge-scopes input, input[name="agent-purge-mode"]').forEach(input => input.addEventListener('change', agentPurgePreview));
  agentPurgeEl('agent-purge-before').addEventListener('change', () => {
    overlay.querySelector('input[name="agent-purge-mode"][value="before"]').checked = true;
    agentPurgePreview();
  });
  agentPurgeEl('agent-purge-confirm-input').addEventListener('input', agentPurgeRefreshButton);
  agentPurgePreview();
}

function closeAgentPurgeModal() {
  agentPurgeEl('agent-purge-overlay')?.classList.add('hidden');
  agentPurgeState = null;
}

function agentPurgeRequest(dryRun) {
  const overlay = agentPurgeEl('agent-purge-overlay');
  const scopes = [...overlay.querySelectorAll('.agent-purge-scopes input:checked')].map(i => i.value);
  const mode = overlay.querySelector('input[name="agent-purge-mode"]:checked')?.value || 'all';
  const beforeValue = agentPurgeEl('agent-purge-before').value;
  // « Avant le JJ/MM » = avant minuit (heure locale) de ce jour-là.
  const before = beforeValue ? new Date(`${beforeValue}T00:00:00`).toISOString() : '';
  return { uid: agentPurgeState.agent.id, scopes, mode, before, dryRun };
}

let agentPurgePreviewSeq = 0;
async function agentPurgePreview() {
  if (!agentPurgeState) return;
  const payload = agentPurgeRequest(true);
  const preview = agentPurgeEl('agent-purge-preview');
  agentPurgeState.preview = null;
  agentPurgeRefreshButton();
  document.querySelectorAll('[data-purge-count]').forEach(el => { el.textContent = ''; });
  if (!payload.scopes.length) { preview.textContent = 'Coche au moins un type de données.'; return; }
  if (payload.mode === 'before' && !payload.before) { preview.textContent = 'Choisis la date limite.'; return; }
  const seq = ++agentPurgePreviewSeq;
  preview.textContent = 'Calcul du nombre de lignes…';
  try {
    const result = await adminSettingsServerAction('purgeAgentData', payload);
    if (seq !== agentPurgePreviewSeq || !agentPurgeState) return; // réponse périmée
    Object.entries(result.counts || {}).forEach(([key, n]) => { const el = document.querySelector(`[data-purge-count="${key}"]`); if (el) el.textContent = n; });
    agentPurgeState.preview = result;
    preview.innerHTML = result.total
      ? `<strong>${result.total}</strong> ligne(s) seront effacées.`
      : 'Aucune donnée ne correspond à ce choix.';
  } catch (error) {
    if (seq !== agentPurgePreviewSeq) return;
    preview.textContent = `Aperçu impossible : ${error.message}`;
  }
  agentPurgeRefreshButton();
}

function agentPurgeRefreshButton() {
  const button = agentPurgeEl('agent-purge-submit');
  if (!button || !agentPurgeState) return;
  const typed = (agentPurgeEl('agent-purge-confirm-input')?.value || '').trim().toLowerCase();
  const nameOk = typed && typed === String(agentPurgeState.agent.name || '').trim().toLowerCase();
  button.disabled = agentPurgeState.busy || !nameOk || !agentPurgeState.preview?.total;
}

async function runAgentPurge() {
  if (!agentPurgeState || agentPurgeState.busy) return;
  const payload = agentPurgeRequest(false);
  const status = agentPurgeEl('agent-purge-status');
  agentPurgeState.busy = true;
  agentPurgeRefreshButton();
  status.className = 'agent-purge-status';
  status.textContent = 'Effacement en cours…';
  try {
    const result = await adminSettingsServerAction('purgeAgentData', payload);
    status.classList.add('ok');
    status.textContent = `${result.total} ligne(s) effacée(s).`;
    // Relecture des données pour que tous les écrans reflètent l'effacement.
    if (payload.scopes.includes('entries') && typeof loadEntries === 'function') await loadEntries(false);
    if (typeof invalidateFilterCache === 'function') invalidateFilterCache();
    if (typeof fetchPermanentLiveAgents === 'function') fetchPermanentLiveAgents();
    if (typeof renderCurrentView === 'function') renderCurrentView();
    setTimeout(closeAgentPurgeModal, 1200);
  } catch (error) {
    status.classList.add('error');
    status.textContent = `Effacement impossible : ${error.message}`;
    agentPurgeState.busy = false;
    agentPurgeRefreshButton();
  }
}
