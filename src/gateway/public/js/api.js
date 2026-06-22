// Cliente HTTP + estado de sesión/red.
const API = (() => {
  let token = localStorage.getItem('patavo_token') || null;
  let user = JSON.parse(localStorage.getItem('patavo_user') || 'null');

  function setSession(t, u) {
    token = t; user = u;
    localStorage.setItem('patavo_token', t);
    localStorage.setItem('patavo_user', JSON.stringify(u));
  }
  function clear() {
    token = null; user = null;
    localStorage.removeItem('patavo_token');
    localStorage.removeItem('patavo_user');
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
