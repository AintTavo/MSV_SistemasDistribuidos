const express = require('express');
const { query } = require('../db');
const { requireAuth, partyAccess } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// =============== HISTORIAS POR MESA ===============
router.get('/stories/party/:partyId', async (req, res) => {
  const acc = await partyAccess(req.token, req.params.partyId);
  if (!acc.is_dm) return res.status(403).json({ error: 'Solo el DM' });
  const r = await query('SELECT * FROM stories WHERE party_id=$1 ORDER BY updated_at DESC', [req.params.partyId]);
  res.json(r.rows);
});

router.post('/stories', async (req, res) => {
  const s = req.body || {};
  const acc = await partyAccess(req.token, s.party_id);
  if (!acc.is_dm) return res.status(403).json({ error: 'Solo el DM de la mesa' });
  const r = await query('INSERT INTO stories (party_id, title, content) VALUES ($1,$2,$3) RETURNING *',
    [s.party_id, s.title || 'Capítulo', s.content || '']);
  res.status(201).json(r.rows[0]);
});

async function storyParty(id) {
  const r = await query('SELECT party_id FROM stories WHERE id=$1', [id]);
  return r.rowCount ? r.rows[0].party_id : null;
}

router.put('/stories/:id', async (req, res) => {
  const pid = await storyParty(req.params.id);
  if (pid == null) return res.status(404).json({ error: 'No encontrado' });
  if (!(await partyAccess(req.token, pid)).is_dm) return res.status(403).json({ error: 'Solo el DM' });
  const s = req.body || {};
  const r = await query('UPDATE stories SET title=$1, content=$2, updated_at=now() WHERE id=$3 RETURNING *',
    [s.title, s.content, req.params.id]);
  res.json(r.rows[0]);
});

router.delete('/stories/:id', async (req, res) => {
  const pid = await storyParty(req.params.id);
  if (pid == null) return res.status(404).json({ error: 'No encontrado' });
  if (!(await partyAccess(req.token, pid)).is_dm) return res.status(403).json({ error: 'Solo el DM' });
  await query('DELETE FROM stories WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// =============== GRIMORIO RÁPIDO ===============
router.get('/grimoire', async (req, res) => {
  const r = await query('SELECT * FROM grimoire_spells WHERE dm_user_id=$1 ORDER BY level, name', [req.user.id]);
  res.json(r.rows);
});
router.post('/grimoire', async (req, res) => {
  const s = req.body || {};
  const r = await query(
    `INSERT INTO grimoire_spells (dm_user_id, name, level, school, casting_time, range, components, duration, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.id, s.name || 'Hechizo', s.level || 0, s.school || '', s.casting_time || '', s.range || '', s.components || '', s.duration || '', s.description || '']);
  res.status(201).json(r.rows[0]);
});
router.put('/grimoire/:id', async (req, res) => {
  const s = req.body || {};
  const r = await query(
    `UPDATE grimoire_spells SET name=$1, level=$2, school=$3, casting_time=$4, range=$5, components=$6, duration=$7, description=$8
     WHERE id=$9 AND dm_user_id=$10 RETURNING *`,
    [s.name, s.level, s.school, s.casting_time, s.range, s.components, s.duration, s.description, req.params.id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
});
router.delete('/grimoire/:id', async (req, res) => {
  await query('DELETE FROM grimoire_spells WHERE id=$1 AND dm_user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
});

// =============== BESTIARIO ===============
router.get('/bestiary', async (req, res) => {
  const r = await query('SELECT * FROM bestiary_monsters WHERE dm_user_id=$1 ORDER BY name', [req.user.id]);
  res.json(r.rows);
});
router.post('/bestiary', async (req, res) => {
  const m = req.body || {};
  const r = await query(
    `INSERT INTO bestiary_monsters (dm_user_id, name, type, cr, hp, ac, stats, abilities, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.id, m.name || 'Monstruo', m.type || '', m.cr || '0', m.hp || 1, m.ac || 10,
     m.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, m.abilities || '', m.description || '']);
  res.status(201).json(r.rows[0]);
});
router.put('/bestiary/:id', async (req, res) => {
  const m = req.body || {};
  const r = await query(
    `UPDATE bestiary_monsters SET name=$1, type=$2, cr=$3, hp=$4, ac=$5, stats=$6, abilities=$7, description=$8
     WHERE id=$9 AND dm_user_id=$10 RETURNING *`,
    [m.name, m.type, m.cr, m.hp, m.ac, m.stats, m.abilities, m.description, req.params.id, req.user.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json(r.rows[0]);
});
router.delete('/bestiary/:id', async (req, res) => {
  await query('DELETE FROM bestiary_monsters WHERE id=$1 AND dm_user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
});

// =============== SYNC (offline) ===============
router.get('/sync/mine', async (req, res) => {
  const uid = req.user.id;
  const [grimoire, bestiary] = await Promise.all([
    query('SELECT * FROM grimoire_spells WHERE dm_user_id=$1', [uid]),
    query('SELECT * FROM bestiary_monsters WHERE dm_user_id=$1', [uid]),
  ]);
  // Historias de las mesas donde el usuario es DM (pregunta a user-service por sus parties).
  let stories = [];
  try {
    const r = await fetch(`${process.env.USER_SERVICE_URL || 'http://user-service:4001'}/api/parties`,
      { headers: { Authorization: 'Bearer ' + req.token } });
    if (r.ok) {
      const parties = (await r.json()).filter((p) => p.is_dm).map((p) => p.id);
      if (parties.length) {
        const sr = await query(`SELECT * FROM stories WHERE party_id = ANY($1::int[])`, [parties]);
        stories = sr.rows;
      }
    }
  } catch { /* offline-safe */ }
  res.json({ grimoire: grimoire.rows, bestiary: bestiary.rows, stories });
});

router.post('/sync/push', async (req, res) => {
  const ops = Array.isArray(req.body && req.body.operations) ? req.body.operations : [];
  const results = [];
  for (const op of ops) {
    try { results.push({ clientId: op.clientId || null, ok: true, server: await applyOp(req, op) }); }
    catch (err) { results.push({ clientId: op.clientId || null, ok: false, error: err.message }); }
  }
  res.json({ applied: results.length, results });
});

async function applyOp(req, op) {
  const uid = req.user.id; const d = op.data || {};
  switch (`${op.entity}:${op.op}`) {
    case 'story:update': {
      const pid = await storyParty(op.id);
      if (pid == null || !(await partyAccess(req.token, pid)).is_dm) throw new Error('No autorizado');
      return (await query('UPDATE stories SET title=$1, content=$2, updated_at=now() WHERE id=$3 RETURNING *',
        [d.title, d.content, op.id])).rows[0];
    }
    case 'grimoire:update':
      return (await query(
        `UPDATE grimoire_spells SET name=$1, level=$2, school=$3, casting_time=$4, range=$5, components=$6, duration=$7, description=$8
         WHERE id=$9 AND dm_user_id=$10 RETURNING *`,
        [d.name, d.level, d.school, d.casting_time, d.range, d.components, d.duration, d.description, op.id, uid])).rows[0];
    case 'bestiary:update':
      return (await query(
        `UPDATE bestiary_monsters SET name=$1, type=$2, cr=$3, hp=$4, ac=$5, stats=$6, abilities=$7, description=$8
         WHERE id=$9 AND dm_user_id=$10 RETURNING *`,
        [d.name, d.type, d.cr, d.hp, d.ac, d.stats, d.abilities, d.description, op.id, uid])).rows[0];
    default:
      throw new Error(`Operación no soportada en dm-service: ${op.entity}:${op.op}`);
  }
}

module.exports = router;
