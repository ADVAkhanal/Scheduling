const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT      = process.env.PORT || 3000;

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

let db = loadData();

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/capacity', (req, res) => res.sendFile(path.join(__dirname, 'public', 'wc_capacity_dashboard.html')));
app.get('/api/data', (req, res) => res.json(db));

wss.on('connection', (ws) => {
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
        if (idx !== -1) {
          db[idx] = msg.entry;
          saveData(db);
          broadcast({ type: 'update', entry: msg.entry });
        }
        break;
      }
      case 'delete': {
        const before = db.length;
        db = db.filter(r => r.id !== msg.id);
        if (db.length < before) {
          saveData(db);
          broadcast({ type: 'delete', id: msg.id });
        }
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  });

  ws.on('close', () => {});
  ws.on('error', (err) => {});
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Server running on http://localhost:${PORT}\n`);
});
