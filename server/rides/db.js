// SQLite-хранилище системы служебного транспорта (заявки на поездки).
// Отдельный файл БД от concrete.db — модуль полностью независим от
// остальных (Google Sheets синков и т.д.), поэтому не разделяет с ними
// ни схему, ни соединение. Одно write-соединение (WAL), без readonly —
// в отличие от concrete.db здесь нет LLM text-to-SQL, которому нужна
// гарантия "не может писать".
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Тот же приём, что и в server/db.js: на хостинге без примонтированного
// диска файл стирается при каждом деплое, RIDES_DATA_DIR даёт явно
// указать путь к персистентному диску, не полагаясь на структуру каталогов
// конкретного хостинга.
const DATA_DIR = process.env.RIDES_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

const SCHEMA = `
-- users — не общий список сотрудников компании (тех пускает Firebase Auth
-- сам по себе), а закрытый список ДОПУЩЕННЫХ к системе поездок: строка
-- появляется здесь только когда админ явно назначил человеку роль на
-- странице /rides-admin. email — тот же, что в decoded.email из Firebase
-- ID-токена (см. server/adminAuth.js) — пароль отдельно не храним, это
-- делает Firebase.
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  role              TEXT NOT NULL CHECK(role IN ('employee','dispatcher','driver','admin')),
  full_site_access  INTEGER NOT NULL DEFAULT 0, -- 1 = сотрудник уже пользовался остальным
                                                  -- сайтом до попадания в систему поездок —
                                                  -- сохраняет доступ туда вдобавок к своей роли
                                                  -- здесь. 0 (по умолчанию) — заперт только на
                                                  -- странице своей роли (/driver, /dispatcher, /employee).
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  plate_number  TEXT NOT NULL UNIQUE,
  model         TEXT,
  status        TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','busy','maintenance')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id),
  vehicle_id  INTEGER REFERENCES vehicles(id),
  status      TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('available','busy','offline')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- requested_at — желаемое время подачи машины (задаёт сотрудник в форме),
-- отдельно от created_at (момент фактической подачи заявки в БД).
CREATE TABLE IF NOT EXISTS requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES users(id),
  driver_id         INTEGER REFERENCES drivers(id),
  from_address      TEXT NOT NULL,
  to_address        TEXT NOT NULL,
  requested_at      TEXT NOT NULL,
  purpose           TEXT,
  passengers_count  INTEGER NOT NULL DEFAULT 1,
  with_return       INTEGER NOT NULL DEFAULT 0, -- туда-обратно: водитель ждёт на месте и везёт
                                                  -- обратно в рамках той же заявки, не через
                                                  -- отдельный заказ из пула.
  status            TEXT NOT NULL DEFAULT 'pending_assignment'
                     CHECK(status IN ('created','pending_assignment','assigned','in_progress','completed','cancelled')),
  comment           TEXT,
  assigned_by       TEXT CHECK(assigned_by IN ('self','dispatcher')),
  cancel_reason     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_status   ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_employee ON requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_driver   ON requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status    ON drivers(status);

CREATE TABLE IF NOT EXISTS request_status_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests(id),
  status      TEXT NOT NULL,
  changed_by  INTEGER REFERENCES users(id),
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_request ON request_status_history(request_id);
`;

let writeDb = null;

function initSchema() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = getWriteDb();
  db.exec(SCHEMA);
  migrateSchema(db);
}

// CREATE TABLE IF NOT EXISTS — no-op на уже существующей локальной/прод
// базе, поэтому новые колонки в таблицах, которые нельзя пересоздавать
// (заявки нельзя терять), добавляются через ALTER, тем же приёмом, что и
// migrateSchema в server/db.js.
function migrateSchema(db) {
  const requestColumns = db.prepare("PRAGMA table_info(requests)").all().map((c) => c.name);
  if (!requestColumns.includes('with_return')) {
    db.exec('ALTER TABLE requests ADD COLUMN with_return INTEGER NOT NULL DEFAULT 0');
  }
}

function getWriteDb() {
  if (!writeDb) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    writeDb = new Database(DB_PATH);
    writeDb.pragma('journal_mode = WAL');
  }
  return writeDb;
}

module.exports = { initSchema, getWriteDb, DB_PATH };
