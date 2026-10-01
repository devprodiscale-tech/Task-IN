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

// Plage choisie à la main (dates libres) ou raccourcis ; la veille est lue en plus pour retrouver
// la connexion d’une session encore ouverte au début de la plage.
const agentSessionsRange = { period: '7d', from: '', to: '' };
function agentSessionsDayKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function agentSessionsParse(day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); }
function agentSessionsBounds() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const st = agentSessionsRange;
  let from = new Date(today), to = new Date(today);
  if (st.period === 'yesterday') { from.setDate(from.getDate() - 1); to = new Date(from); }
  else if (st.period === '7d') from.setDate(from.getDate() - 6);
  else if (st.period === '30d') from.setDate(from.getDate() - 29);
  else if (st.period === 'custom' && st.from && st.to) { const [a, b] = st.from <= st.to ? [st.from, st.to] : [st.to, st.from]; from = agentSessionsParse(a); to = agentSessionsParse(b); }
  const end = new Date(to); end.setDate(end.getDate() + 1);
  return { from, to, end };
}

async function agentSessionsFetchRows() {
  const supabase = window.taskinDataProviders?.supabase;
  if (!supabase?.enabled()) return [];
  const { from, end } = agentSessionsBounds();
  const start = new Date(from); start.setDate(start.getDate() - 1);
  try {
    if (typeof dispatchRest === 'function') return (await dispatchRest(`agent_sessions?select=agent_id,event,created_at&created_at=gte.${encodeURIComponent(start.toISOString())}&created_at=lt.${encodeURIComponent(end.toISOString())}&order=created_at.asc&limit=20000`)) || [];
    return (await supabase.listTable('agent_sessions', 2000, 'created_at.desc')) || [];
  } catch (e) {
    console.error('agentSessionsFetchRows', e);
    return null;
  }
}

