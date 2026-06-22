// MODO MAZMORRA en tiempo real (requiere conexión; deshabilitado offline).
const Dungeon = (() => {
  let socket = null;
  let ctx = null, canvas = null;
  let drawing = false, last = null;
  let state = { isDM: false, sessionId: null, turnOrder: [], currentTurn: 0 };
  let refs = {};

  function connect() {
    if (socket && socket.connected) return socket;
    socket = io({ auth: { token: API.token } });
    return socket;
  }

  function drawStroke(s) {
    ctx.strokeStyle = s.color || '#c8a24a';
    ctx.lineWidth = s.width || 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x0 * canvas.width, s.y0 * canvas.height);
    ctx.lineTo(s.x1 * canvas.width, s.y1 * canvas.height);
    ctx.stroke();
  }

  function redraw(strokes) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    (strokes || []).forEach(drawStroke);
  }

  function logEntry(html, cls) {
    const div = document.createElement('div');
    div.className = 'entry ' + (cls || '');
    div.innerHTML = html;
    refs.log.prepend(div);
  }

  function renderTurns() {
    refs.turns.innerHTML = '';
    state.turnOrder.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'turn-item' + (i === state.currentTurn ? ' current' : '');
      d.textContent = `${t.name} (init ${t.init})`;
      refs.turns.appendChild(d);
    });
  }

  // Monta la vista de la sala dentro de `el`.
  function mount(el, session) {
    state.sessionId = session.id;
    state.isDM = API.user && session.dm_user_id === API.user.id;
    el.innerHTML = `
      <div class="toolbar">
        <h1 style="margin:0">🗺️ ${session.name}</h1>
        <span class="badge ${state.isDM ? 'dm' : ''}">${state.isDM ? 'Dungeon Master' : 'Jugador'}</span>
        <span class="badge" id="dg-presence">conectando…</span>
        <span class="badge" id="dg-status">${session.status}</span>
        <div class="spacer"></div>
        ${state.isDM ? '<button class="ghost small" id="dg-clear">Limpiar lienzo</button><button class="danger small" id="dg-close">Cerrar sala</button>' : ''}
      </div>
      <div class="dungeon-layout">
        <div>
          <canvas id="board" width="900" height="600"></canvas>
          ${state.isDM ? `<div class="row tight" style="margin-top:.5rem">
            <label style="margin:0">Color</label><input type="color" id="dg-color" value="#c8a24a" style="width:50px">
            <label style="margin:0">Grosor</label><input type="range" id="dg-width" min="1" max="12" value="3">
            <span class="meta">Dibuja la mazmorra arrastrando el cursor.</span>
          </div>` : '<p class="meta">Solo el DM puede dibujar.</p>'}
        </div>
        <div>
          <div class="card">
            <h3>Tirada de habilidad</h3>
            <div class="field"><label>Actor</label><input id="sc-actor" value="${API.user.username}"></div>
            <div class="row tight">
              <select id="sc-ability">
                <option value="str">Fuerza</option><option value="dex">Destreza</option>
                <option value="con">Constitución</option><option value="int">Inteligencia</option>
                <option value="wis">Sabiduría</option><option value="cha">Carisma</option>
              </select>
              <input id="sc-score" type="number" value="10" title="Puntuación" style="max-width:70px">
            </div>
            <div class="row tight" style="margin-top:.4rem">
              <input id="sc-prof" type="number" value="0" placeholder="Comp." title="Competencia" style="max-width:70px">
              <input id="sc-dc" type="number" placeholder="CD (opcional)" style="max-width:110px">
              <button class="primary small" id="sc-roll">Tirar d20</button>
            </div>
          </div>
          <div class="card" style="margin-top:.8rem">
            <h3>Turnos</h3>
            <div id="dg-turns"></div>
            ${state.isDM ? '<div class="row tight" style="margin-top:.5rem"><button class="small" id="dg-setturns">Definir desde party</button><button class="small primary" id="dg-next">Siguiente turno</button></div>' : ''}
          </div>
          <div class="card" style="margin-top:.8rem">
            <h3>Registro</h3>
            <div class="log" id="dg-log"></div>
          </div>
        </div>
      </div>`;

    canvas = el.querySelector('#board');
    ctx = canvas.getContext('2d');
    refs.log = el.querySelector('#dg-log');
    refs.turns = el.querySelector('#dg-turns');
    refs.presence = el.querySelector('#dg-presence');
    refs.status = el.querySelector('#dg-status');

    bindCanvas();
    bindControls(el);
    bindSocket(session);
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx / r.width, y: cy / r.height };
  }

  function bindCanvas() {
    if (!state.isDM) return;
    const start = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e) => {
      if (!drawing) return;
      const p = pos(e);
      const color = document.querySelector('#dg-color').value;
      const width = +document.querySelector('#dg-width').value;
      const stroke = { x0: last.x, y0: last.y, x1: p.x, y1: p.y, color, width };
      drawStroke(stroke);
      socket.emit('draw', { sessionId: state.sessionId, stroke });
      last = p;
      e.preventDefault();
    };
    const end = () => { drawing = false; };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', move);
    canvas.addEventListener('touchend', end);
  }

  function bindControls(el) {
    el.querySelector('#sc-roll').onclick = () => {
      socket.emit('skill_check', {
        sessionId: state.sessionId,
        actor: el.querySelector('#sc-actor').value,
        ability: el.querySelector('#sc-ability').value,
        score: +el.querySelector('#sc-score').value,
        proficiency: +el.querySelector('#sc-prof').value,
        dc: el.querySelector('#sc-dc').value,
      });
    };
    if (state.isDM) {
      el.querySelector('#dg-clear').onclick = () => socket.emit('clear_canvas', { sessionId: state.sessionId });
      el.querySelector('#dg-close').onclick = async () => {
        if (!confirm('¿Cerrar la sala?')) return;
        await API.post(`/dungeon/sessions/${state.sessionId}/close`);
        location.hash = '#/parties';
      };
      el.querySelector('#dg-next').onclick = () => socket.emit('next_turn', { sessionId: state.sessionId });
      el.querySelector('#dg-setturns').onclick = async () => {
        const members = await API.get(`/parties/${state.currentPartyId}`).catch(() => null);
        let order = [];
        if (members && members.members) {
          order = members.members.map((m) => ({ name: m.username, init: Math.floor(Math.random() * 20) + 1 }));
        }
        order.sort((a, b) => b.init - a.init);
        socket.emit('set_turns', { sessionId: state.sessionId, turnOrder: order });
      };
    }
  }

  function bindSocket(session) {
    state.currentPartyId = session.party_id;
    connect();
    socket.emit('join_session', { sessionId: session.id });
    socket.off('session_state').on('session_state', (s) => {
      redraw(s.canvas_data);
      state.turnOrder = s.turn_order || [];
      state.currentTurn = s.current_turn || 0;
      refs.status.textContent = s.status;
      renderTurns();
    });
    socket.off('draw').on('draw', drawStroke);
    socket.off('clear_canvas').on('clear_canvas', () => redraw([]));
    socket.off('presence').on('presence', (p) => {
      refs.presence.textContent = `${p.count} en sala`;
      if (p.status) refs.status.textContent = p.status;
    });
    socket.off('turns_update').on('turns_update', (t) => {
      state.turnOrder = t.turnOrder; state.currentTurn = t.currentTurn; renderTurns();
    });
    socket.off('skill_result').on('skill_result', (r) => {
      const cls = r.success === true ? 'crit' : r.success === false ? 'fail' : '';
      const verdict = r.success === true ? ' ✔ EXITO' : r.success === false ? ' ✘ FALLO' : '';
      logEntry(`<b>${r.actor}</b> [${r.ability}] 🎲 ${r.roll} ${r.modifier >= 0 ? '+' : ''}${r.modifier} = <b>${r.total}</b>${r.dc != null ? ` vs CD ${r.dc}` : ''}${verdict}`, cls);
    });
    socket.off('error_msg').on('error_msg', (m) => logEntry(`<span class="fail">⚠ ${m}</span>`));
  }

  function leave() {
    if (socket) { socket.off(); socket.disconnect(); socket = null; }
  }

  return { mount, leave };
})();
