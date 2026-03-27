const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const fs        = require('fs');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const DATA_FILE     = path.join(__dirname, 'data.json');
const SCHEDULE_FILE = path.join(__dirname, 'schedule_data.json');
const STATUS_FILE   = path.join(__dirname, 'status_data.json');
const PORT          = process.env.PORT || 3000;

// ── Load / save helpers ───────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) { console.error('Error loading data:', e.message); }
  return [];
}

function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
  catch(e) { console.error('Error saving data:', e.message); }
}

function loadSchedule() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
  } catch(e) { console.error('Error loading schedule:', e.message); }
  return null;
}

function saveSchedule(data) {
  try { fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data)); }
  catch(e) { console.error('Error saving schedule:', e.message); }
}

function loadStatus() {
  try {
    if (fs.existsSync(STATUS_FILE)) return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  } catch(e) { console.error('Error loading status:', e.message); }
  return {};
}

function saveStatus(data) {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(data)); }
  catch(e) { console.error('Error saving status:', e.message); }
}

let db = loadData();

// ── Broadcast to all connected clients ───────────────────────────
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

// ── Middleware ────────────────────────────────────────────────────
// Increase limit to 100MB to handle large Excel schedules
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ── HTTP: serve the dashboard ─────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'schedule_dashboard.html')));
app.get('/mirror', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

// ── Schedule data API ─────────────────────────────────────────────
// GET: returns persisted schedule (rows + metadata)
app.get('/api/schedule', (req, res) => {
  const schedule = loadSchedule();
  if (!schedule) {
    return res.json(null);
  }
  res.json(schedule);
});

// POST: save uploaded schedule from dashboard
app.post('/api/schedule', (req, res) => {
  const { rows, filename, loadedAt, rows_count } = req.body;
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Missing or invalid rows array' });
  }
  const payload = {
    rows,
    filename: filename || 'schedule.xlsx',
    loadedAt: loadedAt || new Date().toLocaleString(),
    rows_count: rows.length
  };
  saveSchedule(payload);
  console.log(`[${ts()}] Schedule saved — ${rows.length} rows from "${filename}"`);
  // Broadcast lightweight notification (not the full data to avoid WS limits)
  broadcast({ type: 'schedule_update', filename, loadedAt, rows_count: rows.length });
  res.json({ ok: true, rows_saved: rows.length });
});

// DELETE: remove schedule file (revert to no data)
app.delete('/api/schedule', (req, res) => {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) fs.unlinkSync(SCHEDULE_FILE);
    broadcast({ type: 'schedule_reset' });
    console.log(`[${ts()}] Schedule cleared`);
  } catch(e) { /* ignore */ }
  res.json({ ok: true });
});

// ── Row status assignments API ────────────────────────────────────
// GET: returns persisted { "wo_op": "tagKey", ... } map
app.get('/api/status', (req, res) => {
  res.json(loadStatus());
});

// POST: save full status map from dashboard
app.post('/api/status', (req, res) => {
  const data = req.body;
  if (typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Expected a key-value object' });
  }
  saveStatus(data);
  res.json({ ok: true });
});

// DELETE: clear all status assignments
app.delete('/api/status', (req, res) => {
  try {
    if (fs.existsSync(STATUS_FILE)) fs.unlinkSync(STATUS_FILE);
  } catch(e) { /* ignore */ }
  res.json({ ok: true });
});

// ── NPI / misc data REST (existing) ──────────────────────────────
app.get('/api/data', (req, res) => res.json(db));

// ── WebSocket: real-time mutations ────────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[${ts()}] Client connected: ${ip} | Total: ${wss.clients.size}`);
  ws.send(JSON.stringify({ type: 'init', data: db }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'add': {
        const entry = { ...msg.entry, id: msg.entry.id || uid() };
        db.unshift(entry);
        saveData(db);
        broadcast({ type: 'add', entry });
        break;
      }
      case 'update': {
        const idx = db.findIndex(r => r.id === msg.entry.id);
        if (idx !== -1) { db[idx] = msg.entry; saveData(db); broadcast({ type: 'update', entry: msg.entry }); }
        break;
      }
      case 'delete': {
        const before = db.length;
        db = db.filter(r => r.id !== msg.id);
        if (db.length < before) { saveData(db); broadcast({ type: 'delete', id: msg.id }); }
        break;
      }
      case 'ping': ws.send(JSON.stringify({ type: 'pong' })); break;
    }
  });
  ws.on('close', () => console.log(`[${ts()}] Client disconnected | Remaining: ${wss.clients.size}`));
  ws.on('error', (err) => console.error('WS error:', err.message));
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function ts()  { return new Date().toLocaleTimeString(); }

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   ADVANCED SHOP FLOOR COMMAND DASHBOARD      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}              ║`);
  console.log('║  Schedule: GET/POST/DELETE /api/schedule     ║');
  console.log('║  Status:   GET/POST/DELETE /api/status       ║');
  console.log('║  Data persists in schedule_data.json         ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
