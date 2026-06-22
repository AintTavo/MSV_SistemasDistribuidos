const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'patavo-shared-secret';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:4001';

const verifyToken = (t) => jwt.verify(t, SECRET);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = verifyToken(token); req.token = token; next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

async function partyAccess(token, partyId) {
  try {
    const r = await fetch(`${USER_SERVICE_URL}/api/parties/${partyId}/access`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return { is_dm: false, is_member: false };
    return await r.json();
  } catch { return { is_dm: false, is_member: false }; }
}

module.exports = { requireAuth, verifyToken, partyAccess, SECRET };
