// Task'in — Admin Settings via Supabase REST.
// La clé de service reste exclusivement côté serveur.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ALLOWED_ORIGIN = String(process.env.TASKIN_ALLOWED_ORIGIN || process.env.APP_ORIGIN || '').replace(/\/+$/, '');
const ROLES = ['admin', 'supervisor', 'formateur', 'agent'];

function cors(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function fail(res, status, error) { return res.status(status).json({ ok: false, error }); }
function str(value, max = 5000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function num(value, min, max) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function json(res, data) { return res.status(200).json({ ok: true, ...data }); }
function headers(extra = {}) { return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...extra }; }

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: headers(options.headers) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.msg || payload?.error_description || `Supabase HTTP ${response.status}`);
  return payload;
}
async function requester(accessToken) {
  if (!accessToken) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` } });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return null;
  const profiles = await request(`/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  return profiles?.[0]?.role === 'admin' ? user : null;
}
async function setting(key) {
  const rows = await request(`/rest/v1/settings?select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`);
  return rows?.[0]?.value ?? {};
}
async function saveSetting(key, value, uid) {
  await request('/rest/v1/settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value, updated_by: uid, updated_at: new Date().toISOString() }) });
}
async function saveProfile(uid, patch) {
  await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return fail(res, 405, 'Méthode non autorisée.');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return fail(res, 503, 'Configuration Supabase serveur manquante.');
  try {
    const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const admin = await requester(accessToken);
    if (!admin) return fail(res, 403, 'Seuls les administrateurs Supabase peuvent effectuer cette action.');
    const body = req.body || {};
    const action = str(body.action, 80);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const now = new Date().toISOString();

    if (action === 'upsertProcedure') {
      const title = str(payload.title, 200), content = str(payload.content, 20000);
      if (!title || !content) return fail(res, 400, 'Titre et contenu requis.');
      const row = { title, description: content.slice(0, 500), sections: [{ type: 'text', content }], status: ['draft', 'published', 'archived'].includes(payload.status) ? payload.status : 'draft', owner_id: admin.id, updated_at: now };
      if (str(payload.id, 80)) await request(`/rest/v1/procedures?id=eq.${encodeURIComponent(payload.id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      else await request('/rest/v1/procedures', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      return json(res, { message: 'Procédure enregistrée.' });
    }
    if (action === 'updateAiConfig') {
      const module = str(payload.module, 80), reviewMode = str(payload.reviewMode, 80);
      await saveSetting('ai', { module, reviewMode }, admin.id);
      return json(res, { message: 'Préférences IA enregistrées.' });
    }
    if (action === 'updateGoals') {
      const target = { count: num(payload.count, 0, 100000), total: num(payload.total, 0, 1000000), dmt: num(payload.dmt, 0, 1440), frt: num(payload.frt, 0, 1440) };
      if (Object.values(target).some(value => value === null)) return fail(res, 400, 'Objectifs numériques invalides.');
      // Source de vérité consommée par loadGoals() et tous les calculs KPI/DMT/FRT.
      await saveSetting('goals', target, admin.id);
      return json(res, { message: 'Objectifs enregistrés.', value: target });
    }
    if (action === 'upsertTreatmentType') {
      const name = str(payload.name, 100);
      if (!name) return fail(res, 400, 'Nom de traitement requis.');
      const stored = await setting('treatments');
      const current = stored && typeof stored === 'object' && Array.isArray(stored.list) ? stored.list : (Array.isArray(stored) ? stored : []);
      const types = current.map(item => typeof item === 'string' ? item : str(item?.name, 100)).filter(Boolean);
      const next = [...types.filter(item => item !== name), name].slice(-200);
      // customTreatmentTypes est chargé depuis settings.treatments.list.
      await saveSetting('treatments', { list: next }, admin.id);
      return json(res, { message: 'Type de traitement enregistré.', value: next });
    }
    if (action === 'updateShift') {
      const uid = str(payload.uid, 80), shift = str(payload.shift, 120);
      if (!uid || !shift) return fail(res, 400, 'Compte et shift requis.');
      const shifts = await setting('account_shifts');
      await saveSetting('account_shifts', { ...(shifts && typeof shifts === 'object' ? shifts : {}), [uid]: shift }, admin.id);
      return json(res, { message: 'Shift enregistré.' });
    }
    if (action === 'updateAccountAccess') {
      const uid = str(payload.uid, 80), role = str(payload.role, 30);
      if (!uid || !ROLES.includes(role)) return fail(res, 400, 'Rôle invalide.');
      if (uid === admin.id && role !== 'admin') return fail(res, 400, 'Impossible de retirer son propre accès Admin.');
      await saveProfile(uid, { role });
      return json(res, { message: 'Accès du compte enregistré.' });
    }
    if (action === 'importProcedureFile') {
      const name = str(payload.name, 200), mime = str(payload.mime, 120), contentBase64 = str(payload.contentBase64, 700000);
      if (!name || !contentBase64) return fail(res, 400, 'Fichier invalide.');
      if (contentBase64.length > 700000) return fail(res, 413, 'Fichier trop volumineux pour cet import.');
      const imports = await setting('procedure_imports');
      const id = crypto.randomUUID();
      const next = Array.isArray(imports) ? imports : [];
      next.push({ id, name, mime, contentBase64, status: 'received', createdAt: now, createdBy: admin.id });
      await saveSetting('procedure_imports', next.slice(-10), admin.id);
      return json(res, { id, message: 'Fichier reçu.' });
    }
    return fail(res, 400, 'Action Settings inconnue.');
  } catch (error) {
    console.error('admin-settings error', error);
    return fail(res, 500, error.message || 'Erreur serveur Supabase.');
  }
};
