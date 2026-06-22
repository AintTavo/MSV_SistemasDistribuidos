const http = require('http');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { attachSockets } = require('./sockets');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'dungeon-service' }));
app.use('/api/dungeon', require('./routes/dungeon'));

const PORT = process.env.PORT || 4003;
const server = http.createServer(app);
attachSockets(server);

db.init()
  .then(() => server.listen(PORT, () => console.log(`[dungeon-service] :${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
