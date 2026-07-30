// SQLite-хранилище синхронизированных заявок на бетон.
// Пишущее соединение (WAL) использует только syncConcrete.js,
// читающее (readonly) — только concreteDailyReport.js.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'concrete.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS concrete_orders (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_date          TEXT,
  shipment_date_raw      TEXT,
  category               TEXT,
  material               TEXT,
  object_name            TEXT,
  block_position         TEXT,
  grade_class            TEXT,
  volume_planned_m3      REAL,
  volume_actual_m3       REAL,
  execution_note         TEXT,
  planned_delivery_date  TEXT, -- "Планируемая дата поставки" из Google Таблицы: дата, которую
                                -- заказчик указал при подаче заявки, 'YYYY-MM-DD'. Отличается
                                -- от shipment_date ("Дата отгрузки"), которая проставляется по
                                -- факту исполнения и может не совпадать с запланированной.
  synced_at              TEXT DEFAULT (datetime('now'))
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

// concrete_orders создаётся через CREATE TABLE IF NOT EXISTS, поэтому у уже
// существующих баз (локальных и на проде) новая колонка сама не появится —
// нужна явная миграция ALTER TABLE. Безопасно звать многократно — проверяем
// PRAGMA table_info, ADD COLUMN шлём только если колонки ещё нет.
function migrateSchema(db) {
  const columns = db.prepare("PRAGMA table_info(concrete_orders)").all().map((c) => c.name);
  if (!columns.includes('planned_delivery_date')) {
    db.exec('ALTER TABLE concrete_orders ADD COLUMN planned_delivery_date TEXT');
  }
}

// Открывает/создаёт БД и накатывает схему. Идемпотентно, безопасно
// звать многократно (используется при старте процесса).
function initSchema() {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  migrateSchema(db);
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

function getLastSyncedAt(key = 'last_synced_at') {
  try {
    const row = getReadDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (err) {
    // до первого initSchema()+sync файла/таблиц ещё может не быть
    return null;
  }
}

module.exports = { DB_PATH, initSchema, getWriteDb, getReadDb, getLastSyncedAt };
