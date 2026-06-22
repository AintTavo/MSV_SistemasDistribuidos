const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Datos del usuario para la instantánea offline (los agrega el gateway).
router.get('/mine', async (req, res) => {
  const uid = req.user.id;
  const [characters, items, parties] = await Promise.all([
    query('SELECT * FROM characters WHERE user_id=$1', [uid]),
    query('SELECT i.* FROM inventory_items i JOIN characters c ON c.id=i.character_id WHERE c.user_id=$1', [uid]),
    query(`SELECT p.*, (p.dm_user_id=$1) AS is_dm FROM parties p
           WHERE p.dm_user_id=$1 OR p.id IN (SELECT party_id FROM party_members WHERE user_id=$1)`, [uid]),
  ]);
  res.json({ characters: characters.rows, items: items.rows, parties: parties.rows });
});

// Aplica las operaciones offline de personajes/inventario.
router.post('/push', async (req, res) => {
  const ops = Array.isArray(req.body && req.body.operations) ? req.body.operations : [];
  const results = [];
  for (const op of ops) {
    try { results.push({ clientId: op.clientId || null, ok: true, server: await applyOp(req.user.id, op) }); }
    catch (err) { results.push({ clientId: op.clientId || null, ok: false, error: err.message }); }
  }
  res.json({ applied: results.length, results });
});

async function ensureOwner(uid, charId) {
  const r = await query('SELECT 1 FROM characters WHERE id=$1 AND user_id=$2', [charId, uid]);
  if (r.rowCount === 0) throw new Error('Personaje no pertenece al usuario');
}

async function applyOp(uid, op) {
  const d = op.data || {};
  switch (`${op.entity}:${op.op}`) {
    case 'character:update':
      await ensureOwner(uid, op.id);
      return (await query(
        `UPDATE characters SET name=$1, race=$2, class=$3, level=$4, hp=$5, max_hp=$6, ac=$7, stats=$8, notes=$9, updated_at=now()
         WHERE id=$10 AND user_id=$11 RETURNING *`,
        [d.name, d.race, d.class, d.level, d.hp, d.max_hp, d.ac, d.stats, d.notes, op.id, uid])).rows[0];
    case 'item:create':
      await ensureOwner(uid, op.characterId);
      return (await query(
        `INSERT INTO inventory_items (character_id, name, quantity, weight, equipped, description)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [op.characterId, d.name, d.quantity || 1, d.weight || 0, !!d.equipped, d.description || ''])).rows[0];
    case 'item:update':
      await ensureOwner(uid, op.characterId);
      return (await query(
        `UPDATE inventory_items SET name=$1, quantity=$2, weight=$3, equipped=$4, description=$5
         WHERE id=$6 AND character_id=$7 RETURNING *`,
        [d.name, d.quantity, d.weight, !!d.equipped, d.description, op.id, op.characterId])).rows[0];
    case 'item:delete':
      await ensureOwner(uid, op.characterId);
      await query('DELETE FROM inventory_items WHERE id=$1 AND character_id=$2', [op.id, op.characterId]);
      return { deleted: op.id };
    default:
      throw new Error(`Operación no soportada en user-service: ${op.entity}:${op.op}`);
  }
}

module.exports = router;
