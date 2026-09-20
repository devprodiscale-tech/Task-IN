/* Task'in — fonctionnalités locales de test Admin et appels manqués. */
const TASKIN_LOCAL_ACCOUNTS_KEY = 'taskin_local_test_accounts_v1';
const TASKIN_MISSED_CALLS_KEY = 'taskin_missed_calls_v1';

function taskinLocalRead(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; } catch (_) { return fallback; }
}
function taskinLocalWrite(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function taskinLocalAccounts() { return taskinLocalRead(TASKIN_LOCAL_ACCOUNTS_KEY, []); }
async function taskinLocalHash(value) {
  if (window.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(value)));
}
function taskinLocalInitials(firstName, lastName) { return `${(firstName[0] || '')}${(lastName[0] || '')}`.toUpperCase() || '??'; }
function taskinLocalColor(role) { return role === 'supervisor' ? '#8B5CF6' : '#2563EB'; }
function taskinLocalToTeam(account) {
  return { id: account.id, name: `${account.firstName} ${account.lastName}`.trim(), email: account.email, color: account.color, initials: account.initials, role: account.role, active: account.active, photo: '', localTest: true };
}
function mergeTaskinLocalAccounts() {
  const local = taskinLocalAccounts().filter(account => account.active !== false).map(taskinLocalToTeam);
  const localIds = new Set(local.map(account => account.id));
  TEAM = TEAM.filter(account => !account.localTest && !localIds.has(account.id)).concat(local);
  teamById = new Map(TEAM.map(member => [member.id, member]));
  return local;
}
async function taskinLocalAuthenticate(email, password) {
  const account = taskinLocalAccounts().find(item => item.email.toLowerCase() === email.toLowerCase());
  if (!account) return { handled: false };
  if (account.active === false) return { handled: true, error: 'Ce compte de test est désactivé.' };
  const passwordHash = await taskinLocalHash(password);
  if (passwordHash !== account.passwordHash) return { handled: true, error: 'Adresse e-mail ou mot de passe incorrect.' };
  return { handled: true, user: taskinLocalToTeam(account) };
}
function taskinLocalAccountStatus(text, error = false) {
  const element = document.getElementById('taskin-local-account-status');
  if (element) { element.textContent = text; element.style.color = error ? 'var(--clay)' : 'var(--green)'; }
}
function taskinLocalAccountsMarkup() {
  const accounts = taskinLocalAccounts();
  return `<section class="admin-settings-card taskin-local-accounts-card"><div class="admin-workflow-card-head"><div><span>ENVIRONNEMENT LOCAL</span><h3>Comptes de test</h3></div><button class="admin-settings-primary" id="taskin-open-local-account">Ajouter un compte</button></div><p class="admin-settings-copy">Ces comptes sont stockés uniquement dans ce navigateur, sans Supabase. Ils permettent de tester les rôles Agent et Superviseur.</p><div class="taskin-local-account-list">${accounts.map(account => `<div class="taskin-local-account-row"><span class="admin-workflow-avatar" style="color:${account.color};background:${account.color}22">${account.initials}</span><span><strong>${adminSettingsEsc(`${account.firstName} ${account.lastName}`)}</strong><small>${adminSettingsEsc(account.email)} · ${account.role === 'supervisor' ? 'Superviseur' : 'Agent'}</small></span><em class="${account.active === false ? 'inactive' : ''}">${account.active === false ? 'Inactif' : 'Actif'}</em></div>`).join('') || '<p class="admin-workflow-empty">Aucun compte de test local.</p>'}</div><span id="taskin-local-account-status" class="admin-settings-copy"></span></section>`;
}
function taskinLocalAccountModal() {
  if (document.getElementById('taskin-local-account-modal')) return;
  const overlay = document.createElement('div'); overlay.id = 'taskin-local-account-modal'; overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal taskin-local-account-modal"><div class="modal-header"><div class="modal-title">Ajouter un compte de test</div><button class="modal-close" id="taskin-local-account-close">×</button></div><div class="modal-body"><div class="taskin-local-account-grid"><label class="form-label">Prénom<input class="form-input" id="taskin-local-first" required></label><label class="form-label">Nom<input class="form-input" id="taskin-local-last" required></label><label class="form-label">Adresse e-mail<input class="form-input" id="taskin-local-email" type="email" required></label><label class="form-label">Mot de passe<input class="form-input" id="taskin-local-password" type="password" minlength="6" required></label><label class="form-label">Rôle<select class="form-input" id="taskin-local-role"><option value="agent">Agent</option><option value="supervisor">Superviseur</option></select></label><label class="form-label">Statut<select class="form-input" id="taskin-local-active"><option value="true">Actif</option><option value="false">Inactif</option></select></label></div><p id="taskin-local-account-error" class="taskin-local-account-error"></p></div><div class="modal-footer"><button class="btn btn-ghost" id="taskin-local-account-cancel">Annuler</button><button class="btn btn-primary" id="taskin-local-account-save">Créer le compte</button></div></div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#taskin-local-account-close').onclick = close;
  overlay.querySelector('#taskin-local-account-cancel').onclick = close;
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.querySelector('#taskin-local-account-save').onclick = async () => {
    const firstName = overlay.querySelector('#taskin-local-first').value.trim();
    const lastName = overlay.querySelector('#taskin-local-last').value.trim();
    const email = overlay.querySelector('#taskin-local-email').value.trim().toLowerCase();
    const password = overlay.querySelector('#taskin-local-password').value;
    const role = overlay.querySelector('#taskin-local-role').value;
    const active = overlay.querySelector('#taskin-local-active').value === 'true';
    const error = overlay.querySelector('#taskin-local-account-error');
    if (!firstName || !lastName || !email || !password || !['agent', 'supervisor'].includes(role)) { error.textContent = 'Tous les champs sont obligatoires.'; return; }
    if (password.length < 6) { error.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return; }
    const accounts = taskinLocalAccounts();
    if (accounts.some(account => account.email.toLowerCase() === email)) { error.textContent = 'Un compte utilise déjà cette adresse e-mail.'; return; }
    const account = { id: `local-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`, firstName, lastName, email, role, active, color: taskinLocalColor(role), initials: taskinLocalInitials(firstName, lastName), passwordHash: await taskinLocalHash(password), createdAt: Date.now() };
    accounts.push(account); taskinLocalWrite(TASKIN_LOCAL_ACCOUNTS_KEY, accounts); mergeTaskinLocalAccounts(); close();
    adminSettingsRender(); taskinLocalAccountStatus('Compte local créé avec succès.');
  };
}
function renderTaskinLocalAccounts() {
  if (typeof adminSettingsSection === 'undefined' || adminSettingsSection !== 'accounts') return;
  const panel = document.getElementById('admin-settings-panel');
  const content = panel?.querySelector('.admin-settings-content');
  if (!content) return;
  const existing = content.querySelector('.taskin-local-accounts-card'); existing?.remove();
  content.insertAdjacentHTML('beforeend', taskinLocalAccountsMarkup());
  content.querySelector('#taskin-open-local-account').onclick = taskinLocalAccountModal;
}
if (typeof adminSettingsRender === 'function') {
  const taskinBaseSettingsRender = adminSettingsRender;
  adminSettingsRender = function() { taskinBaseSettingsRender(); renderTaskinLocalAccounts(); };
}

