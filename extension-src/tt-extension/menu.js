const FLOAT_ENABLED_KEY = 'onspotFloatEnabled';

function transferButtonHere() {
  chrome.runtime.sendMessage({ type: 'onspot:transferFloatHere' }, () => {
    void chrome.runtime.lastError;
    window.close();
  });
}

document.getElementById('open-window').addEventListener('click', transferButtonHere);

document.getElementById('open-doc').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('documentation.html'),
    type: 'popup',
    width: 500,
    height: 680,
  });
  window.close();
});

const toggle = document.getElementById('float-toggle');
const status = document.getElementById('toggle-status');

function applyStatus(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? 'Activé' : 'Désactivé';
}

chrome.storage.local.get([FLOAT_ENABLED_KEY], res => {
  const enabled = res[FLOAT_ENABLED_KEY] !== false;
  applyStatus(enabled);
});

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  applyStatus(enabled);
  chrome.runtime.sendMessage({ type: 'onspot:setFloatEnabled', enabled }, () => {
    void chrome.runtime.lastError;
  });
});

// ---------- Mon dispatch client (agent connecté) ----------
// Même liste et même table (agent_dispatch_log) que la barre « Mon dispatch client » de la web app
// (js/23-agent-dispatch.js) : à garder synchronisées.
const DISPATCH_CHANNELS = {
  fo: ['Wati', 'Email', 'Ringover', 'Break coverage'],
  bo: ['Supplier emails', 'Pre-reconfirmation', 'Break coverage'],
  reconf: ['Ringover', 'Email', 'Pre-reconfirmation', 'Break coverage'],
};
const DISPATCH_LABELS = { 'Pre-reconfirmation': 'Pre-reconfirmation (tickets & threads)' };
const DISPATCH_HINT = { fo: 'Même dispatché partout, la priorité reste les appels.' };
const dispatchState = { agentId: '', channels: [], current: null, draft: null, busy: false };
const dispatchEl = id => document.getElementById(id);
const dispatchLabel = c => DISPATCH_LABELS[c] || c;
const dispatchSummary = list => (list && list.length ? list.map(dispatchLabel).join(' · ') : 'Aucun dispatch');
const dispatchTime = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const sameSet = (a, b) => a.slice().sort().join('|') === b.slice().sort().join('|');

function renderDispatch() {
  const { current, draft, channels, busy } = dispatchState;
  const selected = draft ?? (current?.channels || []);
  dispatchEl('dispatch-state').textContent = current ? `${dispatchSummary(current.channels)} · depuis ${dispatchTime(current.started_at)}` : 'Pas encore déclaré aujourd’hui';
  const chips = dispatchEl('dispatch-chips');
  chips.textContent = '';
  const chip = (label, active, onClick, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `dispatch-chip ${extra} ${active ? 'active' : ''}`.trim(); b.textContent = label;
    b.setAttribute('aria-pressed', String(active)); b.addEventListener('click', onClick);
    chips.appendChild(b);
  };
  channels.forEach(c => chip(dispatchLabel(c), selected.includes(c), () => {
    const base = dispatchState.draft ?? (dispatchState.current?.channels || []);
    dispatchState.draft = base.includes(c) ? base.filter(x => x !== c) : [...base, c];
    dispatchEl('dispatch-msg').textContent = '';
    renderDispatch();
  }));
  chip('Aucun dispatch', draft !== null && !selected.length, () => { dispatchState.draft = []; dispatchEl('dispatch-msg').textContent = ''; renderDispatch(); }, 'none');
  const changed = draft !== null && (!current || !sameSet(draft, current.channels || []));
  const save = dispatchEl('dispatch-save');
  save.disabled = !changed || busy;
  save.textContent = busy ? 'Enregistrement…' : 'Mettre à jour';
}

async function saveDispatch() {
  if (dispatchState.busy || dispatchState.draft === null) return;
  dispatchState.busy = true; renderDispatch();
  const msg = dispatchEl('dispatch-msg');
  try {
    const rows = await supabaseClient.request('/rest/v1/agent_dispatch_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ agent_id: dispatchState.agentId, channels: dispatchState.draft }),
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('refusé');
    dispatchState.current = rows[0]; dispatchState.draft = null;
    msg.className = 'dispatch-msg ok'; msg.textContent = `Dispatch mis à jour à ${dispatchTime(rows[0].started_at)}.`;
  } catch (error) {
    msg.className = 'dispatch-msg error'; msg.textContent = `Dispatch non enregistré : ${error.message}`;
  }
  dispatchState.busy = false; renderDispatch();
}

async function initDispatch() {
  if (typeof supabaseClient === 'undefined') return;
  try {
    const session = await supabaseClient.getSession();
    const userId = session?.user?.id;
    if (!userId) return; // non connecté : le pop-up reste tel quel
    const profile = await supabaseClient.getProfile(userId);
    if (!profile || profile.role !== 'agent') return; // dispatch réservé aux agents
    const pole = String(profile.pole || '').toLowerCase();
    Object.assign(dispatchState, { agentId: userId, channels: DISPATCH_CHANNELS[pole] || [...new Set(Object.values(DISPATCH_CHANNELS).flat())] });
    dispatchEl('dispatch-hint').textContent = DISPATCH_HINT[pole] || '';
    dispatchEl('dispatch').hidden = false;
    renderDispatch();
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(), to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    const log = await supabaseClient.request(`/rest/v1/agent_dispatch_log?select=*&agent_id=eq.${encodeURIComponent(userId)}&started_at=gte.${encodeURIComponent(from)}&started_at=lt.${encodeURIComponent(to)}&order=started_at.asc&limit=200`);
    dispatchState.current = Array.isArray(log) && log.length ? log[log.length - 1] : null;
    renderDispatch();
  } catch (error) {
    if (!dispatchEl('dispatch').hidden) dispatchEl('dispatch-state').textContent = `Dispatch indisponible : ${error.message}`;
  }
}

dispatchEl('dispatch-save').addEventListener('click', saveDispatch);
initDispatch();
