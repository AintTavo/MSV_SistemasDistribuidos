// ============ El mapa del aventurero SPA ============
const App = (() => {
  const root = document.getElementById('app');
  let mode = localStorage.getItem('patavo_mode') || 'user'; // 'user' | 'dm' (intercambiable)
  let online = navigator.onLine;
  let offlineReady = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // -------- Capa de datos (online -> API, offline -> SQLite) --------
  const Data = {
    async characters() { return online ? API.get('/characters') : Offline.getCharacters(); },
    async character(id) {
      if (online) return API.get('/characters/' + id);
      return Offline.getCharacters().find((c) => c.id == id) || null;
    },
    async items(charId) { return online ? API.get(`/characters/${charId}/items`) : Offline.getItems(charId); },
    async parties() { return online ? API.get('/parties') : Offline.getParties(); },
    async grimoire() { return online ? API.get('/dm/grimoire') : Offline.getGrimoire(); },
    async bestiary() { return online ? API.get('/dm/bestiary') : Offline.getBestiary(); },
    async stories(partyId) {
      if (online) return API.get('/dm/stories/party/' + partyId);
      return Offline.getStories().filter((s) => s.party_id == partyId);
    },
  };

  // -------- Modal --------
  function modal(title, bodyHtml, onMount) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h2>${esc(title)}</h2>${bodyHtml}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    if (onMount) onMount(bg.querySelector('.modal'), () => bg.remove());
    return bg;
  }

  // -------- Boot --------
  async function boot() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    try { await Offline.init(); offlineReady = true; } catch (e) { console.warn('offline no disponible', e); }

    window.addEventListener('online', async () => { online = true; netChanged(); await trySync(); });
    window.addEventListener('offline', () => { online = false; netChanged(); });
    window.addEventListener('hashchange', route);

    if (!API.token) return renderAuth();
    if (online) { await trySync(); }
    renderShell();
  }

  async function trySync() {
    if (!offlineReady || !online || !API.token) return;
    try {
      const flushed = await Offline.flush();
      if (flushed.applied) toast(`Sincronizados ${flushed.applied} cambios`);
      const snap = await API.get('/sync/pull');
      await Offline.saveSnapshot(snap);
    } catch (e) { console.warn('sync falló', e); }
  }

  function netChanged() {
    const pill = document.getElementById('net-pill');
    if (pill) {
      pill.className = 'net-pill ' + (online ? 'online' : 'offline');
      const n = offlineReady ? Offline.outboxCount() : 0;
      pill.textContent = online ? 'En línea' : `Sin conexión${n ? ' · ' + n + ' pend.' : ''}`;
    }
    route();
  }

  // -------- Auth --------
  function renderAuth() {
    root.innerHTML = `
      <div class="auth-wrap">
        <div class="card">
          <h1>⚔️ El mapa del aventurero</h1>
          <p class="meta" style="text-align:center">Gestor de parties de Dungeons & Dragons</p>
          <div id="auth-form"></div>
          <p class="meta" style="text-align:center;margin-top:1rem">
            <a href="#" id="toggle-auth">¿No tienes cuenta? Regístrate</a>
          </p>
        </div>
      </div>`;
    let isLogin = true;
    const render = () => {
      document.getElementById('auth-form').innerHTML = `
        <div class="field"><label>Usuario</label><input id="au-user"></div>
        ${isLogin ? '' : '<div class="field"><label>Email (opcional)</label><input id="au-email"></div>'}
        <div class="field"><label>Contraseña</label><input id="au-pass" type="password"></div>
        <button class="primary" id="au-submit" style="width:100%">${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
        <p class="meta" id="au-err" style="color:#e0708a"></p>`;
      document.getElementById('au-submit').onclick = submit;
    };
    document.getElementById('toggle-auth').onclick = (e) => {
      e.preventDefault(); isLogin = !isLogin;
      document.getElementById('toggle-auth').textContent = isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra';
      render();
    };
    async function submit() {
      const username = document.getElementById('au-user').value.trim();
      const password = document.getElementById('au-pass').value;
      const email = isLogin ? null : (document.getElementById('au-email').value || null);
      try {
        const res = await API.post(isLogin ? '/auth/login' : '/auth/register', { username, password, email });
        API.setSession(res.token, res.user);
        await trySync();
        renderShell();
      } catch (e) { document.getElementById('au-err').textContent = e.message; }
    }
    render();
  }

  // -------- Shell (topbar + nav) --------
  function renderShell() {
    const userNav = `
      <div class="group">Modo Usuario</div>
      <a href="#/characters" data-route="characters">📜 Personajes</a>
      <a href="#/parties" data-route="parties">🎲 Mis mesas</a>`;
    const dmNav = `
      <div class="group">Modo Dungeon Master</div>
      <a href="#/parties" data-route="parties">🎲 Mesas</a>
      <a href="#/stories" data-route="stories">📖 Historias</a>
      <a href="#/grimoire" data-route="grimoire">✨ Grimorio</a>
      <a href="#/bestiary" data-route="bestiary">🐉 Bestiario</a>`;
    root.innerHTML = `
      <header class="topbar">
        <span class="brand">⚔️ El mapa del aventurero <small>· ${esc(API.user.username)}</small></span>
        <div class="mode-toggle">
          <button data-mode="user" class="${mode === 'user' ? 'active' : ''}">Usuario</button>
          <button data-mode="dm" class="${mode === 'dm' ? 'active' : ''}">Dungeon Master</button>
        </div>
        <span class="spacer"></span>
        <span id="net-pill" class="net-pill ${online ? 'online' : 'offline'}">${online ? 'En línea' : 'Sin conexión'}</span>
        <button class="ghost small" id="btn-logout">Salir</button>
      </header>
      <div class="shell">
        <nav class="side">${mode === 'user' ? userNav : dmNav}</nav>
        <main class="content" id="view"></main>
      </div>`;
    root.querySelectorAll('.mode-toggle button').forEach((b) => {
      b.onclick = () => { mode = b.dataset.mode; localStorage.setItem('patavo_mode', mode); Dungeon.leave(); renderShell(); location.hash = mode === 'user' ? '#/characters' : '#/parties'; };
    });
    document.getElementById('btn-logout').onclick = () => { API.clear(); Dungeon.leave(); renderAuth(); };
    netChanged();
    if (!location.hash) location.hash = mode === 'user' ? '#/characters' : '#/parties';
    else route();
  }

  function setActiveNav(name) {
    document.querySelectorAll('nav.side a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  }

  // -------- Router --------
  async function route() {
    if (!API.token) return;
    const view = document.getElementById('view');
    if (!view) return;
    const hash = location.hash.slice(2); // sin '#/'
    const [path, param] = hash.split('/');
    Dungeon.leave();
    try {
      if (path === 'characters') { setActiveNav('characters'); return viewCharacters(view); }
      if (path === 'character') { return viewCharacterSheet(view, param); }
      if (path === 'parties') { setActiveNav('parties'); return viewParties(view); }
      if (path === 'stories') { setActiveNav('stories'); return viewStories(view, param); }
      if (path === 'grimoire') { setActiveNav('grimoire'); return viewGrimoire(view); }
      if (path === 'bestiary') { setActiveNav('bestiary'); return viewBestiary(view); }
      if (path === 'dungeon') { return viewDungeon(view, param); }
      view.innerHTML = '<div class="empty">Selecciona una sección</div>';
    } catch (e) {
      view.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  }

  // ======================= MODO USUARIO =======================
  async function viewCharacters(view) {
    const list = await Data.characters();
    view.innerHTML = `
      <div class="toolbar"><h1>📜 Mis personajes</h1><div class="spacer"></div>
        <button class="primary" id="new-char" ${online ? '' : 'disabled title="Crear requiere conexión"'}>+ Nuevo personaje</button></div>
      ${list.length ? `<div class="grid">${list.map(charCard).join('')}</div>` : '<div class="empty">Aún no tienes personajes.</div>'}`;
    view.querySelectorAll('[data-char]').forEach((c) => c.onclick = () => location.hash = '#/character/' + c.dataset.char);
    const nb = document.getElementById('new-char');
    if (nb) nb.onclick = () => editCharacterModal(null);
  }

  function charCard(c) {
    return `<div class="card" data-char="${c.id}" style="cursor:pointer">
      <h3>${esc(c.name)}</h3>
      <div class="meta">${esc(c.race)} ${esc(c.class)} · Nivel ${c.level}</div>
      <div class="row tight" style="margin-top:.5rem">
        <span class="badge">❤️ ${c.hp}/${c.max_hp}</span>
        <span class="badge">🛡️ CA ${c.ac}</span>
      </div></div>`;
  }

  function editCharacterModal(existing) {
    const c = existing || { name: '', race: '', class: '', level: 1, hp: 10, max_hp: 10, ac: 10, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, notes: '' };
    const s = c.stats || {};
    modal(existing ? 'Editar personaje' : 'Nuevo personaje', `
      <div class="field"><label>Nombre</label><input id="f-name" value="${esc(c.name)}"></div>
      <div class="row tight">
        <div class="field"><label>Raza</label><input id="f-race" value="${esc(c.race)}"></div>
        <div class="field"><label>Clase</label><input id="f-class" value="${esc(c.class)}"></div>
        <div class="field"><label>Nivel</label><input id="f-level" type="number" value="${c.level}" style="max-width:80px"></div>
      </div>
      <div class="row tight">
        <div class="field"><label>HP</label><input id="f-hp" type="number" value="${c.hp}" style="max-width:90px"></div>
        <div class="field"><label>HP máx</label><input id="f-maxhp" type="number" value="${c.max_hp}" style="max-width:90px"></div>
        <div class="field"><label>CA</label><input id="f-ac" type="number" value="${c.ac}" style="max-width:90px"></div>
      </div>
      <label>Estadísticas</label>
      <div class="stat-grid">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<div class="stat"><b>${k.toUpperCase()}</b><input id="f-${k}" type="number" value="${s[k] || 10}"></div>`).join('')}</div>
      <div class="field" style="margin-top:.8rem"><label>Notas</label><textarea id="f-notes">${esc(c.notes)}</textarea></div>
      <div class="row tight"><button class="primary" id="f-save">Guardar</button><button class="ghost" id="f-cancel">Cancelar</button></div>
    `, (m, close) => {
      m.querySelector('#f-cancel').onclick = close;
      m.querySelector('#f-save').onclick = async () => {
        const data = {
          name: m.querySelector('#f-name').value, race: m.querySelector('#f-race').value,
          class: m.querySelector('#f-class').value, level: +m.querySelector('#f-level').value,
          hp: +m.querySelector('#f-hp').value, max_hp: +m.querySelector('#f-maxhp').value,
          ac: +m.querySelector('#f-ac').value, notes: m.querySelector('#f-notes').value,
          stats: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => [k, +m.querySelector('#f-' + k).value])),
        };
        try {
          if (existing) {
            if (online) await API.put('/characters/' + existing.id, { ...existing, ...data });
            else { await Offline.updateCharacterLocal(existing.id, { ...existing, ...data }); toast('Guardado offline'); }
          } else {
            await API.post('/characters', data);
          }
          close(); route(); netChanged();
        } catch (e) { toast(e.message); }
      };
    });
  }

  async function viewCharacterSheet(view, id) {
    const c = await Data.character(id);
    if (!c) return view.innerHTML = '<div class="empty">Personaje no encontrado</div>';
    const items = await Data.items(id);
    const mod = (v) => { const m = Math.floor((v - 10) / 2); return (m >= 0 ? '+' : '') + m; };
    view.innerHTML = `
      <div class="toolbar"><a href="#/characters">&larr; Volver</a><div class="spacer"></div>
        <button class="small" id="edit-char">Editar</button>
        <button class="small danger" id="del-char" ${online ? '' : 'disabled'}>Borrar</button></div>
      <div class="card">
        <h1 style="margin:0">${esc(c.name)}</h1>
        <div class="meta">${esc(c.race)} ${esc(c.class)} · Nivel ${c.level}</div>
        <div class="row tight" style="margin:.6rem 0">
          <span class="badge">❤️ ${c.hp}/${c.max_hp}</span><span class="badge">🛡️ CA ${c.ac}</span>
        </div>
        <div class="stat-grid">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<div class="stat"><b>${k.toUpperCase()}</b>${(c.stats || {})[k] || 10}<div class="meta">${mod((c.stats || {})[k] || 10)}</div></div>`).join('')}</div>
        ${c.notes ? `<p style="margin-top:.8rem">${esc(c.notes)}</p>` : ''}
      </div>
      <div class="card" style="margin-top:1rem">
        <div class="toolbar"><h2 style="margin:0">🎒 Inventario</h2><div class="spacer"></div><button class="small primary" id="add-item">+ Objeto</button></div>
        <div id="inv-list">${items.length ? items.map((i) => invRow(i)).join('') : '<div class="empty">Sin objetos</div>'}</div>
      </div>`;
    document.getElementById('edit-char').onclick = () => editCharacterModal(c);
    const del = document.getElementById('del-char');
    if (del && online) del.onclick = async () => { if (confirm('¿Borrar personaje?')) { await API.del('/characters/' + id); location.hash = '#/characters'; } };
    document.getElementById('add-item').onclick = () => editItemModal(id, null);
    view.querySelectorAll('[data-item-edit]').forEach((b) => b.onclick = () => {
      const it = items.find((x) => x.id == b.dataset.itemEdit); editItemModal(id, it);
    });
    view.querySelectorAll('[data-item-del]').forEach((b) => b.onclick = async () => {
      const itemId = +b.dataset.itemDel;
      if (online) await API.del(`/characters/${id}/items/${itemId}`); else await Offline.deleteItemLocal(+id, itemId);
      route(); netChanged();
    });
  }

  function invRow(i) {
    return `<div class="row" style="border-bottom:1px solid var(--border);padding:.4rem 0">
      <div style="flex:2">${i.equipped ? '✅ ' : ''}<b>${esc(i.name)}</b> <span class="meta">x${i.quantity} · ${i.weight}kg</span><div class="meta">${esc(i.description || '')}</div></div>
      <div class="row tight" style="flex:0"><button class="small" data-item-edit="${i.id}">✎</button><button class="small danger" data-item-del="${i.id}">✕</button></div>
    </div>`;
  }

  function editItemModal(charId, existing) {
    const i = existing || { name: '', quantity: 1, weight: 0, equipped: false, description: '' };
    modal(existing ? 'Editar objeto' : 'Nuevo objeto', `
      <div class="field"><label>Nombre</label><input id="i-name" value="${esc(i.name)}"></div>
      <div class="row tight">
        <div class="field"><label>Cantidad</label><input id="i-qty" type="number" value="${i.quantity}" style="max-width:90px"></div>
        <div class="field"><label>Peso (kg)</label><input id="i-weight" type="number" step="0.1" value="${i.weight}" style="max-width:90px"></div>
        <div class="field"><label>Equipado</label><select id="i-equip"><option value="false">No</option><option value="true" ${i.equipped ? 'selected' : ''}>Sí</option></select></div>
      </div>
      <div class="field"><label>Descripción</label><textarea id="i-desc">${esc(i.description || '')}</textarea></div>
      <div class="row tight"><button class="primary" id="i-save">Guardar</button><button class="ghost" id="i-cancel">Cancelar</button></div>
    `, (m, close) => {
      m.querySelector('#i-cancel').onclick = close;
      m.querySelector('#i-save').onclick = async () => {
        const data = {
          name: m.querySelector('#i-name').value, quantity: +m.querySelector('#i-qty').value,
          weight: +m.querySelector('#i-weight').value, equipped: m.querySelector('#i-equip').value === 'true',
          description: m.querySelector('#i-desc').value,
        };
        try {
          if (existing) {
            if (online) await API.put(`/characters/${charId}/items/${existing.id}`, data);
            else await Offline.updateItemLocal(+charId, existing.id, data);
          } else {
            if (online) await API.post(`/characters/${charId}/items`, data);
            else await Offline.addItemLocal(+charId, data);
          }
          close(); route(); netChanged();
        } catch (e) { toast(e.message); }
      };
    });
  }

  // ======================= MESAS (compartido) =======================
  async function viewParties(view) {
    const list = await Data.parties();
    view.innerHTML = `
      <div class="toolbar"><h1>🎲 Mesas</h1><div class="spacer"></div>
        ${online ? '<button id="join-party">Unirme con código</button><button class="primary" id="new-party">+ Crear mesa</button>' : ''}</div>
      ${list.length ? `<div class="grid">${list.map(partyCard).join('')}</div>` : '<div class="empty">No perteneces a ninguna mesa.</div>'}`;
    if (online) {
      document.getElementById('new-party').onclick = () => modal('Crear mesa', `
        <div class="field"><label>Nombre de la mesa</label><input id="p-name"></div>
        <button class="primary" id="p-save">Crear</button>`, (m, close) => {
        m.querySelector('#p-save').onclick = async () => {
          await API.post('/parties', { name: m.querySelector('#p-name').value }); close(); route();
        };
      });
      document.getElementById('join-party').onclick = () => modal('Unirme a una mesa', `
        <div class="field"><label>Código</label><input id="p-code" style="text-transform:uppercase"></div>
        <button class="primary" id="p-join">Unirme</button>`, (m, close) => {
        m.querySelector('#p-join').onclick = async () => {
          try { await API.post('/parties/join', { code: m.querySelector('#p-code').value }); close(); route(); }
          catch (e) { toast(e.message); }
        };
      });
    }
    view.querySelectorAll('[data-dungeon]').forEach((b) => b.onclick = () => openDungeon(b.dataset.dungeon, b.dataset.isdm === '1'));
    view.querySelectorAll('[data-stories]').forEach((b) => b.onclick = () => location.hash = '#/stories/' + b.dataset.stories);
  }

  function partyCard(p) {
    const isDM = p.is_dm;
    return `<div class="card">
      <h3>${esc(p.name)} ${isDM ? '<span class="badge dm">DM</span>' : ''}</h3>
      <div class="meta">Código: <b>${esc(p.join_code)}</b>${p.member_count ? ' · ' + p.member_count + ' miembros' : ''}</div>
      <div class="row tight" style="margin-top:.6rem">
        ${mode === 'dm' && isDM ? `<button class="small" data-stories="${p.id}">📖 Historias</button>` : ''}
        ${online ? `<button class="small primary" data-dungeon="${p.id}" data-isdm="${isDM ? 1 : 0}">🗺️ Mazmorra</button>` : '<span class="meta">Mazmorra requiere conexión</span>'}
      </div></div>`;
  }

  // Modo mazmorra: el DM inicia/entra a la sala; el jugador entra a la activa.
  async function openDungeon(partyId, isDM) {
    if (!online) return toast('El modo mazmorra requiere conexión');
    try {
      let sessions = await API.get('/dungeon/sessions/party/' + partyId);
      let session = sessions[0];
      if (!session) {
        if (isDM) session = await API.post('/dungeon/sessions', { party_id: +partyId, name: 'Mazmorra' });
        else return toast('El DM aún no ha iniciado la sala');
      }
      location.hash = '#/dungeon/' + session.id;
    } catch (e) { toast(e.message); }
  }

  async function viewDungeon(view, sessionId) {
    if (!online) return view.innerHTML = '<div class="empty">🔒 El modo mazmorra no está disponible sin conexión.</div>';
    const session = await API.get('/dungeon/sessions/' + sessionId);
    Dungeon.mount(view, session);
  }

  // ======================= MODO DUNGEON MASTER =======================
  async function viewStories(view, partyId) {
    const parties = (await Data.parties()).filter((p) => p.is_dm);
    if (!partyId && parties.length) partyId = parties[0].id;
    const stories = partyId ? await Data.stories(partyId) : [];
    view.innerHTML = `
      <div class="toolbar"><h1>📖 Historias por mesa</h1><div class="spacer"></div>
        <select id="story-party" style="max-width:220px">${parties.map((p) => `<option value="${p.id}" ${p.id == partyId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        ${online && partyId ? '<button class="primary" id="new-story">+ Capítulo</button>' : ''}</div>
      ${parties.length ? '' : '<div class="empty">Crea una mesa (eres su DM) para escribir su historia.</div>'}
      <div class="grid">${stories.map(storyCard).join('')}</div>`;
    const sel = document.getElementById('story-party');
    if (sel) sel.onchange = () => location.hash = '#/stories/' + sel.value;
    const nb = document.getElementById('new-story');
    if (nb) nb.onclick = () => editStoryModal(partyId, null);
    view.querySelectorAll('[data-story]').forEach((b) => b.onclick = () => {
      const s = stories.find((x) => x.id == b.dataset.story); editStoryModal(partyId, s);
    });
  }

  function storyCard(s) {
    return `<div class="card" data-story="${s.id}" style="cursor:pointer">
      <h3>${esc(s.title)}</h3><div class="meta">${esc((s.content || '').slice(0, 140))}${(s.content || '').length > 140 ? '…' : ''}</div></div>`;
  }

  function editStoryModal(partyId, existing) {
    const s = existing || { title: '', content: '' };
    modal(existing ? 'Editar capítulo' : 'Nuevo capítulo', `
      <div class="field"><label>Título</label><input id="s-title" value="${esc(s.title)}"></div>
      <div class="field"><label>Contenido</label><textarea id="s-content" style="min-height:200px">${esc(s.content)}</textarea></div>
      <div class="row tight"><button class="primary" id="s-save">Guardar</button>${existing && online ? '<button class="danger" id="s-del">Borrar</button>' : ''}<button class="ghost" id="s-cancel">Cancelar</button></div>
    `, (m, close) => {
      m.querySelector('#s-cancel').onclick = close;
      m.querySelector('#s-save').onclick = async () => {
        const data = { title: m.querySelector('#s-title').value, content: m.querySelector('#s-content').value, party_id: +partyId };
        try {
          if (existing) {
            if (online) await API.put('/dm/stories/' + existing.id, data);
            else { await Offline.updateStoryLocal(existing.id, { ...existing, ...data }); toast('Guardado offline'); }
          } else await API.post('/dm/stories', data);
          close(); route(); netChanged();
        } catch (e) { toast(e.message); }
      };
      const db = m.querySelector('#s-del');
      if (db) db.onclick = async () => { await API.del('/dm/stories/' + existing.id); close(); route(); };
    });
  }

  async function viewGrimoire(view) {
    const spells = await Data.grimoire();
    view.innerHTML = `
      <div class="toolbar"><h1>✨ Grimorio rápido</h1><div class="spacer"></div>
        ${online ? '<button class="primary" id="new-spell">+ Hechizo</button>' : ''}</div>
      ${spells.length ? `<div class="grid">${spells.map(spellCard).join('')}</div>` : '<div class="empty">Tu grimorio está vacío.</div>'}`;
    const nb = document.getElementById('new-spell');
    if (nb) nb.onclick = () => editSpellModal(null);
    view.querySelectorAll('[data-spell]').forEach((b) => b.onclick = () => editSpellModal(spells.find((x) => x.id == b.dataset.spell)));
  }

  function spellCard(s) {
    return `<div class="card" data-spell="${s.id}" style="cursor:pointer">
      <h3>${esc(s.name)}</h3>
      <div class="meta">Nivel ${s.level} · ${esc(s.school)}</div>
      <div class="meta">⏱ ${esc(s.casting_time)} · 🎯 ${esc(s.range)} · ⏳ ${esc(s.duration)}</div>
      <p style="font-size:.85rem">${esc((s.description || '').slice(0, 120))}</p></div>`;
  }

  function editSpellModal(existing) {
    const s = existing || { name: '', level: 0, school: '', casting_time: '', range: '', components: '', duration: '', description: '' };
    modal(existing ? 'Editar hechizo' : 'Nuevo hechizo', `
      <div class="row tight"><div class="field"><label>Nombre</label><input id="g-name" value="${esc(s.name)}"></div>
        <div class="field"><label>Nivel</label><input id="g-level" type="number" value="${s.level}" style="max-width:70px"></div></div>
      <div class="row tight"><div class="field"><label>Escuela</label><input id="g-school" value="${esc(s.school)}"></div>
        <div class="field"><label>Tiempo</label><input id="g-time" value="${esc(s.casting_time)}"></div></div>
      <div class="row tight"><div class="field"><label>Alcance</label><input id="g-range" value="${esc(s.range)}"></div>
        <div class="field"><label>Componentes</label><input id="g-comp" value="${esc(s.components)}"></div>
        <div class="field"><label>Duración</label><input id="g-dur" value="${esc(s.duration)}"></div></div>
      <div class="field"><label>Descripción</label><textarea id="g-desc">${esc(s.description)}</textarea></div>
      <div class="row tight"><button class="primary" id="g-save">Guardar</button>${existing && online ? '<button class="danger" id="g-del">Borrar</button>' : ''}<button class="ghost" id="g-cancel">Cancelar</button></div>
    `, (m, close) => {
      m.querySelector('#g-cancel').onclick = close;
      m.querySelector('#g-save').onclick = async () => {
        const data = {
          name: m.querySelector('#g-name').value, level: +m.querySelector('#g-level').value, school: m.querySelector('#g-school').value,
          casting_time: m.querySelector('#g-time').value, range: m.querySelector('#g-range').value,
          components: m.querySelector('#g-comp').value, duration: m.querySelector('#g-dur').value, description: m.querySelector('#g-desc').value,
        };
        try {
          if (existing) {
            if (online) await API.put('/dm/grimoire/' + existing.id, data);
            else { await Offline.updateGrimoireLocal(existing.id, { ...existing, ...data }); toast('Guardado offline'); }
          } else await API.post('/dm/grimoire', data);
          close(); route(); netChanged();
        } catch (e) { toast(e.message); }
      };
      const db = m.querySelector('#g-del');
      if (db) db.onclick = async () => { await API.del('/dm/grimoire/' + existing.id); close(); route(); };
    });
  }

  async function viewBestiary(view) {
    const monsters = await Data.bestiary();
    view.innerHTML = `
      <div class="toolbar"><h1>🐉 Bestiario</h1><div class="spacer"></div>
        ${online ? '<button class="primary" id="new-mon">+ Monstruo</button>' : ''}</div>
      ${monsters.length ? `<div class="grid">${monsters.map(monsterCard).join('')}</div>` : '<div class="empty">Tu bestiario está vacío.</div>'}`;
    const nb = document.getElementById('new-mon');
    if (nb) nb.onclick = () => editMonsterModal(null);
    view.querySelectorAll('[data-mon]').forEach((b) => b.onclick = () => editMonsterModal(monsters.find((x) => x.id == b.dataset.mon)));
  }

  function monsterCard(m) {
    return `<div class="card" data-mon="${m.id}" style="cursor:pointer">
      <h3>${esc(m.name)}</h3>
      <div class="meta">${esc(m.type)} · CR ${esc(m.cr)}</div>
      <div class="row tight" style="margin-top:.4rem"><span class="badge">❤️ ${m.hp}</span><span class="badge">🛡️ CA ${m.ac}</span></div>
      <p style="font-size:.85rem">${esc((m.abilities || '').slice(0, 100))}</p></div>`;
  }

  function editMonsterModal(existing) {
    const m0 = existing || { name: '', type: '', cr: '0', hp: 1, ac: 10, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilities: '', description: '' };
    const s = m0.stats || {};
    modal(existing ? 'Editar monstruo' : 'Nuevo monstruo', `
      <div class="row tight"><div class="field"><label>Nombre</label><input id="m-name" value="${esc(m0.name)}"></div>
        <div class="field"><label>Tipo</label><input id="m-type" value="${esc(m0.type)}"></div>
        <div class="field"><label>CR</label><input id="m-cr" value="${esc(m0.cr)}" style="max-width:70px"></div></div>
      <div class="row tight"><div class="field"><label>HP</label><input id="m-hp" type="number" value="${m0.hp}" style="max-width:90px"></div>
        <div class="field"><label>CA</label><input id="m-ac" type="number" value="${m0.ac}" style="max-width:90px"></div></div>
      <label>Estadísticas</label>
      <div class="stat-grid">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<div class="stat"><b>${k.toUpperCase()}</b><input id="m-${k}" type="number" value="${s[k] || 10}"></div>`).join('')}</div>
      <div class="field" style="margin-top:.6rem"><label>Habilidades</label><textarea id="m-abil">${esc(m0.abilities)}</textarea></div>
      <div class="field"><label>Descripción</label><textarea id="m-desc">${esc(m0.description)}</textarea></div>
      <div class="row tight"><button class="primary" id="m-save">Guardar</button>${existing && online ? '<button class="danger" id="m-del">Borrar</button>' : ''}<button class="ghost" id="m-cancel">Cancelar</button></div>
    `, (mm, close) => {
      mm.querySelector('#m-cancel').onclick = close;
      mm.querySelector('#m-save').onclick = async () => {
        const data = {
          name: mm.querySelector('#m-name').value, type: mm.querySelector('#m-type').value, cr: mm.querySelector('#m-cr').value,
          hp: +mm.querySelector('#m-hp').value, ac: +mm.querySelector('#m-ac').value,
          stats: Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => [k, +mm.querySelector('#m-' + k).value])),
          abilities: mm.querySelector('#m-abil').value, description: mm.querySelector('#m-desc').value,
        };
        try {
          if (existing) {
            if (online) await API.put('/dm/bestiary/' + existing.id, data);
            else { await Offline.updateBestiaryLocal(existing.id, { ...existing, ...data }); toast('Guardado offline'); }
          } else await API.post('/dm/bestiary', data);
          close(); route(); netChanged();
        } catch (e) { toast(e.message); }
      };
      const db = mm.querySelector('#m-del');
      if (db) db.onclick = async () => { await API.del('/dm/bestiary/' + existing.id); close(); route(); };
    });
  }

  return { boot };
})();

App.boot();