/* -------- Suivi local des appels manqués et analyse mensuelle -------- */
function taskinMissedCalls() { return taskinLocalRead(TASKIN_MISSED_CALLS_KEY, []); }
function taskinMissedNormalize(row, index) {
  const get = (...keys) => { const key = keys.find(candidate => row[candidate] !== undefined); return key ? row[key] : ''; };
  const date = get('date', 'Date', 'datetime', 'Date/heure', 'created_at', 'createdAt');
  const statusRaw = String(get('status', 'Status', 'statut', 'Statut', 'state') || 'non traité').toLowerCase();
  const treated = ['treated', 'traité', 'traite', 'handled', 'done', 'resolved', 'rappel effectué', 'rappel_effectue'].some(value => statusRaw.includes(value));
  return { id: String(get('id', 'ID', 'call_id') || `missed-${Date.now()}-${index}`), date: date ? new Date(date).toISOString() : new Date().toISOString(), agent: String(get('agent', 'Agent', 'agent_name', 'assigned_to') || ''), status: treated ? 'traité' : 'non traité', callbackMinutes: Number(get('callbackMinutes', 'callback_minutes', 'temps_rappel', 'average_callback_minutes')) || null, phone: String(get('phone', 'telephone', 'number') || ''), note: String(get('note', 'notes', 'description') || '') };
}
function taskinMissedParse(text, name) {
  if (/\.json$/i.test(name)) { const raw = JSON.parse(text); return (Array.isArray(raw) ? raw : (raw.calls || raw.data || [])).map(taskinMissedNormalize); }
  const lines = text.split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = lines.shift().split(delimiter).map(value => value.trim().replace(/^"|"$/g, ''));
  return lines.map(line => { const values = line.split(delimiter).map(value => value.trim().replace(/^"|"$/g, '')); return taskinMissedNormalize(Object.fromEntries(headers.map((header, i) => [header, values[i] || '']))); });
}
function taskinMissedMonths(rows, filters = {}) {
  const filtered = rows.filter(row => (!filters.agent || row.agent === filters.agent) && (!filters.status || row.status === filters.status) && (!filters.from || row.date.slice(0, 7) >= filters.from) && (!filters.to || row.date.slice(0, 7) <= filters.to));
  const groups = new Map(); filtered.forEach(row => { const month = row.date.slice(0, 7); if (!groups.has(month)) groups.set(month, []); groups.get(month).push(row); });
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, values]) => { const treated = values.filter(row => row.status === 'traité').length; const callback = values.filter(row => row.callbackMinutes !== null); return { month, total: values.length, treated, pending: values.length - treated, rate: values.length ? Math.round(treated / values.length * 100) : 0, callback: callback.length ? Math.round(callback.reduce((sum, row) => sum + row.callbackMinutes, 0) / callback.length) : null }; });
}
function renderTaskinMissedCalls() {
  const panel = document.getElementById('admin-quality-panel'); if (!panel) return;
  let section = panel.querySelector('.taskin-missed-calls');
  if (!section) { section = document.createElement('section'); section.className = 'taskin-missed-calls admin-quality-card'; panel.querySelector('.admin-quality-shell')?.appendChild(section); }
  const rows = taskinMissedCalls(); const agents = [...new Set(rows.map(row => row.agent).filter(Boolean))].sort();
  const agent = section.querySelector('#taskin-missed-agent')?.value || '', status = section.querySelector('#taskin-missed-status')?.value || '', from = section.querySelector('#taskin-missed-from')?.value || '', to = section.querySelector('#taskin-missed-to')?.value || '';
  const months = taskinMissedMonths(rows, { agent, status, from, to }); const total = months.reduce((sum, month) => sum + month.total, 0); const treated = months.reduce((sum, month) => sum + month.treated, 0);
  section.innerHTML = `<div class="admin-workflow-card-head"><div><span>QUALITÉ · ANALYSE</span><h3>Suivi des appels manqués</h3></div><label class="admin-settings-primary taskin-file-label">Importer CSV/JSON<input id="taskin-missed-file" type="file" accept=".csv,.json,text/csv,application/json" hidden></label></div><p class="admin-settings-copy">Import local, sans Supabase. Les colonnes reconnues incluent date, agent, statut et temps de rappel.</p><div class="taskin-missed-filters"><select id="taskin-missed-agent"><option value="">Tous les agents</option>${agents.map(value => `<option ${value === agent ? 'selected' : ''}>${adminSettingsEsc(value)}</option>`).join('')}</select><select id="taskin-missed-status"><option value="">Tous les statuts</option><option value="traité" ${status === 'traité' ? 'selected' : ''}>Traités</option><option value="non traité" ${status === 'non traité' ? 'selected' : ''}>Non traités</option></select><input id="taskin-missed-from" type="month" value="${from}"><input id="taskin-missed-to" type="month" value="${to}"></div><div class="taskin-missed-kpis"><div><strong>${total}</strong><span>Total appels</span></div><div><strong>${treated}</strong><span>Traités</span></div><div><strong>${total ? Math.round(treated / total * 100) : 0}%</strong><span>Taux de traitement</span></div><div><strong>${months[0]?.callback ? months[0].callback + ' min' : '—'}</strong><span>Rappel moyen</span></div></div><div class="taskin-missed-months">${months.map(month => `<div class="taskin-missed-month"><strong>${new Date(`${month.month}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong><span>${month.total} appels · ${month.treated} traités · ${month.pending} non traités · ${month.rate}%</span><i><b style="width:${month.rate}%"></b></i></div>`).join('') || '<p class="admin-workflow-empty">Importe un fichier pour afficher l’analyse mensuelle.</p>'}</div>`;
  ['taskin-missed-agent', 'taskin-missed-status', 'taskin-missed-from', 'taskin-missed-to'].forEach(id => section.querySelector(`#${id}`).addEventListener('change', renderTaskinMissedCalls));
  section.querySelector('#taskin-missed-file').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { const imported = taskinMissedParse(await file.text(), file.name); taskinLocalWrite(TASKIN_MISSED_CALLS_KEY, [...rows, ...imported]); renderTaskinMissedCalls(); } catch (error) { alert(`Import impossible : ${error.message}`); } });
}
if (typeof adminQualityRender === 'function') {
  const taskinBaseQualityRender = adminQualityRender;
  adminQualityRender = function() { taskinBaseQualityRender(); renderTaskinMissedCalls(); };
}
