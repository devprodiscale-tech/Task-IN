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
    await chrome.storage.local.remove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
  }

  async function parseResponse(response, label) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.msg || payload?.message || payload?.error_description || payload?.hint || `HTTP ${response.status}`;
      throw new Error(`Supabase ${label}: ${detail}`);
    }
    return payload;
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
        await clearStorage();
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
      await clearStorage();
      return null;
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
    getSession,
    getUser,
    refreshSession,
    signOut,
    request,
    getProfile
  });
})(window);
