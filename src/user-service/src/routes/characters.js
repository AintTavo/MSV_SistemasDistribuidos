const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');
const { isDM } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

async function ownsCharacter(userId, charId) {
  const r = await query('SELECT 1 FROM characters WHERE id=$1 AND user_id=$2', [charId, userId]);
  return r.rowCount > 0;
}

// Mis personajes (modo usuario).
router.get('/', async (req, res) => {
  const r = await query('SELECT * FROM characters WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
  res.json(r.rows);
});

// Personajes de una party (visible para el DM de esa party).
router.get('/party/:partyId', async (req, res) => {
  if (!(await isDM(req.user.id, req.params.partyId))) return res.status(403).json({ error: 'Solo el DM' });
  const r = await query(
    `SELECT c.*, u.username AS owner FROM characters c JOIN users u ON u.id=c.user_id
     WHERE c.party_id=$1 ORDER BY c.name`,
    [req.params.partyId]
  );
  res.json(r.rows);
});

router.get('/:id', async (req, res) => {
  const r = await query('SELECT * FROM characters WHERE id=$1', [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
});

router.post('/', async (req, res) => {
  const c = req.body || {};
  const r = await query(
    `INSERT INTO characters (user_id, party_id, name, race, class, level, hp, max_hp, ac, stats, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.id, c.party_id || null, c.name || 'Sin nombre', c.race || '', c.class || '',
      c.level || 1, c.hp || 10, c.max_hp || 10, c.ac || 10,
      c.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, c.notes || '',
    ]
  );
  res.status(201).json(r.rows[0]);
});

router.put('/:id', async (req, res) => {
  if (!(await ownsCharacter(req.user.id, req.params.id))) return res.status(403).json({ error: 'No es tu personaje' });
  const c = req.body || {};
  const r = await query(
    `UPDATE characters SET name=$1, race=$2, class=$3, level=$4, hp=$5, max_hp=$6, ac=$7,
            stats=$8, notes=$9, party_id=$10, updated_at=now()
     WHERE id=$11 RETURNING *`,
    [c.name, c.race, c.class, c.level, c.hp, c.max_hp, c.ac, c.stats, c.notes, c.party_id || null, req.params.id]
  );
  res.json(r.rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (!(await ownsCharacter(req.user.id, req.params.id))) return res.status(403).json({ error: 'No es tu personaje' });
  await query('DELETE FROM characters WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ---- Inventario por personaje ----
router.get('/:id/items', async (req, res) => {
  const r = await query('SELECT * FROM inventory_items WHERE character_id=$1 ORDER BY id', [req.params.id]);
  res.json(r.rows);
});

router.post('/:id/items', async (req, res) => {
  if (!(await ownsCharacter(req.user.id, req.params.id))) return res.status(403).json({ error: 'No es tu personaje' });
  const i = req.body || {};
  const r = await query(
    `INSERT INTO inventory_items (character_id, name, quantity, weight, equipped, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, i.name || 'Objeto', i.quantity || 1, i.weight || 0, !!i.equipped, i.description || '']
  );
  res.status(201).json(r.rows[0]);
});

router.put('/:id/items/:itemId', async (req, res) => {
  if (!(await ownsCharacter(req.user.id, req.params.id))) return res.status(403).json({ error: 'No es tu personaje' });
  const i = req.body || {};
  const r = await query(
    `UPDATE inventory_items SET name=$1, quantity=$2, weight=$3, equipped=$4, description=$5
     WHERE id=$6 AND character_id=$7 RETURNING *`,
    [i.name, i.quantity, i.weight, !!i.equipped, i.description, req.params.itemId, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
});

router.delete('/:id/items/:itemId', async (req, res) => {
  if (!(await ownsCharacter(req.user.id, req.params.id))) return res.status(403).json({ error: 'No es tu personaje' });
  await query('DELETE FROM inventory_items WHERE id=$1 AND character_id=$2', [req.params.itemId, req.params.id]);
  res.status(204).end();
});

module.exports = router;
