const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'user-service' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/characters', require('./routes/characters'));
app.use('/api/sync', require('./routes/sync'));

const PORT = process.env.PORT || 4001;
db.init()
  .then(() => app.listen(PORT, () => console.log(`[user-service] :${PORT}`)))
  .catch((e) => { console.error(e); process.exit(1); });
