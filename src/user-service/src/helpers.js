const { query } = require('./db');

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function isDM(userId, partyId) {
  const r = await query('SELECT 1 FROM parties WHERE id=$1 AND dm_user_id=$2', [partyId, userId]);
  return r.rowCount > 0;
}

async function isMemberOrDM(userId, partyId) {
  const r = await query(
    `SELECT 1 FROM parties WHERE id=$1 AND dm_user_id=$2
     UNION SELECT 1 FROM party_members WHERE party_id=$1 AND user_id=$2`,
    [partyId, userId]
  );
  return r.rowCount > 0;
}

module.exports = { randomCode, isDM, isMemberOrDM };
