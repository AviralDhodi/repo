const express = require('express');
const Redis = require('ioredis');

const app = express();
app.use(express.json({ limit: '10mb' }));

const redis = new Redis(process.env.REDIS_URL);
const PORT = process.env.PORT || 10000;
const GETTER_PASSWORD = process.env.GETTER_PASSWORD;
const SETTER_PASSWORD = process.env.SETTER_PASSWORD;

function auth(expected) {
  return (req, res, next) => {
    const supplied = req.get('x-password') || req.query.password;
    if (!expected || supplied !== expected) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
}

app.get('/getSomething/:id', auth(GETTER_PASSWORD), async (req, res) => {
  try {
    const raw = await redis.get(`thing:${req.params.id}`);
    if (raw === null) return res.status(404).json({ error: 'Not found' });
    const record = JSON.parse(raw);
    res.json(record.stuff);
  } catch (e) {
    res.status(500).json({ error: 'Storage error' });
  }
});

app.post('/writeSomething', auth(SETTER_PASSWORD), async (req, res) => {
  try {
    const { stuff, type, id } = req.body || {};
    if (id === undefined || type === undefined || !Object.prototype.hasOwnProperty.call(req.body || {}, 'stuff')) {
      return res.status(400).json({ error: 'Required fields: stuff, type, id' });
    }
    await redis.set(`thing:${String(id)}`, JSON.stringify({ stuff, type, id: String(id) }));
    res.json({ stuff, type, id: String(id) });
  } catch (e) {
    res.status(500).json({ error: 'Storage error' });
  }
});

app.get('/health', async (_req, res) => {
  try { await redis.ping(); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Getter API listening on ${PORT}`));
