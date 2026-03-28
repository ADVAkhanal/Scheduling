'use strict';

const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const Database = require('better-sqlite3');
const path     = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT    = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

// ─── DB setup ─────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key      TEXT PRIMARY KEY,
    value    TEXT NOT NULL,
    saved_at TEXT NOT NULL
  );
`);

function dbGet(key) {
  const row = db.prepare('SELECT value FROM store WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function dbSet(key, data) {
  db.prepare(`
    INSERT INTO store (key, value, saved_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, saved_at = excluded.saved_at
  `).run(key, JSON.stringify(data), new Date().toISOString());
}

function dbMeta(key) {
  const row = db.prepare('SELECT saved_at FROM store WHERE key = ?').get(key);
  return row ? row.saved_at : null;
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDateCell(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string' && val.trim()) return val.trim().slice(0, 10);
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return '';
}

const MONTHS_ORDERED = [
  'Jan_26','Feb_26','Mar_26','Apr_26','May_26','Jun_26',
  'Jul_26','Aug_26','Sep_26','Oct_26','Nov_26','Dec_26',
  'Jan_27','Feb_27','Mar_27','Apr_27','May_27','Jun_27',
  'Jul_27','Aug_27','Sep_27','Oct_27','Nov_27','Dec_27',
];

function parseWCFile(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  return rows
    .map(r => ({
      'Work Order #':         String(r['Work Order #'] || '').trim(),
      'Part #':               String(r['Part #'] || '').trim(),
      'Work Center':          String(r['Work Center'] || '').trim(),
      QtyOrdered:             parseFloat(r['QtyOrdered']) || 0,
      Customer:               String(r['Customer'] || '').trim(),
      'WO Must Leave By':     parseDateCell(r['WO Must Leave By']),
      'Cust. Due':            parseDateCell(r['Cust. Due']),
      Status:                 String(r['Status'] || 'Unknown').trim(),
      'Set-up Time (Hrs)':    parseFloat(r['Set-up Time (Hrs)']) || 0,
      'Hours:Current Target': parseFloat(r['Hours:Current Target']) || 0,
      Complete:               parseFloat(r['Complete']) || 0,
    }))
    .filter(r => r['Work Center'] && r['Work Center'] !== 'null' && r['Work Center'] !== '0');
}

function parseCapFile(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: 0 });
  if (!rows.length) return null;

  const effCapCols = Object.keys(rows[0]).filter(c => c.includes('Effective Capacity'));

  const machines = rows
    .map(r => ({
      'Work Center': String(r['Work Center'] || '').trim(),
      Axis:          String(r['Axis'] || '').trim(),
      Shift1:        parseFloat(r['1st Shift Work Hour per Day '] ?? r['1st Shift Work Hour per Day']) || 0,
      Shift2:        parseFloat(r['2nd Shift Work Hour per Day']) || 0,
      Weekend:       parseFloat(r['Weekend Shift Hour per Day']) || 0,
    }))
    .filter(m => m['Work Center'] && m['Work Center'] !== '0');

  const capacity = [];
  rows.forEach(row => {
    const wc   = String(row['Work Center'] || '').trim();
    const axis = String(row['Axis'] || '').trim();
    if (!wc || wc === '0') return;
    effCapCols.forEach((col, idx) => {
      if (idx >= MONTHS_ORDERED.length) return;
      capacity.push({
        'Work Center': wc,
        Axis:          axis,
        Month:         MONTHS_ORDERED[idx],
        Eff_Capacity:  parseFloat(row[col]) || 0,
        Loaded_Hours:  0,
        Util_Pct:      0,
      });
    });
  });

  return { machines, capacity };
}

function mergeLoadedHours(capacity, workorders) {
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const loadMap = {};
  workorders.forEach(w => {
    const d = w['WO Must Leave By'];
    if (!d || !w['Work Center']) return;
    const dt = new Date(d);
    if (isNaN(dt)) return;
    const key = `${w['Work Center']}|${MO[dt.getMonth()]}_${String(dt.getFullYear()).slice(2)}`;
    loadMap[key] = (loadMap[key] || 0) + (w['Hours:Current Target'] || 0);
  });
  return capacity.map(r => {
    const loaded = loadMap[`${r['Work Center']}|${r.Month}`] || 0;
    const util   = r.Eff_Capacity > 0 ? Math.round(loaded / r.Eff_Capacity * 1000) / 10 : 0;
    return { ...r, Loaded_Hours: loaded, Util_Pct: util };
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/data', (req, res) => {
  const wc  = dbGet('workorders');
  const cap = dbGet('capacity');
  res.json({
    workorders:  wc  || [],
    capacity:    cap && wc ? mergeLoadedHours(cap.capacity, wc) : (cap ? cap.capacity : []),
    machines:    cap ? cap.machines : [],
    lastUpdated: { wc: dbMeta('workorders'), cap: dbMeta('capacity') },
  });
});

app.post('/api/upload/wc', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const workorders = parseWCFile(req.file.buffer);
    dbSet('workorders', workorders);
    const cap      = dbGet('capacity');
    const capacity = cap ? mergeLoadedHours(cap.capacity, workorders) : [];
    res.json({ ok: true, rows: workorders.length, workorders, capacity, machines: cap ? cap.machines : [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload/cap', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    const parsed = parseCapFile(req.file.buffer);
    if (!parsed) return res.status(400).json({ error: 'Could not parse capacity file' });
    dbSet('capacity', parsed);
    const wc       = dbGet('workorders') || [];
    const capacity = mergeLoadedHours(parsed.capacity, wc);
    res.json({ ok: true, machines: parsed.machines.length, capacity, machines: parsed.machines, workorders: wc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime(), db: DB_PATH }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Production Schedule running on port ${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
