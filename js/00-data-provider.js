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

  // Un seul renouvellement à la fois : Supabase invalide l'ancien refresh token à chaque rotation,
  // deux renouvellements simultanés déconnecteraient l'utilisateur.
  let refreshInFlight = null;
  function refreshSession() {
    if (!refreshInFlight) refreshInFlight = doRefreshSession().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  function tokenExpiresAt(token) {
    try {
      const payload = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return Number(payload.exp) * 1000 || 0;
    } catch (_) { return 0; }
  }

  // Jeton d'accès valide pour les API serveur (/api/*) : renouvelé s'il expire dans la minute.
  async function getFreshAccessToken() {
    const session = getSession();
    if (!session?.access_token) return '';
    if (session.refresh_token && tokenExpiresAt(session.access_token) - Date.now() < 60000) {
      try { await refreshSession(); } catch (_) { return ''; }
    }
    return getSession()?.access_token || '';
  }

  // fetch vers une API serveur avec la session Supabase ; en cas de 401, renouvelle et réessaie une fois.
  async function authFetch(url, init = {}) {
    const send = token => {
      const headers = new Headers(init.headers || {});
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    };
    let response = await send(await getFreshAccessToken());
    if (response.status === 401 && getSession()?.refresh_token) {
      try { await refreshSession(); } catch (_) { return response; }
      response = await send(getSession()?.access_token || '');
    }
    return response;
  }

  async function doRefreshSession() {
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
      // Déconnexion seulement si Supabase refuse la session, pas sur une panne serveur passagère.
      if ([400, 401, 403].includes(response.status)) signOut();
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
    const rows = await request('profiles', {}, { select: '*', id: `eq.${id}`, limit: '1' });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  function toTaskinProfile(profile) {
    if (!profile) return null;
    return {
      id: profile.id,
      name: profile.name || 'Sans nom',
      email: profile.email || '',
      // Couleur et photo finissent dans des attributs style : on n'accepte que des valeurs sûres.
      color: /^#[0-9a-f]{3,8}$/i.test(String(profile.color || '')) ? profile.color : '#2B4C7E',
      initials: profile.initials || '??',
      role: profile.role || 'agent',
      photo: /^(https:\/\/[^\s"'()<>\\]+|data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+)$/.test(String(profile.photo || '')) ? profile.photo : '',
      pole: profile.pole || ''
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
    getFreshAccessToken,
    authFetch,
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
      const rows = await request('settings', {}, { select: 'key,value', key: `eq.${key}`, limit: '1' });
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
      }, { id: `eq.${id}` });
    },
    async listTable(table, limit = 500, order = '') {
      const params = { select: '*', limit: String(limit) };
      if (order) params.order = order;
      return request(table, {}, params);
    },
    async insertRow(table, row) {
      return request(table, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) });
    },
    async updateRow(table, id, row) {
      return request(table, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) }, { id: `eq.${id}` });
    },
    async deleteRow(table, id) {
      return request(table, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, { id: `eq.${id}` });
    },
    async list(table, select = '*', limit = 20) {
      return request(table, {}, { select, limit: String(limit) });
    },
    // Lecture paginée : Supabase plafonne chaque réponse, on enchaîne les pages pour ne
    // jamais tronquer l'historique (stats et moyennes justes quel que soit le volume).
    async listTimeEntries({ pageSize = 1000, maxRows = 50000 } = {}) {
      // On avance du nombre de lignes réellement reçues et on s'arrête sur une page vide :
      // robuste même si le plafond serveur (max-rows) est inférieur à pageSize.
      const all = [];
      let previousFirstId = null;
      while (all.length < maxRows) {
        const page = await request('time_entries', {}, { select: '*', order: 'started_at.desc,id.desc', limit: String(pageSize), offset: String(all.length) });
        if (!Array.isArray(page) || !page.length) break;
        // Garde-fou : si le serveur ignore le décalage, la même page revient en boucle.
        if (previousFirstId !== null && page[0]?.id === previousFirstId) break;
        previousFirstId = page[0]?.id ?? null;
        all.push(...page);
      }
      if (all.length >= maxRows) console.warn(`time_entries : limite de ${maxRows} lignes atteinte, historique plus ancien non chargé.`);
      return all;
    },
    async listActiveTimers(limit = 100) {
      return request('active_timers', {}, { select: '*', limit: String(limit) });
    },
    async getActiveTimer(agentId) {
      return request('active_timers', {}, { select: '*', agent_id: `eq.${agentId}`, limit: '1' });
    },
    async insertTimeEntry(entry) {
      return request('time_entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(entry)
      });
    },
    // Supabase ne signale pas d'erreur quand les règles d'accès bloquent une modification :
    // il répond simplement « 0 ligne ». On demande les lignes touchées pour le détecter.
    async deleteTimeEntry(id) {
      const rows = await request('time_entries', { method: 'DELETE', headers: { Prefer: 'return=representation' } }, { id: `eq.${id}` });
      if (!Array.isArray(rows) || !rows.length) throw new Error('Supabase time_entries: suppression refusée ou entrée introuvable.');
      return rows;
    },
    async updateTimeEntry(id, patch) {
      const rows = await request('time_entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      }, { id: `eq.${id}` });
      if (!Array.isArray(rows) || !rows.length) throw new Error('Supabase time_entries: modification refusée ou entrée introuvable.');
      return rows;
    },
    async upsertActiveTimer(timer) {
      return request('active_timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(timer)
      });
    },
    async removeActiveTimer(agentId) {
      return request('active_timers', { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, { agent_id: `eq.${agentId}` });
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
