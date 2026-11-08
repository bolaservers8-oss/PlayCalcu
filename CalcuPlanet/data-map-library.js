(function (global) {
  'use strict';

  const CACHE_KEY = 'calcuPlanetDataMapsV1';
  const AUTH_KEY = 'calcuPlanetDataMapEditorAuthV1';

  function getConfig() {
    const config = global.DATA_MAP_CONFIG || {};
    return {
      url: String(config.supabaseUrl || '').replace(/\/+$/, ''),
      key: String(config.supabaseAnonKey || '')
    };
  }

  function configured() {
    const config = getConfig();
    return Boolean(config.url && config.key);
  }

  function cacheMaps(maps) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(maps));
      return true;
    } catch (error) {
      console.warn('No se pudo actualizar la caché local de mapas.', error);
      return false;
    }
  }

  function readCache() {
    try {
      const maps = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(maps) ? maps.filter((map) => DataMapFormat.validateMap(map).valid) : [];
    } catch (error) {
      console.warn('La caché local de mapas está dañada y no pudo leerse.', error);
      return [];
    }
  }

  function saveLocalMap(map) {
    const validation = DataMapFormat.validateMap(map);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const maps = readCache().filter((cached) => cached.id !== map.id);
    maps.push(map);
    if (!cacheMaps(maps)) throw new Error('El navegador no pudo guardar el mapa en la caché local.');
  }

  async function request(path, options = {}) {
    if (!configured()) throw new Error('Configura supabaseUrl y supabaseAnonKey en data-map-config.js.');
    const config = getConfig();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', config.key);
    headers.set('Content-Type', 'application/json');
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${config.key}`);
    const response = await fetch(`${config.url}${path}`, { ...options, headers });
    const body = await response.text();
    let data = null;
    if (body) {
      try { data = JSON.parse(body); } catch { data = body; }
    }
    if (!response.ok) {
      const message = data && (data.msg || data.message || data.error_description || data.error) || response.statusText;
      throw new Error(`Supabase (${response.status}): ${message}`);
    }
    return data;
  }

  function getAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); }
    catch (error) {
      console.warn('La sesión de publicación no pudo leerse.', error);
      return null;
    }
  }

  function setAuth(session) {
    if (!session || !session.access_token) throw new Error('Supabase no devolvió una sesión válida.');
    if (!session.expires_at && session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
    }
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return session;
  }

  async function authRequest(path, payload) {
    return request(`/auth/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  async function signUp(email, password) {
    const result = await authRequest('/signup', { email, password });
    if (result.access_token) return setAuth(result);
    return { confirmationRequired: true };
  }

  async function signIn(email, password) {
    return setAuth(await authRequest('/token?grant_type=password', { email, password }));
  }

  function signOut() {
    localStorage.removeItem(AUTH_KEY);
  }

  async function refreshAuth() {
    const session = getAuth();
    if (!session) throw new Error('Inicia sesión con una cuenta de editor para publicar.');
    if (session.expires_at && session.expires_at * 1000 > Date.now() + 60000) return session;
    if (!session.refresh_token) throw new Error('La sesión expiró. Inicia sesión de nuevo.');
    const refreshed = await authRequest('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    return setAuth(refreshed);
  }

  async function listMaps(options = {}) {
    if (!configured()) return readCache();
    const query = '/rest/v1/data_maps?select=id,name,version,updated_at,data&published=eq.true&order=updated_at.desc';
    const rows = await request(query);
    const remoteMaps = (Array.isArray(rows) ? rows : []).map((row) => row.data)
      .filter((map) => DataMapFormat.validateMap(map).valid);
    const merged = new Map(readCache().map((map) => [map.id, map]));
    remoteMaps.forEach((map) => merged.set(map.id, map));
    const maps = Array.from(merged.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    if (!options.cacheOnly) cacheMaps(maps);
    return maps;
  }

  async function publishMap(map) {
    const validation = DataMapFormat.validateMap(map);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const session = await refreshAuth();
    const record = {
      id: map.id,
      name: map.name,
      version: map.version,
      updated_at: new Date().toISOString(),
      owner_id: session.user.id,
      published: true,
      data: map
    };
    const rows = await request('/rest/v1/data_maps?on_conflict=id', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(record)
    });
    const saved = Array.isArray(rows) && rows[0] ? rows[0].data : map;
    const maps = readCache().filter((cached) => cached.id !== saved.id);
    maps.push(saved);
    if (!cacheMaps(maps)) throw new Error('El mapa se publicó en Supabase, pero no pudo guardarse en la caché local.');
    return saved;
  }

  async function removeMap(id) {
    const session = await refreshAuth();
    await request(`/rest/v1/data_maps?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    cacheMaps(readCache().filter((map) => map.id !== id));
  }

  global.DataMapLibrary = {
    configured, getAuth, listMaps, publishMap, readCache, refreshAuth,
    removeMap, saveLocalMap, signIn, signOut, signUp
  };
})(window);
