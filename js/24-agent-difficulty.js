// ======================= TICKETS DE RETOUR AGENTS =======================
// L'agent remonte un ticket, un appel ou une situation qui le bloque. Formulaire guidé : sur quoi,
// type de difficulté, références (ticket OSC, dossier, n° de comm), lien vers l'outil client,
// description en 3 questions, urgence ressentie, captures. Le signalement devient un cas complexe
// « nouveau » (complex_cases, migration 013) que le superviseur qualifie et suit.
// Pas de doublon : si la référence est déjà signalée (par n'importe quel agent) et non résolue,
// l'agent commente le ticket existant (fonction taskin_case_comment, migration 021).
// L'agent suit ses tickets (et ceux qu'il a commentés) et répond aux commentaires du superviseur.

const AGENT_TICKET_OBJECTS = [
  ['ticket', 'Ticket OSC', 'Un ticket client précis'],
  ['call', 'Appel', 'Un appel entrant ou sortant'],
  ['message', 'E-mail / chat', 'Une conversation Crisp, WATI ou un e-mail'],
  ['situation', 'Situation générale', 'Process, outil, organisation… sans dossier précis'],
];
const AGENT_DIFFICULTY_TYPES = [
  ['process', 'Difficulté process', 'Procédure floue, manquante ou contradictoire'],
  ['situational', 'Blocage situationnel', 'Client, fournisseur ou outil qui bloque le dossier'],
  ['collaboration', 'Collaboration', 'Passation, entraide ou coordination avec l’équipe'],
  ['unhandled_escalation', 'Escalade manager non traitée', 'Escalade restée sans réponse'],
  ['other', 'Autre', 'Ne rentre dans aucune case'],
];
const AGENT_TICKET_URGENCY = [
  ['low', 'Peut attendre', 'à voir dans la journée'],
  ['medium', 'Bloque le dossier', 'à traiter aujourd’hui'],
  ['high', 'Client en attente', 'il faut une réponse maintenant'],
];
const AGENT_CASE_STATUS = { nouveau: 'Reçu', en_cours: 'En cours', attente_client: 'Attente client', resolu: 'Résolu' };
const AGENT_TICKET_CHANNEL = { ticket: 'ticket', call: 'inbound', message: 'chat', situation: 'ticket' };
const AGENT_TICKET_MAX_SHOTS = 3;
let agentDifficulty = { busy: false, shots: [], dup: null, dupTimer: 0, override: false, mine: [] };

