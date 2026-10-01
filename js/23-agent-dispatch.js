// ======================= DISPATCH CLIENT DÉCLARÉ PAR L'AGENT =======================
// Pendant son shift, l'agent indique lui-même sur quels canaux le client l'a dispatché
// (plusieurs possibles, ou aucun). Chaque changement est horodaté dans agent_dispatch_log
// (migration 012) : l'admin et le superviseur relisent ainsi le résultat du jour à la
// lumière de l'affectation réelle. Métier : même dispatché partout, la priorité reste l'appel.

const DISPATCH_CHANNELS = {
  fo: ['Wati', 'Email', 'Ringover', 'Break coverage'],
  bo: ['Supplier emails', 'Pre-reconfirmation', 'Break coverage'],
  // À confirmer avec le management : liste Reconf provisoire.
  reconf: ['Ringover', 'Email', 'Pre-reconfirmation', 'Break coverage'],
};
const DISPATCH_LABELS = { 'Pre-reconfirmation': 'Pre-reconfirmation (tickets & threads)' };
const DISPATCH_HINT = { fo: 'Même dispatché partout, la priorité reste les appels.' };

let agentDispatch = { loaded: false, current: null, draft: null, busy: false, error: '', agentId: '' };

function dispatchLabel(channel) { return DISPATCH_LABELS[channel] || channel; }
function dispatchSummary(channels) { return channels?.length ? channels.map(dispatchLabel).join(' · ') : 'Aucun dispatch'; }
function dispatchTime(iso) { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function dispatchDayBounds(day) {
  const [y, m, d] = day.split('-').map(Number);
  return [new Date(y, m - 1, d).toISOString(), new Date(y, m - 1, d + 1).toISOString()];
}
function dispatchToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function dispatchRest(path, init = {}) {
  const provider = window.taskinDataProviders?.active?.();
  const cfg = window.TASKIN_SUPABASE_CONFIG || {};
  if (!provider || !cfg.url) throw new Error('Supabase n’est pas configuré.');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', cfg.anonKey);
  headers.set('Accept', 'application/json');
  const response = await provider.authFetch(`${cfg.url.replace(/\/+$/, '')}/rest/v1/${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Erreur ${response.status}`);
  return payload;
}

// Journal d'un jour (tous les agents, ou un seul) — utilisé aussi par la page Résultats.
async function loadDispatchLog(day, agentId = '') {
  const [from, to] = dispatchDayBounds(day);
  const filter = agentId ? `&agent_id=eq.${agentId}` : '';
  return dispatchRest(`agent_dispatch_log?select=*&started_at=gte.${encodeURIComponent(from)}&started_at=lt.${encodeURIComponent(to)}${filter}&order=started_at.asc&limit=2000`);
}

async function initAgentDispatch() {
  const bar = document.getElementById('agent-dispatch-bar');
  if (!bar) return;
  if (currentUser?.role !== 'agent') { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  if (agentDispatch.agentId !== currentUser.id) agentDispatch = { loaded: false, current: null, draft: null, busy: false, error: '', agentId: currentUser.id };
  renderAgentDispatch();
  try {
    const log = await loadDispatchLog(dispatchToday(), currentUser.id);
    agentDispatch.current = log.length ? log[log.length - 1] : null;
    agentDispatch.error = '';
  } catch (e) {
    agentDispatch.error = e.message;
  }
  agentDispatch.loaded = true;
  renderAgentDispatch();
}

function renderAgentDispatch() {
  const bar = document.getElementById('agent-dispatch-bar');
  if (!bar || currentUser?.role !== 'agent') return;
  const pole = String(currentUser.pole || (TEAM || []).find(t => t.id === currentUser.id)?.pole || '').toLowerCase();
  const channels = DISPATCH_CHANNELS[pole] || [...new Set(Object.values(DISPATCH_CHANNELS).flat())];
  const current = agentDispatch.current;
  const selected = agentDispatch.draft ?? (current?.channels || []);
  const changed = agentDispatch.draft !== null && (agentDispatch.draft.slice().sort().join('|') !== (current?.channels || []).slice().sort().join('|') || !current);
  const icon = typeof agentIcon === 'function' ? agentIcon('dispatch', 'dispatch-icon') : '';
  bar.innerHTML = `
    <div class="dispatch-head">${icon}<div><strong>Mon dispatch client</strong>
      <span>${!agentDispatch.loaded ? 'Chargement…' : current ? `${escHtml(dispatchSummary(current.channels))} · depuis ${dispatchTime(current.started_at)}` : 'Pas encore déclaré aujourd’hui'}</span></div></div>
    <div class="dispatch-chips" role="group" aria-label="Canaux dispatchés">
      ${channels.map(c => `<button type="button" class="dispatch-chip ${selected.includes(c) ? 'active' : ''}" aria-pressed="${selected.includes(c)}" onclick="toggleAgentDispatch('${escHtml(c)}')">${escHtml(dispatchLabel(c))}</button>`).join('')}
      <button type="button" class="dispatch-chip dispatch-none ${agentDispatch.draft !== null && !selected.length ? 'active' : ''}" onclick="clearAgentDispatch()">Aucun dispatch</button>
    </div>
    <div class="dispatch-actions">
      ${DISPATCH_HINT[pole] ? `<small>${DISPATCH_HINT[pole]}</small>` : ''}
      <button type="button" class="btn btn-primary dispatch-save" ${changed && !agentDispatch.busy ? '' : 'disabled'} onclick="saveAgentDispatch()">${agentDispatch.busy ? 'Enregistrement…' : 'Mettre à jour'}</button>
      ${typeof openAgentDifficulty === 'function' ? '<button type="button" class="btn btn-ghost dispatch-report" onclick="openAgentDifficulty()">Signaler une difficulté</button>' : ''}
    </div>
    ${agentDispatch.error ? `<div class="dispatch-error" role="status">${escHtml(agentDispatch.error)}</div>` : ''}`;
}

function toggleAgentDispatch(channel) {
  const base = agentDispatch.draft ?? (agentDispatch.current?.channels || []);
  agentDispatch.draft = base.includes(channel) ? base.filter(c => c !== channel) : [...base, channel];
  renderAgentDispatch();
}
function clearAgentDispatch() { agentDispatch.draft = []; renderAgentDispatch(); }

async function saveAgentDispatch() {
  if (agentDispatch.busy || agentDispatch.draft === null || currentUser?.role !== 'agent') return;
  agentDispatch.busy = true; agentDispatch.error = '';
  renderAgentDispatch();
  try {
    const rows = await dispatchRest('agent_dispatch_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ agent_id: currentUser.id, channels: agentDispatch.draft }),
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('Dispatch non enregistré.');
    agentDispatch.current = rows[0];
    agentDispatch.draft = null;
  } catch (e) {
    agentDispatch.error = `Dispatch non enregistré : ${e.message}`;
  }
  agentDispatch.busy = false;
  renderAgentDispatch();
}

// Résumé lisible d'une journée : « Wati · Ringover 08:02 → Email 12:30 ».
function dispatchTimeline(log) {
  if (!log?.length) return '';
  return log.map(l => `${dispatchSummary(l.channels)} ${dispatchTime(l.started_at)}`).join(' → ');
}

if (typeof applyRoleUI === 'function') {
  const baseApplyRoleUIDispatch = applyRoleUI;
  applyRoleUI = function () {
    baseApplyRoleUIDispatch.apply(this, arguments);
    initAgentDispatch();
  };
}

// ---------- Fin de shift : rappel de la déclaration des chiffres OSC ----------
// Renvoie true pour continuer la déconnexion, false si l'agent préfère déclarer d'abord.
async function taskinShiftStatsReminder() {
  try {
    const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rows = await Promise.race([dispatchRest(`agent_stat_submissions?select=id&agent_id=eq.${currentUser.id}&day=eq.${day}`), new Promise(resolve => setTimeout(() => resolve(null), 3000))]);
    if (!Array.isArray(rows) || rows.length) return true;
  } catch (_) { return true; }
  if (!confirm('Tu n’as pas encore déclaré tes chiffres OSC du jour.\n\nOK : les déclarer maintenant\nAnnuler : te déconnecter quand même')) return true;
  await switchTab('results', document.getElementById('tab-results'));
  for (let i = 0; i < 40; i++) {
    if (typeof drOpenDeclare === 'function' && typeof drState !== 'undefined' && drState.mySub !== undefined && !drState.loading) { drOpenDeclare(); break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}