// Shift en texte libre (« 08:00-17:00 », « 8h-17h », « 8h30 – 17h ») → minutes ; null si illisible.
function agentSessionsShift(user) {
  const raw = String(user?.shift || '').trim();
  const m = raw.match(/(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:-|–|à|a)\s*(\d{1,2})\s*[h:]?\s*(\d{2})?/i);
  if (!m) return raw ? { label: raw } : null;
  return { label: raw, start: Number(m[1]) * 60 + Number(m[2] || 0), end: Number(m[3]) * 60 + Number(m[4] || 0) };
}
function agentSessionsHm(min) { return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}`; }
function agentSessionsGap(min) { const r = Math.round(min); return r === 0 ? 'à l’heure' : r > 0 ? `+${r} min` : `${r} min`; }

// Présence par jour (dans la plage) : 1re connexion, dernière déconnexion, temps connecté.
function agentSessionsPresence(acc) {
  const { from, end } = agentSessionsBounds();
  const days = new Map();
  acc.sessions.forEach(s => {
    const ref = s.start || s.end;
    if (!ref || ref < from || ref >= end) return;
    const key = agentSessionsDayKey(ref);
    if (!days.has(key)) days.set(key, { key, first: null, last: null, ms: 0, open: false, items: [] });
    const d = days.get(key);
    d.items.push(s);
    if (s.start && (!d.first || s.start < d.first)) d.first = s.start;
    const stop = s.end || (s.ongoing ? new Date() : null);
    if (stop && (!d.last || stop > d.last)) d.last = stop;
    if (s.ongoing) d.open = true;
    if (s.start && stop) d.ms += stop - s.start;
  });
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key));
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

function agentSessionsDetail(acc, shift) {
  const days = agentSessionsPresence(acc);
  if (!days.length) return '<p class="sessions-empty">Aucune session sur la période.</p>';
  return days.map(day => {
    const first = day.first ? day.first.getHours() * 60 + day.first.getMinutes() : null;
    const lastMin = day.last && !day.open ? day.last.getHours() * 60 + day.last.getMinutes() : null;
    const arrive = shift?.start !== undefined && first !== null ? ` <em class="${first - shift.start > 5 ? 'warn' : 'ok'}">arrivée ${agentSessionsGap(first - shift.start)}</em>` : '';
    const leave = shift?.end !== undefined && lastMin !== null ? ` <em class="${shift.end - lastMin > 5 ? 'warn' : 'ok'}">départ ${agentSessionsGap(lastMin - shift.end)}</em>` : '';
    return `<div class="sessions-day">
      <h4>${agentSessionsEsc(agentSessionsDay(agentSessionsParse(day.key)))}<span class="sessions-day-sum">${day.first ? `1re connexion <b>${agentSessionsTime(day.first)}</b>` : ''}${day.last ? ` · ${day.open ? 'toujours en ligne' : `dernière déconnexion <b>${agentSessionsTime(day.last)}</b>`}` : ''} · <b>${agentSessionsDuration(day.ms)}</b> connecté${arrive}${leave}</span></h4>
      <ul>${day.items.map(session => {
        const start = session.start ? agentSessionsTime(session.start) : '—';
        const end = session.ongoing ? 'en cours' : session.end ? agentSessionsTime(session.end) : 'non enregistrée';
        const duration = session.start && (session.end || session.ongoing) ? agentSessionsDuration((session.end || new Date()) - session.start) : '';
        const tag = session.ongoing ? '<em class="on">En ligne</em>' : session.unclosed ? '<em class="warn">Déconnexion non enregistrée</em>' : !session.start ? '<em class="warn">Connexion non enregistrée</em>' : '';
        return `<li><span class="sessions-dot ${session.ongoing ? 'on' : ''}"></span><span class="sessions-range"><b>${start}</b> → <b>${end}</b></span>${duration ? `<span class="sessions-duration">${duration}</span>` : ''}${tag}</li>`;
      }).join('')}</ul>
    </div>`;
  }).join('');
}

function agentSessionsRangeBar() {
  const st = agentSessionsRange, { from, to } = agentSessionsBounds();
  const max = agentSessionsDayKey(new Date());
  const btn = (k, l) => `<button type="button" class="${st.period === k ? 'active' : ''}" data-sessions-period="${k}">${l}</button>`;
  return `<div class="sessions-period">
    <div class="dr-poles">${btn('today', 'Aujourd’hui')}${btn('yesterday', 'Hier')}${btn('7d', '7 jours')}${btn('30d', '30 jours')}${btn('custom', 'Dates…')}</div>
    ${st.period === 'custom' ? `<span class="mc-custom"><input type="date" class="form-input" data-sessions-from value="${st.from}" max="${max}"> → <input type="date" class="form-input" data-sessions-to value="${st.to}" max="${max}"></span>` : ''}
    <span class="sessions-period-label">${from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}${+from !== +to ? ` → ${to.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}</span>
    <button type="button" class="admin-workflow-drill" data-sessions-csv>Exporter la présence (CSV)</button>
  </div>`;
}

