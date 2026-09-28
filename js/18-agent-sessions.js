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

function agentSessionsTable(rows) {
  if (!rows.length) return '<p class="admin-workflow-empty">Aucune connexion enregistrée.</p>';
  const cell = 'padding:8px 12px;border-bottom:1px solid var(--border)';
  const head = 'text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)';
  const body = rows.map(r => {
    const user = agentSessionsUser(r.agent_id);
    const name = user ? user.name : String(r.agent_id).slice(0, 8);
    const role = user && typeof ROLE_LABELS !== 'undefined' ? (ROLE_LABELS[user.role] || user.role) : '—';
    return `<tr>
      <td style="${cell}">${agentSessionsEsc(name)}</td>
      <td style="${cell};color:var(--text3)">${agentSessionsEsc(role)}</td>
      <td style="${cell}">${r.event === 'login' ? '🟢 Connexion' : '🔴 Déconnexion'}</td>
      <td style="${cell};color:var(--text3)">${new Date(r.created_at).toLocaleString('fr-FR')}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px">
    <thead><tr>
      <th style="${head}">Utilisateur</th><th style="${head}">Rôle</th>
      <th style="${head}">Événement</th><th style="${head}">Date</th>
    </tr></thead><tbody>${body}</tbody></table></div>`;
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
