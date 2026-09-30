// /api/extension-session.js
// Délivre à l'extension Chrome un ticket de connexion à usage unique pour l'utilisateur
// déjà connecté sur la web app. L'extension l'échange contre sa propre session Supabase
// (jetons indépendants : les renouvellements de la web app ne déconnectent pas l'extension).

// URL racine du projet : tolère une variable saisie avec /rest/v1 ou /auth/v1 à la fin.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALLOWED_ORIGIN = String(process.env.TASKIN_ALLOWED_ORIGIN || '').replace(/\/+$/, '');

function adminHeaders(extra = {}) {
  return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: adminHeaders(options.headers) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || `Supabase HTTP ${response.status}`);
  return payload;
}

async function requesterUser(accessToken) {
  if (!accessToken) return null;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` } });
  const user = await userResponse.json().catch(() => null);
  return userResponse.ok && user?.id && user?.email ? user : null;
}

module.exports = async (req, res) => {
  const requestOrigin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (ALLOWED_ORIGIN && requestOrigin === ALLOWED_ORIGIN) res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Configuration Supabase serveur manquante.' });

  try {
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await requesterUser(accessToken);
    if (!user) return res.status(401).json({ error: 'Session web app invalide ou expirée.' });

    const profiles = await supabase(`/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    if (!Array.isArray(profiles) || !profiles.length) return res.status(403).json({ error: 'Profil Supabase introuvable.' });

    // generate_link n'envoie aucun e-mail : il renvoie seulement le jeton haché à usage unique.
    const link = await supabase('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: user.email }) });
    const tokenHash = link?.hashed_token || link?.properties?.hashed_token;
    if (!tokenHash) throw new Error('Ticket de connexion non généré.');

    return res.status(200).json({ ok: true, tokenHash, userId: user.id });
  } catch (error) {
    console.error('extension-session error', error);
    return res.status(500).json({ error: error.message || 'Erreur serveur inconnue.' });
  }
};
