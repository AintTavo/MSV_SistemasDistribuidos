const { Server } = require('socket.io');
const { query } = require('./db');
const { verifyToken, partyAccess } = require('./auth');
const { abilityMod, rollDie } = require('./helpers');

function attachSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' }, path: '/socket.io' });

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    try { socket.user = verifyToken(token); socket.token = token; next(); }
    catch { next(new Error('No autenticado')); }
  });

  io.on('connection', (socket) => {
    socket.on('join_session', async ({ sessionId }) => {
      const s = await query('SELECT * FROM dungeon_sessions WHERE id=$1', [sessionId]);
      if (s.rowCount === 0) return socket.emit('error_msg', 'Sala no encontrada');
      const session = s.rows[0];
      const acc = await partyAccess(socket.token, session.party_id);
      if (!acc.is_member) return socket.emit('error_msg', 'Sin acceso a esta sala');
      const room = `session:${sessionId}`;
      socket.join(room);
      socket.data.sessionId = sessionId;
      socket.data.isDM = session.dm_user_id === socket.user.id;
      if (!socket.data.isDM && session.status === 'waiting') {
        await query("UPDATE dungeon_sessions SET status='active' WHERE id=$1", [sessionId]);
        session.status = 'active';
      }
      socket.emit('session_state', session);
      const sockets = await io.in(room).fetchSockets();
      io.to(room).emit('presence', {
        count: sockets.length,
        users: sockets.map((x) => ({ username: x.user.username, isDM: x.data.isDM })),
        status: session.status,
      });
    });

    socket.on('draw', async ({ sessionId, stroke }) => {
      if (!socket.data.isDM) return;
      await query("UPDATE dungeon_sessions SET canvas_data = canvas_data || $1::jsonb WHERE id=$2",
        [JSON.stringify([stroke]), sessionId]);
      socket.to(`session:${sessionId}`).emit('draw', stroke);
    });

    socket.on('clear_canvas', async ({ sessionId }) => {
      if (!socket.data.isDM) return;
      await query("UPDATE dungeon_sessions SET canvas_data='[]' WHERE id=$1", [sessionId]);
      io.to(`session:${sessionId}`).emit('clear_canvas');
    });

    socket.on('set_turns', async ({ sessionId, turnOrder }) => {
      if (!socket.data.isDM) return;
      await query('UPDATE dungeon_sessions SET turn_order=$1, current_turn=0 WHERE id=$2',
        [JSON.stringify(turnOrder), sessionId]);
      io.to(`session:${sessionId}`).emit('turns_update', { turnOrder, currentTurn: 0 });
    });

    socket.on('next_turn', async ({ sessionId }) => {
      if (!socket.data.isDM) return;
      const r = await query('SELECT turn_order, current_turn FROM dungeon_sessions WHERE id=$1', [sessionId]);
      if (r.rowCount === 0) return;
      const order = r.rows[0].turn_order || [];
      const next = order.length ? (r.rows[0].current_turn + 1) % order.length : 0;
      await query('UPDATE dungeon_sessions SET current_turn=$1 WHERE id=$2', [next, sessionId]);
      io.to(`session:${sessionId}`).emit('turns_update', { turnOrder: order, currentTurn: next });
    });

    socket.on('skill_check', async ({ sessionId, actor, ability, score, proficiency, dc }) => {
      const room = `session:${sessionId}`;
      const s = await query('SELECT party_id FROM dungeon_sessions WHERE id=$1', [sessionId]);
      if (s.rowCount === 0) return;
      if (!(await partyAccess(socket.token, s.rows[0].party_id)).is_member) return;
      const roll = rollDie(20);
      const modifier = abilityMod(score || 10) + (Number(proficiency) || 0);
      const total = roll + modifier;
      const success = dc != null && dc !== '' ? total >= Number(dc) : null;
      await query(
        `INSERT INTO skill_checks (session_id, user_id, actor, ability, roll, modifier, total, dc, success)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sessionId, socket.user.id, actor || socket.user.username, ability || 'd20', roll, modifier, total,
         dc === '' || dc == null ? null : Number(dc), success]);
      io.to(room).emit('skill_result', {
        actor: actor || socket.user.username, ability, roll, modifier, total,
        dc: dc === '' ? null : dc, success, at: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async () => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const room = `session:${sessionId}`;
      const sockets = await io.in(room).fetchSockets();
      io.to(room).emit('presence', {
        count: sockets.length,
        users: sockets.map((x) => ({ username: x.user.username, isDM: x.data.isDM })),
      });
    });
  });

  return io;
}

module.exports = { attachSockets };
