const path = require('path');
const http = require('http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const USER = process.env.USER_SERVICE_URL || 'http://user-service:4001';
const DM = process.env.DM_SERVICE_URL || 'http://dm-service:4002';
const DUNGEON = process.env.DUNGEON_SERVICE_URL || 'http://dungeon-service:4003';

const app = express();

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'gateway', targets: { USER, DM, DUNGEON } }));

// -------- Sync agregado (composición de API entre microservicios) --------
// Se define ANTES de los proxies y es el único punto con parser de JSON.
const sync = express.Router();
sync.use(express.json({ limit: '5mb' }));

sync.get('/pull', async (req, res) => {
  const auth = { Authorization: req.headers.authorization || '' };
  try {
    const [u, d] = await Promise.all([
      fetch(`${USER}/api/sync/mine`, { headers: auth }).then((r) => r.json()),
      fetch(`${DM}/api/dm/sync/mine`, { headers: auth }).then((r) => r.json()),
    ]);
    res.json({
      synced_at: new Date().toISOString(),
      characters: u.characters || [], items: u.items || [], parties: u.parties || [],
      stories: d.stories || [], grimoire: d.grimoire || [], bestiary: d.bestiary || [],
    });
  } catch (e) { res.status(502).json({ error: 'Fallo al agregar sync: ' + e.message }); }
});

sync.post('/push', async (req, res) => {
  const auth = { Authorization: req.headers.authorization || '', 'Content-Type': 'application/json' };
  const ops = (req.body && req.body.operations) || [];
  const userOps = ops.filter((o) => o.entity === 'character' || o.entity === 'item');
  const dmOps = ops.filter((o) => ['story', 'grimoire', 'bestiary'].includes(o.entity));
  try {
    const calls = [];
    if (userOps.length) calls.push(fetch(`${USER}/api/sync/push`, { method: 'POST', headers: auth, body: JSON.stringify({ operations: userOps }) }).then((r) => r.json()));
    if (dmOps.length) calls.push(fetch(`${DM}/api/dm/sync/push`, { method: 'POST', headers: auth, body: JSON.stringify({ operations: dmOps }) }).then((r) => r.json()));
    const parts = await Promise.all(calls);
    const results = parts.flatMap((p) => p.results || []);
    res.json({ applied: results.length, results });
  } catch (e) { res.status(502).json({ error: 'Fallo al sincronizar: ' + e.message }); }
});

app.use('/api/sync', sync);

// -------- Proxies a los microservicios (sin parsear el cuerpo: se reenvía tal cual) --------
const userProxy = createProxyMiddleware({ pathFilter: ['/api/auth', '/api/characters', '/api/parties'], target: USER, changeOrigin: true });
const dmProxy = createProxyMiddleware({ pathFilter: ['/api/dm'], target: DM, changeOrigin: true });
const dungeonProxy = createProxyMiddleware({ pathFilter: ['/api/dungeon', '/socket.io'], target: DUNGEON, changeOrigin: true, ws: true });

app.use(userProxy);
app.use(dmProxy);
app.use(dungeonProxy);

// -------- PWA estática + fallback SPA --------
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);
server.on('upgrade', dungeonProxy.upgrade); // websockets del modo mazmorra
server.listen(PORT, () => console.log(`[gateway] :${PORT} -> user:${USER} dm:${DM} dungeon:${DUNGEON}`));
