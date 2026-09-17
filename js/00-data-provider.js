// Task’in — fournisseur de données Supabase
// Supabase est l’unique fournisseur de production.
(function initTaskinDataProvider(global) {
  const config = global.TASKIN_SUPABASE_CONFIG || {};
  const baseUrl = String(config.url || '').replace(/\/+$/, '');
  const ACCESS_TOKEN_KEY = 'taskin_supabase_access_token';
  const REFRESH_TOKEN_KEY = 'taskin_supabase_refresh_token';
  const USER_KEY = 'taskin_supabase_user';

  function assertConfigured() {
    if (!baseUrl || !config.anonKey) throw new Error('Configuration Supabase incomplète.');
  }

  function restUrl(table, params = {}) {
    assertConfigured();
    const url = new URL(`${baseUrl}/rest/v1/${String(table).split('.').filter(Boolean).map(encodeURIComponent).join('.')}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  function authHeaders(headers = {}) {
    const merged = new Headers(headers);
    merged.set('apikey', config.anonKey);
    merged.set('Accept', 'application/json');
    const accessToken = global.localStorage?.getItem(ACCESS_TOKEN_KEY);
    if (accessToken) merged.set('Authorization', `Bearer ${accessToken}`);
    return merged;
  }

  function storeSession(session) {
    if (!session?.access_token) throw new Error('Session Supabase invalide.');
    global.localStorage?.setItem(ACCESS_TOKEN_KEY, session.access_token);
    if (session.refresh_token) global.localStorage?.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    else global.localStorage?.removeItem(REFRESH_TOKEN_KEY);
    if (session.user) global.localStorage?.setItem(USER_KEY, JSON.stringify(session.user));
    else global.localStorage?.removeItem(USER_KEY);
    return session;
  }

  async function parseResponse(response, label) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.message || payload?.hint || payload?.error_description || payload?.msg || `HTTP ${response.status}`;
      throw new Error(`Supabase ${label}: ${detail}`);
    }
    return payload;
  }

  async function request(table, options = {}, params = {}) {
    let response = await fetch(restUrl(table, params), { ...options, headers: authHeaders(options.headers) });
    if (response.status === 401 && getSession()?.refresh_token) {
      await refreshSession();
      response = await fetch(restUrl(table, params), { ...options, headers: authHeaders(options.headers) });
    }
    return parseResponse(response, table);
  }

  async function signIn(email, password) {
    assertConfigured();
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password })
    });
    const session = await parseResponse(response, 'Auth');
    return storeSession(session);
  }

  async function refreshSession() {
    assertConfigured();
    const refreshToken = global.localStorage?.getItem(REFRESH_TOKEN_KEY) || '';
    if (!refreshToken) throw new Error('Refresh token Supabase absent.');
    const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    try {
      return storeSession(await parseResponse(response, 'Refresh Auth'));
    } catch (error) {
      signOut();
      throw error;
    }
  }

  async function getUser() {
    assertConfigured();
    const session = getSession();
    if (!session?.access_token) return null;
    let response = await fetch(`${baseUrl}/auth/v1/user`, { headers: authHeaders() });
    if (response.status === 401 && session.refresh_token) {
      await refreshSession();
      response = await fetch(`${baseUrl}/auth/v1/user`, { headers: authHeaders() });
    }
    if (response.status === 401) {
      signOut();
      return null;
    }
    const user = await parseResponse(response, 'User');
    if (!user?.id) {
      signOut();
      return null;
    }
    global.localStorage?.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  async function updatePassword(password) {
    assertConfigured();
    const session = getSession();
    if (!session?.access_token) throw new Error('Session Supabase absente.');
    let response = await fetch(`${baseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ password })
    });
    if (response.status === 401 && session.refresh_token) {
      await refreshSession();
      response = await fetch(`${baseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ password })
      });
    }
    await parseResponse(response, 'Password');
  }

  async function signOut() {
    const accessToken = global.localStorage?.getItem(ACCESS_TOKEN_KEY);
    try {
      if (accessToken && baseUrl && config.anonKey) {
        await fetch(`${baseUrl}/auth/v1/logout`, { method: 'POST', headers: authHeaders() });
      }
    } finally {
      global.localStorage?.removeItem(ACCESS_TOKEN_KEY);
      global.localStorage?.removeItem(REFRESH_TOKEN_KEY);
      global.localStorage?.removeItem(USER_KEY);
    }
  }

  function getSession() {
    const accessToken = global.localStorage?.getItem(ACCESS_TOKEN_KEY) || '';
    const refreshToken = global.localStorage?.getItem(REFRESH_TOKEN_KEY) || '';
    const rawUser = global.localStorage?.getItem(USER_KEY);
    let user = null;
    try { user = rawUser ? JSON.parse(rawUser) : null; } catch (_) { user = null; }
    return accessToken ? { access_token: accessToken, refresh_token: refreshToken, user } : null;
  }

  async function getProfile(id) {
    const rows = await request('profiles', {}, { select: '*', id: `eq.${encodeURIComponent(id)}`, limit: '1' });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  function toTaskinProfile(profile) {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name || 'Sans nom',
      email: profile.email || '',
      color: profile.color || '#2B4C7E',
      initials: profile.initials || '??',
      role: profile.role || 'agent',
      photo: profile.photo || ''
    };
  }

  const provider = Object.freeze({
    name: 'supabase',
    enabled: () => config.enabled === true,
    configured: () => Boolean(baseUrl && config.anonKey),
    signIn,
    signOut,
    refreshSession,
    getSession,
    getUser,
    updatePassword,
    async getCurrentProfile() {
      const user = await getUser();
      return user ? toTaskinProfile(await getProfile(user.id)) : null;
    },
    async listProfiles(limit = 200) {
      return request('profiles', {}, { select: '*', order: 'name.asc', limit: String(limit) });
    },
    async getSetting(key) {
      const rows = await request('settings', {}, { select: 'key,value', key: `eq.${encodeURIComponent(key)}`, limit: '1' });
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async upsertSetting(key, value, updatedBy) {
      return request('settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ key, value, updated_by: updatedBy || null })
      });
    },
    async updateProfile(id, profile) {
      return request('profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(profile)
      }, { id: `eq.${encodeURIComponent(id)}` });
    },
    async listTable(table, limit = 500) {
      return request(table, {}, { select: '*', limit: String(limit) });
    },
    async insertRow(table, row) {
      return request(table, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) });
    },
    async updateRow(table, id, row) {
      return request(table, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) }, { id: `eq.${encodeURIComponent(id)}` });
    },
    async deleteRow(table, id) {
      return request(table, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, { id: `eq.${encodeURIComponent(id)}` });
    },
    async list(table, select = '*', limit = 20) {
      return request(table, {}, { select, limit: String(limit) });
    },
    async listTimeEntries(limit = 100) {
      return request('time_entries', {}, { select: '*', order: 'started_at.desc', limit: String(limit) });
    },
    async listActiveTimers(limit = 100) {
      return request('active_timers', {}, { select: '*', limit: String(limit) });
    },
    async insertTimeEntry(entry) {
      return request('time_entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(entry)
      });
    },
    async deleteTimeEntry(id) {
      return request('time_entries', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, { id: `eq.${encodeURIComponent(id)}` });
    },
    async upsertActiveTimer(timer) {
      return request('active_timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(timer)
      });
    },
    async removeActiveTimer(agentId) {
      return request('active_timers', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, { agent_id: `eq.${encodeURIComponent(agentId)}` });
    },
    async health() {
      const started = performance.now();
      await request('profiles', {}, { select: 'id', limit: '1' });
      return { ok: true, provider: 'supabase', latencyMs: Math.round(performance.now() - started) };
    }
  });

  global.taskinDataProviders = Object.freeze({
    supabase: provider,
    active: () => provider
  });
  global.testTaskinSupabase = () => provider.health();
})(window);
