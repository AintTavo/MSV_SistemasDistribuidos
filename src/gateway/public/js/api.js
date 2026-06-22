// Cliente HTTP + estado de sesión/red.
const API = (() => {
  let token = localStorage.getItem('mapa-aventurero_token') || null;
  let user = JSON.parse(localStorage.getItem('mapa-aventurero_user') || 'null');

  function setSession(t, u) {
    token = t; user = u;
    localStorage.setItem('mapa-aventurero_token', t);
    localStorage.setItem('mapa-aventurero_user', JSON.stringify(u));
  }
  function clear() {
    token = null; user = null;
    localStorage.removeItem('mapa-aventurero_token');
    localStorage.removeItem('mapa-aventurero_user');
  }

  async function req(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  return {
    get token() { return token; },
    get user() { return user; },
    setSession, clear,
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b),
    del: (p) => req('DELETE', p),
    online: () => navigator.onLine,
  };
})();
