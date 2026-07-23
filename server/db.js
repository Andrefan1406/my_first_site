// SQLite-хранилище синхронизированных заявок на бетон.
// Пишущее соединение (WAL) использует только syncConcrete.js,
// читающее (readonly) — только chatHandler.js, чтобы сгенерированный
// LLM SQL физически не мог ничего изменить, даже если бы обошёл sqlGuard.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'concrete.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS concrete_orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_date      TEXT,
  shipment_date_raw  TEXT,
  category           TEXT,
  material           TEXT,
  object_name        TEXT,
  block_position     TEXT,
  grade_class        TEXT,
  volume_planned_m3  REAL,
  volume_actual_m3   REAL,
  execution_note     TEXT,
  synced_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_concrete_date     ON concrete_orders(shipment_date);
CREATE INDEX IF NOT EXISTS idx_concrete_object   ON concrete_orders(object_name);
CREATE INDEX IF NOT EXISTS idx_concrete_material ON concrete_orders(material);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

let writeDb = null;
let readDb = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Открывает/создаёт БД и накатывает схему. Идемпотентно, безопасно
// звать многократно (используется при старте процесса).
function initSchema() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  db.close();
}

function getWriteDb() {
  if (!writeDb) {
    ensureDataDir();
    writeDb = new Database(DB_PATH);
    writeDb.pragma('journal_mode = WAL');
  }
  return writeDb;
}

function getReadDb() {
  if (!readDb) {
    readDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return readDb;
}

function getLastSyncedAt() {
  try {
    const row = getReadDb()
      .prepare("SELECT value FROM sync_meta WHERE key = 'last_synced_at'")
      .get();
    return row ? row.value : null;
  } catch (err) {
    // до первого initSchema()+sync файла/таблиц ещё может не быть
    return null;
  }
}

module.exports = { DB_PATH, initSchema, getWriteDb, getReadDb, getLastSyncedAt };
