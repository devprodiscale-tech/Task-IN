// ======================= JOURNAL DES CONNEXIONS =======================
// Historique connexion/déconnexion, visible Admin + Superviseur uniquement.
// Les comptes locaux de test (sans session Supabase) ne sont pas journalisés.

const AGENT_SESSIONS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function agentSessionsEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function agentSessionsLog(event) {
  try {
    const supabase = window.taskinDataProviders?.supabase;
    if (!supabase?.enabled() || !supabase.getSession()?.access_token) return;
    if (!currentUser?.id || !AGENT_SESSIONS_UUID.test(currentUser.id)) return;
    await supabase.insertRow('agent_sessions', { agent_id: currentUser.id, event });
  } catch (e) {
    console.error('agentSessionsLog', event, e);
  }
}

async function agentSessionsFetchRows(limit = 300) {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return [];
  try {
    return (await supabase.listTable('agent_sessions', limit, 'created_at.desc')) || [];
  } catch (e) {
    console.error('agentSessionsFetchRows', e);
    return null;
  }
}

function agentSessionsUser(id) {
  const list = typeof TEAM !== 'undefined' ? TEAM : [];
  return list.find(t => t.id === id) || null;
}

function agentSessionsTime(date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function agentSessionsDay(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function agentSessionsDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

// Regroupe les événements par compte et reconstitue les sessions (connexion → déconnexion).
function agentSessionsByAccount(rows) {
  const accounts = new Map();
  [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(row => {
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime())) return;
    if (!accounts.has(row.agent_id)) accounts.set(row.agent_id, { id: row.agent_id, sessions: [], open: null, last: null, count: 0 });
    const acc = accounts.get(row.agent_id);
    acc.last = { event: row.event, at };
    if (row.event === 'login') {
      if (acc.open) acc.sessions.push({ start: acc.open, end: null, unclosed: true });
      acc.open = at; acc.count++;
    } else {
      acc.sessions.push({ start: acc.open, end: at });
      acc.open = null;
    }
  });
  accounts.forEach(acc => {
    if (acc.open) acc.sessions.push({ start: acc.open, end: null, ongoing: true });
    acc.sessions.reverse();
    acc.online = acc.last?.event === 'login';
  });
  return [...accounts.values()].sort((a, b) => (b.online - a.online) || (b.last.at - a.last.at));
}

function agentSessionsDetail(acc) {
  if (!acc.sessions.length) return '<p class="sessions-empty">Aucune session enregistrée.</p>';
  const days = new Map();
  acc.sessions.forEach(session => {
    const ref = session.start || session.end;
    const key = ref.toDateString();
    if (!days.has(key)) days.set(key, { label: agentSessionsDay(ref), items: [] });
    days.get(key).items.push(session);
  });
  return [...days.values()].map(day => `<div class="sessions-day">
      <h4>${agentSessionsEsc(day.label)}</h4>
      <ul>${day.items.map(session => {
        const start = session.start ? agentSessionsTime(session.start) : '—';
        const end = session.ongoing ? 'en cours' : session.end ? agentSessionsTime(session.end) : 'non enregistrée';
        const duration = session.start && (session.end || session.ongoing) ? agentSessionsDuration((session.end || new Date()) - session.start) : '';
        const tag = session.ongoing ? '<em class="on">En ligne</em>' : session.unclosed ? '<em class="warn">Déconnexion non enregistrée</em>' : !session.start ? '<em class="warn">Connexion non enregistrée</em>' : '';
        return `<li><span class="sessions-dot ${session.ongoing ? 'on' : ''}"></span><span class="sessions-range"><b>${start}</b> → <b>${end}</b></span>${duration ? `<span class="sessions-duration">${duration}</span>` : ''}${tag}</li>`;
      }).join('')}</ul>
    </div>`).join('');
}

function agentSessionsTable(rows) {
  const accounts = agentSessionsByAccount(rows);
  if (!accounts.length) return '<p class="admin-workflow-empty">Aucune connexion enregistrée.</p>';
  const items = accounts.map(acc => {
    const user = agentSessionsUser(acc.id);
    const name = user ? user.name : `Compte ${String(acc.id).slice(0, 8)}`;
    const role = user && typeof ROLE_LABELS !== 'undefined' ? (ROLE_LABELS[user.role] || user.role) : 'Compte inconnu';
    const pole = user?.role === 'agent' && user.pole ? ` · ${String(user.pole).toUpperCase()}` : '';
    const color = user?.color || '#64748B';
    const initials = user?.initials || name.slice(0, 2).toUpperCase();
    const status = acc.online
      ? `<span class="sessions-status on">En ligne depuis ${agentSessionsTime(acc.last.at)}</span>`
      : `<span class="sessions-status">Hors ligne · ${agentSessionsEsc(agentSessionsDay(acc.last.at).toLowerCase())} à ${agentSessionsTime(acc.last.at)}</span>`;
    return `<details class="sessions-account" data-sessions-name="${agentSessionsEsc(name.toLowerCase())}">
      <summary>
        <span class="sessions-avatar" style="color:${agentSessionsEsc(color)};background:${agentSessionsEsc(color)}22">${agentSessionsEsc(initials)}<i class="${acc.online ? 'on' : ''}"></i></span>
        <span class="sessions-who"><strong>${agentSessionsEsc(name)}</strong><small>${agentSessionsEsc(role + pole)}</small></span>
        ${status}
        <span class="sessions-count">${acc.count} connexion${acc.count > 1 ? 's' : ''}</span>
        <svg class="sessions-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="sessions-detail">${agentSessionsDetail(acc)}</div>
    </details>`;
  }).join('');
  const online = accounts.filter(a => a.online).length;
  return `<div class="sessions-toolbar">
      <span class="sessions-summary"><b>${accounts.length}</b> compte${accounts.length > 1 ? 's' : ''} · <b class="on">${online}</b> en ligne</span>
      <input type="search" class="sessions-search" placeholder="Rechercher un compte" aria-label="Rechercher un compte" data-sessions-search>
    </div>
    <div class="sessions-list">${items}</div>
    <p class="admin-workflow-empty sessions-noresult" hidden>Aucun compte ne correspond.</p>`;
}

async function agentSessionsRenderInto(container, title) {
  container.innerHTML = '<p style="padding:16px">Chargement…</p>';
  const rows = await agentSessionsFetchRows();
  const content = rows === null
    ? '<p class="admin-workflow-empty">Chargement impossible. Vérifie que la migration 006 est appliquée.</p>'
    : agentSessionsTable(rows);
  container.innerHTML = `<section class="admin-settings-card">
    <div class="admin-workflow-card-head">
      <div><span>JOURNAL</span><h3>${agentSessionsEsc(title)}</h3></div>
      <button type="button" class="admin-workflow-drill" data-sessions-refresh>Actualiser</button>
    </div>
    ${content}
  </section>`;
  container.querySelector('[data-sessions-refresh]')?.addEventListener('click', () => agentSessionsRenderInto(container, title));
  const search = container.querySelector('[data-sessions-search]');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    container.querySelectorAll('.sessions-account').forEach(item => { const match = !q || item.dataset.sessionsName.includes(q); item.hidden = !match; if (match) shown++; });
    container.querySelector('.sessions-noresult').hidden = shown > 0;
  });
}

async function agentSessionsAdminRender() {
  const panel = document.getElementById('admin-agent-sessions-panel');
  if (!panel || currentUser?.role !== 'admin') return;
  await agentSessionsRenderInto(panel, 'Connexions & déconnexions');
}

async function agentSessionsSupervisorRender() {
  const view = document.getElementById('sv-view-sessions');
  if (!view || !['supervisor', 'admin'].includes(currentUser?.role)) return;
  await agentSessionsRenderInto(view, 'Connexions & déconnexions de l’équipe');
}
