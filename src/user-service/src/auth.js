const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'patavo-shared-secret';

const hashPassword = (p) => bcrypt.hash(p, 10);
const verifyPassword = (p, h) => bcrypt.compare(p, h);
const signToken = (u) => jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: '7d' });
const verifyToken = (t) => jwt.verify(t, SECRET);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = verifyToken(token); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth, SECRET };
