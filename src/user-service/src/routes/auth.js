const express = require('express');
const { query } = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  try {
    const hash = await hashPassword(password);
    const r = await query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email',
      [username, email || null, hash]
    );
    res.status(201).json({ token: signToken(r.rows[0]), user: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: 'Error al registrar' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username y password requeridos' });
  const r = await query('SELECT * FROM users WHERE username=$1', [username]);
  if (r.rowCount === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
  const user = r.rows[0];
  if (!(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json({ token: signToken(user), user: { id: user.id, username: user.username, email: user.email } });
});

router.get('/me', requireAuth, async (req, res) => {
  const r = await query('SELECT id, username, email FROM users WHERE id=$1', [req.user.id]);
  res.json(r.rows[0] || null);
});

module.exports = router;
