// Task'in — Admin Settings via Supabase REST.
// La clé de service reste exclusivement côté serveur.
// URL racine du projet : tolère une variable saisie avec /rest/v1 ou /auth/v1 à la fin.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
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
// { user } si administrateur ; { status: 401 } si la session est absente ou expirée ; { status: 403 } sinon.
async function requester(accessToken) {
  if (!accessToken) return { status: 401 };
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` } });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return { status: 401 };
  const profiles = await request(`/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  return profiles?.[0]?.role === 'admin' ? { user } : { status: 403 };
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
    const auth = await requester(accessToken);
    if (auth.status === 401) return fail(res, 401, 'Session expirée : reconnecte-toi.');
    if (auth.status === 403) return fail(res, 403, 'Seuls les administrateurs peuvent effectuer cette action.');
    const admin = auth.user;
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
      // Objectifs par pôle (FO / BO / Reconf) : un champ vide = même valeur que l'objectif global.
      // Sans « poles » dans la requête, les objectifs par pôle déjà enregistrés sont conservés.
      const limits = { count: 100000, total: 1000000, dmt: 1440, frt: 1440 };
      let poles;
      if (payload.poles && typeof payload.poles === 'object') {
        poles = {};
        for (const pole of ['fo', 'bo', 'reconf']) {
          const src = payload.poles[pole] && typeof payload.poles[pole] === 'object' ? payload.poles[pole] : {};
          const clean = {};
          for (const key of Object.keys(limits)) {
            if (src[key] === '' || src[key] === null || src[key] === undefined) continue;
            const value = num(src[key], 0, limits[key]);
            if (value === null) return fail(res, 400, `Objectif ${key} invalide pour le pôle ${pole.toUpperCase()}.`);
            clean[key] = value;
          }
          if (Object.keys(clean).length) poles[pole] = clean;
        }
      } else {
        const stored = await setting('goals');
        poles = stored && typeof stored.poles === 'object' ? stored.poles : {};
      }
      const value = { ...target, poles };
      // Source de vérité consommée par loadGoals() et tous les calculs KPI/DMT/FRT.
      await saveSetting('goals', value, admin.id);
      return json(res, { message: 'Objectifs enregistrés.', value });
    }
    if (action === 'purgeAgentData') {
      // Efface les données d'un compte (le compte lui-même est conservé).
      // dryRun = true : renvoie seulement le nombre de lignes concernées.
      const uid = str(payload.uid, 64);
      if (!/^[0-9a-f-]{36}$/i.test(uid)) return fail(res, 400, 'Compte invalide.');
      const profile = await request(`/rest/v1/profiles?select=id,name&id=eq.${uid}&limit=1`);
      if (!profile?.[0]) return fail(res, 404, 'Compte introuvable.');
      const mode = ['all', 'before', 'demo'].includes(payload.mode) ? payload.mode : 'all';
      const beforeMs = Date.parse(str(payload.before, 40));
      if (mode === 'before' && !Number.isFinite(beforeMs)) return fail(res, 400, 'Date limite invalide.');
      const before = mode === 'before' ? new Date(beforeMs).toISOString() : '';
      const scopes = Array.isArray(payload.scopes) ? payload.scopes.filter(s => ['entries', 'timer', 'sessions', 'quality', 'training'].includes(s)) : [];
      if (!scopes.length) return fail(res, 400, 'Choisis au moins un type de données.');
      // Chaque cible : table, colonne de date pour « avant le », filtre « démo » (null = rien à effacer en mode démo).
      const targets = {
        entries: [['time_entries', 'started_at', 'id=like.demo-*']],
        timer: [['active_timers', 'started_at', null]],
        sessions: [['agent_sessions', 'created_at', null]],
        quality: [['coaching_reviews', 'created_at', 'data->>demo=eq.true'], ['coaching_sheets', 'created_at', 'data->>demo=eq.true'], ['complex_cases', 'created_at', 'data->>demo=eq.true']],
        training: [['training_progress', 'updated_at', null], ['training_acknowledgements', 'acknowledged_at', null]],
      };
      const counts = {};
      for (const scope of scopes) {
        counts[scope] = 0;
        for (const [table, dateCol, demoFilter] of targets[scope]) {
          if (mode === 'demo' && !demoFilter) continue;
          const filters = [`agent_id=eq.${uid}`];
          if (mode === 'before') filters.push(`${dateCol}=lt.${encodeURIComponent(before)}`);
          if (mode === 'demo') { const [key, value] = demoFilter.split('='); filters.push(`${encodeURIComponent(key)}=${value}`); }
          const key = table === 'active_timers' ? 'agent_id' : 'id'; // active_timers n'a pas de colonne id
          const query = `/rest/v1/${table}?select=${key}&${filters.join('&')}`;
          const rows = payload.dryRun
            ? await request(`${query}&limit=100000`)
            : await request(query, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
          counts[scope] += Array.isArray(rows) ? rows.length : 0;
        }
      }
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      return json(res, { message: payload.dryRun ? `${total} ligne(s) concernée(s).` : `${total} ligne(s) effacée(s).`, counts, total, dryRun: !!payload.dryRun });
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
