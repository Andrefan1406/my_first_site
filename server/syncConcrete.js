// Периодическая синхронизация: публичный CSV-экспорт Google Таблицы
// (тот же источник, что уже читают src/ConcreteProductionReport.js и
// src/ConcreteDailyReportPage.js на клиенте) -> таблица concrete_orders.
// Полная перезапись при каждом синке: у строк исходной таблицы нет
// стабильного ID, поэтому upsert не построить надёжно, а объём данных
// небольшой — DELETE+INSERT в одной транзакции атомарны для читателей.
const cron = require('node-cron');
const Papa = require('papaparse');
const { getWriteDb } = require('./db');

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTSu48SFcG0-dZpjkW3Z3uN3jJF0QPkpFUroD1YHWRj_8jy7ZwND096Rgd60fDiQGPHMOY8TDVy-_fl/pub?gid=949231644&single=true&output=csv';

const CRON_SCHEDULE = process.env.CONCRETE_SYNC_CRON || '0 */2 * * *';

// "12,5" -> 12.5; пусто/мусор -> null
function parseVolume(value) {
  if (!value) return null;
  const num = parseFloat(String(value).replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(num) ? null : num;
}

// "ДД.ММ.ГГГГ" -> "ГГГГ-ММ-ДД"
function normalizeDate(raw) {
  if (!raw) return null;
  const parts = raw.trim().split('.');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchAndParseCsv() {
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`Не удалось скачать CSV с заявками на бетон: HTTP ${res.status}`);
  }
  const csvText = await res.text();
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data;
}

function normalizeRow(row) {
  return {
    shipment_date: normalizeDate(row['Дата отгрузки']),
    shipment_date_raw: row['Дата отгрузки'] || null,
    category: row['Категория'] || null,
    material: row['Материал'] || null,
    object_name: row['Объект'] || null,
    block_position: row['Блок, позиция'] || null,
    grade_class: row['Марка, класс'] || null,
    volume_planned_m3: parseVolume(row['Объём, м3']),
    volume_actual_m3: parseVolume(row['Фактический объём']),
    execution_note: row['Отметка о исполнении'] || null,
  };
}

function syncConcreteData(rows) {
  const db = getWriteDb();
  const insert = db.prepare(`
    INSERT INTO concrete_orders (
      shipment_date, shipment_date_raw, category, material, object_name,
      block_position, grade_class, volume_planned_m3, volume_actual_m3, execution_note
    ) VALUES (
      @shipment_date, @shipment_date_raw, @category, @material, @object_name,
      @block_position, @grade_class, @volume_planned_m3, @volume_actual_m3, @execution_note
    )
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const replaceAll = db.transaction((normalizedRows) => {
    db.prepare('DELETE FROM concrete_orders').run();
    for (const row of normalizedRows) insert.run(row);
    upsertMeta.run({ key: 'last_synced_at', value: new Date().toISOString() });
    upsertMeta.run({ key: 'row_count', value: String(normalizedRows.length) });
  });

  replaceAll(rows);
  return rows.length;
}

async function runSyncOnce() {
  const rawRows = await fetchAndParseCsv();
  const normalizedRows = rawRows
    .filter((row) => Object.values(row).some((v) => v && String(v).trim()))
    .map(normalizeRow);
  const count = syncConcreteData(normalizedRows);
  console.log(`[concrete-sync] загружено ${count} строк`);
  return count;
}

function startConcreteSync() {
  runSyncOnce().catch((err) => console.error('[concrete-sync] ошибка стартового синка:', err.message));
  cron.schedule(CRON_SCHEDULE, () => {
    runSyncOnce().catch((err) => console.error('[concrete-sync] ошибка планового синка:', err.message));
  });
}

module.exports = { startConcreteSync, runSyncOnce, CSV_URL };
