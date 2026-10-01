// ======================= SIGNALER UNE DIFFICULTÉ (Agent) =======================
// L'agent remonte lui-même un blocage pendant son shift. Le signalement devient un cas complexe
// « nouveau » (complex_cases, règle d'accès de la migration 013) que le superviseur qualifie
// ensuite : priorité, échéance, suivi. L'agent voit l'état de ses derniers signalements.

const AGENT_DIFFICULTY_TYPES = [
  ['process', 'Difficulté process', 'Procédure floue, manquante ou contradictoire'],
  ['situational', 'Blocage situationnel', 'Client, fournisseur ou outil qui bloque le dossier'],
  ['collaboration', 'Collaboration', 'Passation, entraide ou coordination avec l’équipe'],
  ['unhandled_escalation', 'Escalade manager non traitée', 'Escalade restée sans réponse'],
];
const AGENT_CASE_STATUS = { nouveau: 'Reçu', en_cours: 'En cours', attente_client: 'Attente client', resolu: 'Résolu' };
let agentDifficulty = { busy: false };

function agentDifficultyEl(id) { return document.getElementById(id); }

async function openAgentDifficulty() {
  if (currentUser?.role !== 'agent') return;
  agentDifficulty = { busy: false };
  let overlay = agentDifficultyEl('agent-difficulty-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'agent-difficulty-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAgentDifficulty(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal agent-difficulty-modal" role="dialog" aria-modal="true" aria-labelledby="agent-difficulty-title">
    <div class="modal-header"><div class="modal-title" id="agent-difficulty-title">Signaler une difficulté</div>
    <button class="modal-close" type="button" onclick="closeAgentDifficulty()" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <div class="agent-difficulty-label">Type de difficulté</div>
      <div class="agent-difficulty-types">${AGENT_DIFFICULTY_TYPES.map(([key, label, help], i) => `
        <label class="agent-difficulty-type"><input type="radio" name="agent-difficulty-type" value="${key}" ${i === 0 ? 'checked' : ''}><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}
      </div>
      <div class="form-row"><label class="form-label" for="agent-difficulty-subject">En une phrase</label>
        <input class="form-input" id="agent-difficulty-subject" maxlength="140" placeholder="ex. Fournisseur injoignable pour le transfert du client"></div>
      <div class="form-row agent-difficulty-grid">
        <div><label class="form-label" for="agent-difficulty-ref">Dossier / ticket (optionnel)</label><input class="form-input" id="agent-difficulty-ref" maxlength="60" placeholder="#104890"></div>
        <div><label class="form-label" for="agent-difficulty-channel">Canal</label>
          <select class="form-input" id="agent-difficulty-channel"><option value="inbound">Appel entrant</option><option value="outbound">Appel sortant</option><option value="chat">Chat</option><option value="email">Email</option><option value="ticket" selected>Ticket / Manuel</option></select></div>
      </div>
      <div class="form-row"><label class="form-label" for="agent-difficulty-details">Détails (ce que tu as déjà essayé)</label>
        <textarea class="form-input" id="agent-difficulty-details" rows="3" maxlength="1500"></textarea></div>
      <div class="agent-difficulty-status" id="agent-difficulty-status" role="status"></div>
      <div class="agent-difficulty-label">Mes derniers signalements</div>
      <div class="agent-difficulty-history" id="agent-difficulty-history">Chargement…</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" type="button" onclick="closeAgentDifficulty()">Annuler</button>
      <button class="btn btn-primary" type="button" id="agent-difficulty-submit" onclick="submitAgentDifficulty()">Envoyer au superviseur</button></div>
  </div>`;
  overlay.classList.remove('hidden');
  agentDifficultyEl('agent-difficulty-subject').focus();
  agentDifficultyEl('agent-difficulty-subject').addEventListener('input', () => { const st = agentDifficultyEl('agent-difficulty-status'); if (!st.classList.contains('is-ok')) st.textContent = ''; });
  loadAgentDifficultyHistory();
}

function closeAgentDifficulty() { agentDifficultyEl('agent-difficulty-overlay')?.classList.add('hidden'); }

async function loadAgentDifficultyHistory() {
  const box = agentDifficultyEl('agent-difficulty-history');
  if (!box) return;
  try {
    const rows = await dispatchRest(`complex_cases?select=id,title,status,data,created_at&agent_id=eq.${currentUser.id}&order=created_at.desc&limit=5`);
    const mine = rows.filter(r => r.data?.reportedBy === currentUser.id);
    box.innerHTML = mine.length ? mine.map(r => {
      const type = AGENT_DIFFICULTY_TYPES.find(t => t[0] === r.data?.difficulty)?.[1] || 'Autre';
      return `<div class="agent-difficulty-item"><span><strong>${escHtml(r.title)}</strong><small>${escHtml(type)} · ${new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small></span><em class="is-${escHtml(r.status)}">${AGENT_CASE_STATUS[r.status] || escHtml(r.status)}</em></div>`;
    }).join('') : '<span class="agent-difficulty-empty">Aucun signalement pour l’instant.</span>';
  } catch (e) {
    box.innerHTML = `<span class="agent-difficulty-empty">Historique indisponible : ${escHtml(e.message)}</span>`;
  }
}

async function submitAgentDifficulty() {
  if (agentDifficulty.busy) return;
  const status = agentDifficultyEl('agent-difficulty-status');
  const subject = agentDifficultyEl('agent-difficulty-subject').value.trim();
  if (subject.length < 5) { status.textContent = 'Décris la difficulté en une phrase.'; agentDifficultyEl('agent-difficulty-subject').focus(); return; }
  const difficulty = document.querySelector('input[name="agent-difficulty-type"]:checked')?.value || 'process';
  const ref = agentDifficultyEl('agent-difficulty-ref').value.trim();
  const details = agentDifficultyEl('agent-difficulty-details').value.trim();
  const channel = agentDifficultyEl('agent-difficulty-channel').value;
  const title = ref ? `${ref} — ${subject}` : subject;
  agentDifficulty.busy = true;
  agentDifficultyEl('agent-difficulty-submit').disabled = true;
  status.textContent = 'Envoi…';
  try {
    const now = Date.now();
    const rows = await dispatchRest('complex_cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        agent_id: currentUser.id, owner_id: currentUser.id, status: 'nouveau', priority: 'medium',
        title, description: details,
        data: { title, description: details, agentId: currentUser.id, channel, difficulty, ref, reportedBy: currentUser.id, status: 'nouveau', priority: 'medium', createdAt: now, createdBy: currentUser.id, updates: [] },
      }),
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('signalement refusé');
    status.classList.add('is-ok');
    status.textContent = 'Signalement envoyé : ton superviseur le voit dans « Cas complexes ».';
    agentDifficultyEl('agent-difficulty-subject').value = '';
    agentDifficultyEl('agent-difficulty-ref').value = '';
    agentDifficultyEl('agent-difficulty-details').value = '';
    loadAgentDifficultyHistory();
  } catch (e) {
    status.classList.remove('is-ok');
    status.textContent = `Signalement non envoyé : ${e.message}`;
  }
  agentDifficulty.busy = false;
  agentDifficultyEl('agent-difficulty-submit').disabled = false;
}
