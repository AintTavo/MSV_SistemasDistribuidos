const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'dm-service' }));
app.use('/api/dm', require('./routes/dm'));

const PORT = process.env.PORT || 4002;
db.init()
  .then(() => app.listen(PORT, () => console.log(`[dm-service] :${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