function agentSessionsCsv(rows) {
  const lines = [['Agent', 'Pôle', 'Shift', 'Jour', '1re connexion', 'Dernière déconnexion', 'Temps connecté (min)', 'Écart arrivée (min)', 'Écart départ (min)']];
  agentSessionsByAccount(rows).forEach(acc => {
    const user = agentSessionsUser(acc.id), shift = agentSessionsShift(user);
    agentSessionsPresence(acc).slice().reverse().forEach(d => {
      const first = d.first ? d.first.getHours() * 60 + d.first.getMinutes() : null;
      const last = d.last && !d.open ? d.last.getHours() * 60 + d.last.getMinutes() : null;
      lines.push([user?.name || acc.id, String(user?.pole || '').toUpperCase(), shift?.label || '', d.key, d.first ? agentSessionsTime(d.first) : '', d.open ? 'en ligne' : d.last ? agentSessionsTime(d.last) : '', Math.round(d.ms / 60000),
        shift?.start !== undefined && first !== null ? first - shift.start : '', shift?.end !== undefined && last !== null ? last - shift.end : '']);
    });
  });
  const csv = '\ufeff' + lines.map(l => l.map(v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(';')).join('\r\n');
  const { from, to } = agentSessionsBounds();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `presence_${agentSessionsDayKey(from)}_${agentSessionsDayKey(to)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function agentSessionsTable(rows) {
  const accounts = agentSessionsByAccount(rows).filter(acc => agentSessionsPresence(acc).length || acc.online);
  if (!accounts.length) return '<p class="admin-workflow-empty">Aucune connexion sur la période.</p>';
  const items = accounts.map(acc => {
    const user = agentSessionsUser(acc.id);
    const name = user ? user.name : `Compte ${String(acc.id).slice(0, 8)}`;
    const role = user && typeof ROLE_LABELS !== 'undefined' ? (ROLE_LABELS[user.role] || user.role) : 'Compte inconnu';
    const pole = user?.role === 'agent' && user.pole ? ` · ${String(user.pole).toUpperCase()}` : '';
    const color = user?.color || '#64748B';
    const initials = user?.initials || name.slice(0, 2).toUpperCase();
    const shift = agentSessionsShift(user);
    const presence = agentSessionsPresence(acc);
    const total = presence.reduce((sum, d) => sum + d.ms, 0);
    const presenceLabel = presence.length ? `${agentSessionsDuration(total)} · ${presence.length} jour${presence.length > 1 ? 's' : ''}${shift ? ` · shift ${agentSessionsEsc(shift.label)}` : ''}` : 'Absent sur la période';
    const status = acc.online
      ? `<span class="sessions-status on">En ligne depuis ${agentSessionsTime(acc.last.at)}</span>`
      : `<span class="sessions-status">Hors ligne · ${agentSessionsEsc(agentSessionsDay(acc.last.at).toLowerCase())} à ${agentSessionsTime(acc.last.at)}</span>`;
    return `<details class="sessions-account" data-sessions-name="${agentSessionsEsc(name.toLowerCase())}">
      <summary>
        <span class="sessions-avatar" style="color:${agentSessionsEsc(color)};background:${agentSessionsEsc(color)}22">${agentSessionsEsc(initials)}<i class="${acc.online ? 'on' : ''}"></i></span>
        <span class="sessions-who"><strong>${agentSessionsEsc(name)}</strong><small>${agentSessionsEsc(role + pole)}</small></span>
        ${status}
        <span class="sessions-count">${presenceLabel}</span>
        <svg class="sessions-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="sessions-detail">${agentSessionsDetail(acc, shift)}</div>
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
    ${rows === null ? '' : agentSessionsRangeBar()}
    ${content}
  </section>`;
  container.querySelector('[data-sessions-refresh]')?.addEventListener('click', () => agentSessionsRenderInto(container, title));
  container.querySelectorAll('[data-sessions-period]').forEach(b => b.addEventListener('click', () => {
    agentSessionsRange.period = b.dataset.sessionsPeriod;
    if (agentSessionsRange.period === 'custom' && !agentSessionsRange.from) { const t = new Date(); agentSessionsRange.to = agentSessionsDayKey(t); t.setDate(t.getDate() - 6); agentSessionsRange.from = agentSessionsDayKey(t); }
    agentSessionsRenderInto(container, title);
  }));
  container.querySelectorAll('[data-sessions-from],[data-sessions-to]').forEach(input => input.addEventListener('change', () => {
    const f = container.querySelector('[data-sessions-from]').value, t = container.querySelector('[data-sessions-to]').value;
    if (f && t) { agentSessionsRange.from = f; agentSessionsRange.to = t; agentSessionsRenderInto(container, title); }
  }));
  container.querySelector('[data-sessions-csv]')?.addEventListener('click', () => agentSessionsCsv(rows || []));
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