function agentDifficultyEl(id) { return document.getElementById(id); }
// « #OSC-104 890 » → « OSC-104890 » : même clé quelle que soit la saisie.
function agentTicketKey(value) { return String(value || '').toUpperCase().replace(/^#/, '').replace(/[^A-Z0-9-]/g, ''); }
// Numéro de ticket tiré d'un lien collé (dernier groupe d'au moins 4 chiffres).
function agentTicketFromLink(link) { const m = String(link || '').match(/(\d{4,})(?!.*\d{4,})/); return m ? m[1] : ''; }
function agentTicketRadio(name, list, checked) {
  return list.map(([key, label, help]) => `<label class="agent-difficulty-type"><input type="radio" name="${name}" value="${key}" ${key === checked ? 'checked' : ''}><span><strong>${label}</strong><small>${help}</small></span></label>`).join('');
}

async function openAgentDifficulty() {
  if (currentUser?.role !== 'agent') return;
  agentDifficulty = { busy: false, shots: [], dup: null, dupTimer: 0, override: false, mine: [] };
  let overlay = agentDifficultyEl('agent-difficulty-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'agent-difficulty-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAgentDifficulty(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal agent-difficulty-modal" role="dialog" aria-modal="true" aria-labelledby="agent-difficulty-title">
    <div class="modal-header"><div class="modal-title" id="agent-difficulty-title">Remonter un ticket ou une difficulté</div>
    <button class="modal-close" type="button" onclick="closeAgentDifficulty()" aria-label="Fermer">×</button></div>
    <div class="modal-body">
      <div class="agent-difficulty-tabs" role="tablist">
        <button type="button" class="active" data-at-tab="new" onclick="agentTicketTab('new')">Nouveau signalement</button>
        <button type="button" data-at-tab="mine" onclick="agentTicketTab('mine')">Mes tickets <b id="agent-ticket-count"></b></button>
      </div>
      <div id="agent-ticket-new">
        <div class="agent-difficulty-label"><span>1</span>Sur quoi ?</div>
        <div class="agent-difficulty-types agent-ticket-objects">${agentTicketRadio('agent-ticket-object', AGENT_TICKET_OBJECTS, 'ticket')}</div>
        <div class="agent-difficulty-label"><span>2</span>Références</div>
        <div class="form-row agent-difficulty-grid" id="agent-ticket-refs">
          <div data-ref-for="ticket call message"><label class="form-label" for="agent-ticket-ref" id="agent-ticket-ref-label">N° de ticket OSC</label><input class="form-input" id="agent-ticket-ref" maxlength="60" placeholder="#104890" autocomplete="off"></div>
          <div data-ref-for="ticket call message"><label class="form-label" for="agent-ticket-booking">Réf. dossier / réservation</label><input class="form-input" id="agent-ticket-booking" maxlength="60" placeholder="ex. ONS-58213" autocomplete="off"></div>
          <div class="agent-ticket-wide" data-ref-for="ticket call message situation"><label class="form-label" for="agent-ticket-link">Lien vers l’outil client <small>(OSC, Crisp, Ringover… optionnel)</small></label><input class="form-input" id="agent-ticket-link" type="url" maxlength="500" placeholder="https://…" autocomplete="off"></div>
        </div>
        <div class="agent-ticket-dup" id="agent-ticket-dup" hidden></div>
        <div id="agent-ticket-rest">
          <div class="agent-difficulty-label"><span>3</span>Type de difficulté</div>
          <div class="agent-difficulty-types">${agentTicketRadio('agent-difficulty-type', AGENT_DIFFICULTY_TYPES, 'situational')}</div>
          <div class="agent-difficulty-label"><span>4</span>Le problème</div>
          <div class="form-row"><label class="form-label" for="agent-difficulty-subject">En une phrase</label>
            <input class="form-input" id="agent-difficulty-subject" maxlength="140" placeholder="ex. Fournisseur injoignable pour le transfert du client"></div>
          <div class="form-row"><label class="form-label" for="agent-ticket-what">Que se passe-t-il ? <small>faits, dates, montants, ce que dit le client</small></label><textarea class="form-input" id="agent-ticket-what" rows="3" maxlength="1500"></textarea></div>
          <div class="form-row agent-difficulty-grid">
            <div><label class="form-label" for="agent-ticket-tried">Qu’as-tu déjà essayé ?</label><textarea class="form-input" id="agent-ticket-tried" rows="2" maxlength="800"></textarea></div>
            <div><label class="form-label" for="agent-ticket-need">De quoi as-tu besoin ?</label><textarea class="form-input" id="agent-ticket-need" rows="2" maxlength="800" placeholder="décision, info, escalade, rappel du client…"></textarea></div>
          </div>
          <div class="agent-difficulty-label"><span>5</span>Urgence</div>
          <div class="agent-difficulty-types agent-ticket-urgency">${agentTicketRadio('agent-ticket-urgency', AGENT_TICKET_URGENCY, 'medium')}</div>
          <div class="agent-difficulty-label"><span>6</span>Captures <small>optionnel · colle (Ctrl+V) ou choisis jusqu’à ${AGENT_TICKET_MAX_SHOTS} images</small></div>
          <div class="agent-ticket-shots" id="agent-ticket-shots"></div>
        </div>
        <div class="agent-difficulty-status" id="agent-difficulty-status" role="status"></div>
      </div>
      <div id="agent-ticket-mine" hidden><div class="agent-difficulty-history" id="agent-difficulty-history">Chargement…</div></div>
    </div>
    <div class="modal-footer" id="agent-ticket-footer"><button class="btn btn-ghost" type="button" onclick="closeAgentDifficulty()">Annuler</button>
      <button class="btn btn-primary" type="button" id="agent-difficulty-submit" onclick="submitAgentDifficulty()">Envoyer au superviseur</button></div>
  </div>`;
  overlay.classList.remove('hidden');
  overlay.querySelectorAll('input[name="agent-ticket-object"]').forEach(r => r.addEventListener('change', agentTicketObjectChanged));
  ['agent-ticket-ref', 'agent-ticket-booking'].forEach(id => agentDifficultyEl(id).addEventListener('input', agentTicketQueueDup));
  agentDifficultyEl('agent-ticket-link').addEventListener('input', () => {
    const ref = agentDifficultyEl('agent-ticket-ref');
    const guess = agentTicketFromLink(agentDifficultyEl('agent-ticket-link').value);
    if (guess && !ref.value.trim()) ref.value = guess;
    agentTicketQueueDup();
  });
  // Un message d'erreur disparaît dès que l'agent corrige un champ.
  overlay.querySelectorAll('#agent-ticket-new input, #agent-ticket-new textarea').forEach(el => el.addEventListener('input', () => { const st = agentDifficultyEl('agent-difficulty-status'); if (!st.classList.contains('is-ok')) st.textContent = ''; }));
  document.addEventListener('paste', agentTicketOnPaste);
  agentTicketObjectChanged();
  agentTicketPaintShots();
  loadAgentDifficultyHistory();
  agentDifficultyEl('agent-ticket-ref').focus();
}

function closeAgentDifficulty() {
  document.removeEventListener('paste', agentTicketOnPaste);
  // Captures envoyées mais jamais rattachées à un ticket.
  if (typeof drDeleteShot === 'function') agentDifficulty.shots.filter(s => s.path && !s.kept).forEach(s => drDeleteShot(s.path));
  agentDifficulty.shots = [];
  agentDifficultyEl('agent-difficulty-overlay')?.classList.add('hidden');
}

function agentTicketTab(tab) {
  document.querySelectorAll('[data-at-tab]').forEach(b => b.classList.toggle('active', b.dataset.atTab === tab));
  agentDifficultyEl('agent-ticket-new').hidden = tab !== 'new';
  agentDifficultyEl('agent-ticket-mine').hidden = tab !== 'mine';
  agentDifficultyEl('agent-ticket-footer').hidden = tab !== 'new';
}

function agentTicketObject() { return document.querySelector('input[name="agent-ticket-object"]:checked')?.value || 'ticket'; }
function agentTicketObjectChanged() {
  const object = agentTicketObject();
  document.querySelectorAll('#agent-ticket-refs [data-ref-for]').forEach(el => { el.hidden = !el.dataset.refFor.split(' ').includes(object); });
  agentDifficultyEl('agent-ticket-ref-label').textContent = object === 'call' ? 'N° de comm / numéro appelant' : object === 'message' ? 'Réf. conversation (Crisp / WATI)' : 'N° de ticket OSC';
  agentTicketQueueDup();
}

// ---------- Doublons ----------
function agentTicketKeys() {
  const object = agentTicketObject();
  if (object === 'situation') return [];
  return [...new Set([agentDifficultyEl('agent-ticket-ref').value, agentDifficultyEl('agent-ticket-booking').value].map(agentTicketKey).filter(k => k.length >= 3))];
}
function agentTicketQueueDup() {
  clearTimeout(agentDifficulty.dupTimer);
  agentDifficulty.dupTimer = setTimeout(agentTicketCheckDup, 350);
}
async function agentTicketCheckDup() {
  const keys = agentTicketKeys();
  agentDifficulty.override = false;
  if (!keys.length) { agentDifficulty.dup = null; agentTicketPaintDup(); return; }
  try {
    const filter = keys.length === 1 ? `data->>refKey=eq.${encodeURIComponent(keys[0])}` : `or=(${keys.map(k => `data->>refKey.eq.${encodeURIComponent(k)}`).join(',')})`;
    const rows = await dispatchRest(`complex_cases?select=id,title,status,agent_id,data,created_at&${filter}&status=neq.resolu&order=created_at.desc&limit=1`);
    if (JSON.stringify(agentTicketKeys()) !== JSON.stringify(keys)) return; // la saisie a changé entre-temps
    agentDifficulty.dup = rows[0] || null;
  } catch (_) { agentDifficulty.dup = null; }
  agentTicketPaintDup();
}
function agentTicketPaintDup() {
  const box = agentDifficultyEl('agent-ticket-dup');
  const rest = agentDifficultyEl('agent-ticket-rest');
  const submit = agentDifficultyEl('agent-difficulty-submit');
  if (!box) return;
  const dup = agentDifficulty.dup;
  if (!dup || agentDifficulty.override) {
    box.hidden = true; box.innerHTML = ''; rest.hidden = false; submit.hidden = false;
    return;
  }
  const who = dup.agent_id === currentUser.id ? 'toi' : (TEAM || []).find(u => u.id === dup.agent_id)?.name || 'un collègue';
  const comments = (dup.data?.updates || []).length;
  box.hidden = false; rest.hidden = true; submit.hidden = true;
  box.innerHTML = `<b>Ce ticket est déjà signalé</b> par ${escHtml(who)} le ${new Date(dup.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${escHtml(AGENT_CASE_STATUS[dup.status] || dup.status)}${comments ? ` · ${comments} commentaire${comments > 1 ? 's' : ''}` : ''}
    <p class="agent-ticket-dup-title">« ${escHtml(dup.title)} »</p>
    <label class="form-label" for="agent-ticket-dup-note">Ajoute plutôt ton commentaire au ticket existant</label>
    <textarea class="form-input" id="agent-ticket-dup-note" rows="3" maxlength="1500" placeholder="Ce que tu as vu de nouveau, ce que le client a dit…"></textarea>
    <div class="agent-ticket-dup-actions"><button type="button" class="btn btn-primary" onclick="agentTicketCommentDup()">Ajouter mon commentaire</button>
      <button type="button" class="btn btn-ghost" onclick="agentDifficulty.override=true;agentTicketPaintDup()">C’est un autre problème</button></div>`;
}
async function agentTicketCommentDup() {
  const note = agentDifficultyEl('agent-ticket-dup-note')?.value.trim() || '';
  const status = agentDifficultyEl('agent-difficulty-status');
  if (note.length < 2) { status.textContent = 'Écris ton commentaire.'; return; }
  try {
    const rows = await dispatchRest('rpc/taskin_case_comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: agentDifficulty.dup.id, p_note: note }) });
    if (!Array.isArray(rows) || !rows.length) throw new Error('ticket résolu entre-temps');
    status.classList.add('is-ok');
    status.textContent = 'Commentaire ajouté au ticket existant : ton superviseur le voit, et tu suis ce ticket dans « Mes tickets ».';
    ['agent-ticket-ref', 'agent-ticket-booking', 'agent-ticket-link'].forEach(id => { agentDifficultyEl(id).value = ''; });
    agentDifficulty.dup = null; agentTicketPaintDup();
    loadAgentDifficultyHistory();
  } catch (e) { status.classList.remove('is-ok'); status.textContent = `Commentaire non envoyé : ${e.message}`; }
}

// ---------- Captures ----------
function agentTicketOnPaste(e) {
  if (agentDifficultyEl('agent-difficulty-overlay')?.classList.contains('hidden') || agentDifficultyEl('agent-ticket-rest')?.hidden) return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); agentTicketAddShots(files); }
}
async function agentTicketAddShots(files) {
  if (typeof drUploadShot !== 'function') await loadModule('22-daily-results.js');
  const status = agentDifficultyEl('agent-difficulty-status');
  for (const file of files) {
    if (agentDifficulty.shots.length >= AGENT_TICKET_MAX_SHOTS) { status.textContent = `${AGENT_TICKET_MAX_SHOTS} captures maximum.`; break; }
    const shot = { name: file.name || 'capture', uploading: true, at: new Date().toISOString() };
    agentDifficulty.shots.push(shot); agentTicketPaintShots();
    try {
      const blob = await drCompressImage(file);
      shot.preview = URL.createObjectURL(blob); agentTicketPaintShots();
      shot.path = await drUploadShot(blob, currentUser.id, 'tickets');
      shot.uploading = false;
    } catch (e) {
      agentDifficulty.shots.splice(agentDifficulty.shots.indexOf(shot), 1);
      status.textContent = `Capture non envoyée : ${e.message}`;
    }
    agentTicketPaintShots();
  }
}
function agentTicketRemoveShot(i) {
  const [shot] = agentDifficulty.shots.splice(i, 1);
  if (shot?.path && typeof drDeleteShot === 'function') drDeleteShot(shot.path);
  agentTicketPaintShots();
}
function agentTicketPaintShots() {
  const box = agentDifficultyEl('agent-ticket-shots');
  if (!box) return;
  box.innerHTML = agentDifficulty.shots.map((s, i) => `<figure class="${s.uploading ? 'is-loading' : ''}">${s.preview ? `<img src="${s.preview}" alt="">` : ''}${s.uploading ? '<figcaption>Envoi…</figcaption>' : `<button type="button" aria-label="Retirer la capture" onclick="agentTicketRemoveShot(${i})">×</button>`}</figure>`).join('')
    + (agentDifficulty.shots.length < AGENT_TICKET_MAX_SHOTS ? '<label class="agent-ticket-shot-add"><input type="file" accept="image/*" multiple hidden onchange="agentTicketAddShots([...this.files]);this.value=\'\'">+ Ajouter</label>' : '');
}

// ---------- Mes tickets (signalés ou suivis) ----------
async function loadAgentDifficultyHistory() {
  const box = agentDifficultyEl('agent-difficulty-history');
  if (!box) return;
  try {
    const select = 'select=id,title,status,priority,agent_id,data,created_at,updated_at';
    const [own, followed] = await Promise.all([
      dispatchRest(`complex_cases?${select}&agent_id=eq.${currentUser.id}&order=created_at.desc&limit=30`),
      dispatchRest(`complex_cases?${select}&data->followers=cs.${encodeURIComponent(JSON.stringify([currentUser.id]))}&order=created_at.desc&limit=30`).catch(() => []),
    ]);
    const seen = new Set();
    agentDifficulty.mine = [...own.filter(r => r.data?.reportedBy === currentUser.id), ...followed].filter(r => !seen.has(r.id) && seen.add(r.id))
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    const open = agentDifficulty.mine.filter(r => r.status !== 'resolu').length;
    const count = agentDifficultyEl('agent-ticket-count');
    if (count) count.textContent = open ? String(open) : '';
    box.innerHTML = agentDifficulty.mine.length ? agentDifficulty.mine.map(agentTicketItemHtml).join('') : '<span class="agent-difficulty-empty">Aucun ticket pour l’instant.</span>';
  } catch (e) {
    box.innerHTML = `<span class="agent-difficulty-empty">Historique indisponible : ${escHtml(e.message)}</span>`;
  }
}
function agentTicketItemHtml(r) {
  const d = r.data || {};
  const type = AGENT_DIFFICULTY_TYPES.find(t => t[0] === d.difficulty)?.[1] || 'Autre';
  const updates = d.updates || [];
  const lastManager = [...updates].reverse().find(u => u.kind !== 'agent' && u.by !== currentUser.id);
  const followed = r.agent_id !== currentUser.id;
  return `<details class="agent-ticket-item">
    <summary><span><strong>${escHtml(r.title)}</strong><small>${escHtml(type)} · ${new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${followed ? ' · suivi (signalé par un collègue)' : ''}${updates.length ? ` · ${updates.length} commentaire${updates.length > 1 ? 's' : ''}` : ''}</small>${lastManager ? `<small class="agent-ticket-last">Superviseur : ${escHtml(lastManager.note.slice(0, 90))}${lastManager.note.length > 90 ? '…' : ''}</small>` : ''}</span><em class="is-${escHtml(r.status)}">${AGENT_CASE_STATUS[r.status] || escHtml(r.status)}</em></summary>
    <div class="agent-ticket-thread">${updates.length ? updates.map(u => `<p class="${u.kind === 'agent' || u.by === r.agent_id ? 'is-agent' : 'is-manager'}"><b>${escHtml((TEAM || []).find(x => x.id === u.by)?.name || (u.by === currentUser.id ? currentUser.name : 'Superviseur'))}</b> <small>${new Date(u.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><br>${escHtml(u.note)}</p>`).join('') : '<p class="agent-difficulty-empty">Pas encore de commentaire.</p>'}
      ${r.status !== 'resolu' ? `<div class="agent-ticket-reply"><textarea class="form-input" rows="2" maxlength="1500" placeholder="Répondre ou ajouter une info…" data-reply="${r.id}"></textarea><button type="button" class="btn btn-ghost" onclick="agentTicketReply('${r.id}')">Envoyer</button></div>` : ''}
    </div>
  </details>`;
}
async function agentTicketReply(id) {
  const input = document.querySelector(`[data-reply="${id}"]`);
  const note = input?.value.trim() || '';
  if (note.length < 2) { input?.focus(); return; }
  try {
    const rows = await dispatchRest('rpc/taskin_case_comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id, p_note: note }) });
    if (!Array.isArray(rows) || !rows.length) throw new Error('ticket résolu entre-temps');
    await loadAgentDifficultyHistory();
    const item = document.querySelector(`[data-reply="${id}"]`)?.closest('details');
    if (item) item.open = true;
  } catch (e) { alert(`Réponse non envoyée : ${e.message}`); }
}

// ---------- Envoi ----------
async function submitAgentDifficulty() {
  if (agentDifficulty.busy) return;
  const status = agentDifficultyEl('agent-difficulty-status');
  status.classList.remove('is-ok');
  const object = agentTicketObject();
  const subject = agentDifficultyEl('agent-difficulty-subject').value.trim();
  const ticket = agentDifficultyEl('agent-ticket-ref').value.trim();
  const booking = agentDifficultyEl('agent-ticket-booking').value.trim();
  const link = agentDifficultyEl('agent-ticket-link').value.trim();
  const what = agentDifficultyEl('agent-ticket-what').value.trim();
  const tried = agentDifficultyEl('agent-ticket-tried').value.trim();
  const need = agentDifficultyEl('agent-ticket-need').value.trim();
  if (object !== 'situation' && !ticket && !booking) { status.textContent = 'Indique au moins une référence (ticket, comm ou dossier).'; agentDifficultyEl('agent-ticket-ref').focus(); return; }
  if (link && !/^https?:\/\/\S+$/i.test(link)) { status.textContent = 'Le lien doit commencer par https://'; agentDifficultyEl('agent-ticket-link').focus(); return; }
  if (subject.length < 5) { status.textContent = 'Décris la difficulté en une phrase.'; agentDifficultyEl('agent-difficulty-subject').focus(); return; }
  if (what.length < 10) { status.textContent = 'Explique ce qui se passe (au moins une phrase).'; agentDifficultyEl('agent-ticket-what').focus(); return; }
  if (agentDifficulty.shots.some(s => s.uploading)) { status.textContent = 'Attends la fin de l’envoi des captures.'; return; }
  if (agentDifficulty.dup && !agentDifficulty.override) return;
  const difficulty = document.querySelector('input[name="agent-difficulty-type"]:checked')?.value || 'other';
  const priority = document.querySelector('input[name="agent-ticket-urgency"]:checked')?.value || 'medium';
  const ref = ticket || booking;
  const refKey = object === 'situation' ? '' : agentTicketKey(ticket) || agentTicketKey(booking);
  const title = ref ? `${ref} — ${subject}` : subject;
  const description = [`Ce qui se passe : ${what}`, tried && `Déjà essayé : ${tried}`, need && `Besoin : ${need}`].filter(Boolean).join('\n');
  const channel = AGENT_TICKET_CHANNEL[object];
  agentDifficulty.busy = true;
  agentDifficultyEl('agent-difficulty-submit').disabled = true;
  status.textContent = 'Envoi…';
  try {
    const now = Date.now();
    const screenshots = agentDifficulty.shots.map(s => ({ path: s.path, name: String(s.name || '').slice(0, 120), at: s.at }));
    const rows = await dispatchRest('complex_cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        agent_id: currentUser.id, owner_id: currentUser.id, status: 'nouveau', priority,
        title, description,
        data: { title, description, agentId: currentUser.id, channel, difficulty, object, ref, refKey: refKey || undefined, refs: { ticket, booking, link }, report: { what, tried, need }, urgency: priority, screenshots,
          reportedBy: currentUser.id, status: 'nouveau', priority, createdAt: now, createdBy: currentUser.id, updates: [], followers: [] },
      }),
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('signalement refusé');
    agentDifficulty.shots.forEach(s => { s.kept = true; });
    agentDifficulty.shots = [];
    status.classList.add('is-ok');
    status.textContent = 'Ticket envoyé : ton superviseur le voit dans « Cas complexes ». Tu le suis dans « Mes tickets ».';
    ['agent-ticket-ref', 'agent-ticket-booking', 'agent-ticket-link', 'agent-difficulty-subject', 'agent-ticket-what', 'agent-ticket-tried', 'agent-ticket-need'].forEach(id => { agentDifficultyEl(id).value = ''; });
    agentTicketPaintShots();
    loadAgentDifficultyHistory();
  } catch (e) {
    status.textContent = `Ticket non envoyé : ${e.message}`;
  }
  agentDifficulty.busy = false;
  agentDifficultyEl('agent-difficulty-submit').disabled = false;
}
