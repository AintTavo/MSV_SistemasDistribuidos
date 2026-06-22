const express = require('express');
const { query } = require('../db');
const { requireAuth, partyAccess } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.post('/sessions', async (req, res) => {
  const { party_id, name } = req.body || {};
  if (!(await partyAccess(req.token, party_id)).is_dm) return res.status(403).json({ error: 'Solo el DM puede iniciar la sala' });
  const r = await query('INSERT INTO dungeon_sessions (party_id, dm_user_id, name) VALUES ($1,$2,$3) RETURNING *',
    [party_id, req.user.id, name || 'Mazmorra']);
  res.status(201).json(r.rows[0]);
});

router.get('/sessions/party/:partyId', async (req, res) => {
  if (!(await partyAccess(req.token, req.params.partyId)).is_member) return res.status(403).json({ error: 'Sin acceso' });
  const r = await query("SELECT * FROM dungeon_sessions WHERE party_id=$1 AND status<>'closed' ORDER BY created_at DESC",
    [req.params.partyId]);
  res.json(r.rows);
});

router.get('/sessions/:id', async (req, res) => {
  const r = await query('SELECT * FROM dungeon_sessions WHERE id=$1', [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  if (!(await partyAccess(req.token, r.rows[0].party_id)).is_member) return res.status(403).json({ error: 'Sin acceso' });
  const checks = await query('SELECT * FROM skill_checks WHERE session_id=$1 ORDER BY created_at DESC LIMIT 25', [req.params.id]);
  res.json({ ...r.rows[0], recent_checks: checks.rows });
});

router.post('/sessions/:id/close', async (req, res) => {
  const r = await query('SELECT * FROM dungeon_sessions WHERE id=$1', [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  if (r.rows[0].dm_user_id !== req.user.id) return res.status(403).json({ error: 'Solo el DM' });
  await query("UPDATE dungeon_sessions SET status='closed' WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
