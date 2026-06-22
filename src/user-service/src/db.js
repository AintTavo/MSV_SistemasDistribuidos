const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'db',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'mapa-aventurero',
  password: process.env.PGPASSWORD || 'mapa-aventurero',
  database: process.env.PGDATABASE || 'user_db',
});

async function query(text, params) { return pool.query(text, params); }

async function init(retries = 30) {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  for (let attempt = 1; attempt <= retries; attempt++) {
    try { await pool.query(schema); console.log('[user-svc] esquema aplicado'); return; }
    catch (err) {
      if (attempt === retries) throw err;
      console.log(`[user-svc] esperando BD (${attempt})... ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

module.exports = { pool, query, init };
