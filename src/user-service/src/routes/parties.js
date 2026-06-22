const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const { randomCode, isDM, isMemberOrDM } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const r = await query(
    `SELECT p.*, (p.dm_user_id = $1) AS is_dm,
            (SELECT count(*) FROM party_members pm WHERE pm.party_id = p.id) AS member_count
     FROM parties p
     WHERE p.dm_user_id = $1 OR p.id IN (SELECT party_id FROM party_members WHERE user_id = $1)
     ORDER BY p.created_at DESC`, [req.user.id]);
  res.json(r.rows);
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name requerido' });
  const r = await query('INSERT INTO parties (name, dm_user_id, join_code) VALUES ($1,$2,$3) RETURNING *',
    [name, req.user.id, randomCode()]);
  await query('INSERT INTO party_members (party_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [r.rows[0].id, req.user.id, 'dm']);
  res.status(201).json(r.rows[0]);
});

router.post('/join', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code requerido' });
  const p = await query('SELECT * FROM parties WHERE join_code=$1', [code.toUpperCase()]);
  if (p.rowCount === 0) return res.status(404).json({ error: 'Código no encontrado' });
  await query('INSERT INTO party_members (party_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [p.rows[0].id, req.user.id, 'player']);
  res.json(p.rows[0]);
});

// Endpoint consumido por dm-service y dungeon-service para autorizar acceso.
router.get('/:id/access', async (req, res) => {
  res.json({
    is_dm: await isDM(req.user.id, req.params.id),
    is_member: await isMemberOrDM(req.user.id, req.params.id),
  });
});

router.get('/:id', async (req, res) => {
  if (!(await isMemberOrDM(req.user.id, req.params.id))) return res.status(403).json({ error: 'Sin acceso' });
  const p = await query('SELECT * FROM parties WHERE id=$1', [req.params.id]);
  if (p.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  const members = await query(
    `SELECT u.id, u.username, pm.role FROM party_members pm JOIN users u ON u.id=pm.user_id WHERE pm.party_id=$1`,
    [req.params.id]);
  res.json({ ...p.rows[0], is_dm: p.rows[0].dm_user_id === req.user.id, members: members.rows });
});

module.exports = router;
