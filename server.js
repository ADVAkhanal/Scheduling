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

function dbDel(key) {
  db.prepare('DELETE FROM store WHERE key = ?').run(key);
}

function dbClear() {
  db.prepare('DELETE FROM store').run();
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Schedule data routes ─────────────────────────────────────────────────────

// GET all state (called on page load)
app.get('/api/state', (req, res) => {
  res.json({
    data:    dbGet('so_data')   || [],
    meta:    dbGet('so_meta')   || null,
    st:      dbGet('so_st')     || null,   // status tag registry
    rst:     dbGet('so_rst')    || {},     // row status assignments
    cfg:     dbGet('so_cfg')    || {},
  });
});

// POST schedule rows (parsed client-side from xlsx, then sent here)
app.post('/api/data', (req, res) => {
  try {
    const { rows, meta } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be array' });
    dbSet('so_data', rows);
    dbSet('so_meta', meta);
    res.json({ ok: true, rows: rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH config
app.patch('/api/cfg', (req, res) => {
  try {
    dbSet('so_cfg', req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH status tag registry
app.patch('/api/st', (req, res) => {
  try {
    dbSet('so_st', req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH row status assignments
app.patch('/api/rst', (req, res) => {
  try {
    dbSet('so_rst', req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE all data (clear)
app.delete('/api/state', (req, res) => {
  dbClear();
  res.json({ ok: true });
});

app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime(), db: DB_PATH }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SchedOps running on port ${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
