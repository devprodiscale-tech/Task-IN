// Task'in extension - client Supabase centralise.
(function initSupabaseClient(global) {
  const SUPABASE_URL = 'https://srwwyqmtwgxfblarwvhg.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_udYvF2o3_c0ws5gGDHuc7A_VGEpzghQ';
  const ACCESS_TOKEN_KEY = 'taskin_supabase_access_token';
  const REFRESH_TOKEN_KEY = 'taskin_supabase_refresh_token';
  const USER_KEY = 'taskin_supabase_user';
  let refreshPromise = null;

  async function readStorage() {
    return chrome.storage.local.get([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
  }

  async function storeSession(session) {
    if (!session?.access_token || !session?.user?.id) throw new Error('Session Supabase invalide.');
    await chrome.storage.local.set({
      [ACCESS_TOKEN_KEY]: session.access_token,
      [REFRESH_TOKEN_KEY]: session.refresh_token || '',
      [USER_KEY]: session.user
    });
    return session;
  }

  async function clearStorage() {
    // Session + données mémorisées pour l'affichage instantané (profil, tâches du jour…) :
    // rien ne doit rester pour la personne suivante sur un poste partagé.
    // La session est retirée en premier : le nettoyage du cache ne doit jamais l'empêcher.
    await chrome.storage.local.remove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
    try {
      const all = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(all || {}).filter(key => key.startsWith('taskin_cache_'));
      if (cacheKeys.length) await chrome.storage.local.remove(cacheKeys);
    } catch (error) {
      console.warn('Nettoyage du cache impossible :', error);
    }
  }

  async function parseResponse(response, label) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.msg || payload?.message || payload?.error_description || payload?.hint || `HTTP ${response.status}`;
      const error = new Error(`Supabase ${label}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  // Session réellement refusée par Supabase (jeton invalide ou révoqué). Une coupure réseau
  // (pas de statut) ou une panne serveur (5xx) ne doit jamais déconnecter l'extension.
  function isAuthRejection(error) {
    return [400, 401, 403].includes(Number(error?.status));
  }

  async function getSession() {
    const stored = await readStorage();
    if (!stored[ACCESS_TOKEN_KEY]) return null;
    return {
      access_token: stored[ACCESS_TOKEN_KEY],
      refresh_token: stored[REFRESH_TOKEN_KEY] || '',
      user: stored[USER_KEY] || null
    };
  }

  async function signIn(email, password) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password })
    });
    return storeSession(await parseResponse(response, 'Auth'));
  }

  // Échange un ticket à usage unique délivré par la web app (/api/extension-session)
  // contre une session Supabase propre à l'extension.
  async function signInWithTicket(tokenHash) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email', token_hash: String(tokenHash || '') })
    });
    return storeSession(await parseResponse(response, 'Ticket'));
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const session = await getSession();
      if (!session?.refresh_token) throw new Error('Refresh token Supabase absent.');
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      try {
        return await storeSession(await parseResponse(response, 'Refresh Auth'));
      } catch (error) {
        if (isAuthRejection(error)) await clearStorage();
        throw error;
      }
    })();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function request(endpoint, options = {}, retry = true) {
    const session = await getSession();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', SUPABASE_ANON_KEY);
    headers.set('Accept', 'application/json');
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

    const path = String(endpoint).startsWith('/') ? endpoint : `/${endpoint}`;
    const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    if (response.status === 401 && retry && session?.refresh_token) {
      await refreshSession();
      return request(endpoint, options, false);
    }
    return parseResponse(response, endpoint);
  }

  async function getUser() {
    const session = await getSession();
    if (!session?.access_token) return null;
    try {
      const user = await request('/auth/v1/user');
      await chrome.storage.local.set({ [USER_KEY]: user });
      return user;
    } catch (error) {
      if (isAuthRejection(error)) {
        await clearStorage();
        return null;
      }
      // Hors ligne ou serveur indisponible : on garde la session et le dernier utilisateur connu.
      console.warn('Vérification de session impossible, session conservée :', error);
      return session.user?.id ? session.user : null;
    }
  }

  async function getProfile(userId) {
    const rows = await request(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`);
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function signOut() {
    const session = await getSession();
    try {
      if (session?.access_token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` }
        });
      }
    } finally {
      await clearStorage();
    }
  }

  global.supabaseClient = Object.freeze({
    url: SUPABASE_URL,
    signIn,
    signInWithTicket,
    getSession,
    getUser,
    refreshSession,
    signOut,
    request,
    getProfile
  });
})(typeof window !== 'undefined' ? window : self);
