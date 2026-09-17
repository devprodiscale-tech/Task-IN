// /api/admin-manage-supabase-account.js
// Opérations privilégiées Supabase : création, changement de mot de passe et suppression.
// SUPABASE_SERVICE_ROLE_KEY ne doit être configurée que côté serveur.

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function adminHeaders(extra = {}) {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: adminHeaders(options.headers) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || `Supabase HTTP ${response.status}`);
  return payload;
}

async function requesterProfile(accessToken) {
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` } });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) return null;
  const profiles = await supabase(`/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  return profiles?.[0]?.role === 'admin' ? user : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Configuration Supabase serveur manquante.' });

  try {
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const requester = await requesterProfile(accessToken);
    if (!requester) return res.status(403).json({ error: 'Seuls les administrateurs Supabase peuvent effectuer cette action.' });

    const { action, uid, email, password, name, role, color, initials } = req.body || {};
    if (action === 'setPassword') {
      if (!uid || !password || String(password).length < 6) return res.status(400).json({ error: 'uid et mot de passe de 6 caractères minimum requis.' });
      await supabase(`/auth/v1/admin/users/${encodeURIComponent(uid)}`, { method: 'PUT', body: JSON.stringify({ password }) });
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete') {
      if (!uid) return res.status(400).json({ error: 'uid manquant.' });
      if (uid === requester.id) return res.status(400).json({ error: 'Impossible de supprimer son propre compte.' });
      await supabase(`/auth/v1/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'create') {
      if (!email || !password || !name || !role) return res.status(400).json({ error: 'Nom, e-mail, rôle et mot de passe requis.' });
      const created = await supabase('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: String(email).trim(), password, email_confirm: true })
      });
      const id = created?.id || created?.user?.id;
      if (!id) throw new Error('Utilisateur Supabase créé sans UUID.');
      try {
        await supabase('/rest/v1/profiles', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ id, name, email: String(email).trim(), role, color: color || '#2B4C7E', initials: initials || String(name).slice(0, 2).toUpperCase(), photo: '' })
        });
      } catch (profileError) {
        await supabase(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
        throw profileError;
      }
      return res.status(201).json({ ok: true, user: { id, email: String(email).trim(), name, role } });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (error) {
    console.error('admin-manage-supabase-account error', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur inconnue.' });
  }
};
