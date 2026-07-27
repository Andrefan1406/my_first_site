// Периодическая синхронизация ежедневных отчётов по людям: тот же публичный
// CSV-экспорт Google Таблицы, что уже читают src/PeopleDashboardPage.js и
// src/PeopleReportCharts.js на клиенте -> таблица people_reports.
// Сразу после синка сырых данных строится восстановленный временной ряд
// (см. fillPeopleSeries.js) и перезаписываются people_reports_filled и
// people_report_days — вся дальнейшая аналитика (чат) работает уже поверх
// них, а не поверх сырой таблицы.
//
// Полная перезапись при каждом синке — как и в syncConcrete.js/syncObjects.js:
// у строк исходной таблицы нет стабильного ID, а объём данных пока небольшой.
const cron = require('node-cron');
const Papa = require('papaparse');
const { getWriteDb } = require('./db');
const { buildFilledPeopleSeries } = require('./fillPeopleSeries');

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS0qVYHkI9ySfT0LO9SwG36BYrmI-chO09ws7GSjWcnQU2pX4Gzw-R4LXg6tdi44KXa1i5yQYcLF27U/pub?output=csv';

const CRON_SCHEDULE = process.env.PEOPLE_SYNC_CRON || '0 */2 * * *';

const clean = (value) => {
  const v = (value || '').toString().trim();
  return v ? v : null;
};

// Дата в этой таблице уже приходит в формате 'YYYY-MM-DD' (в отличие от
// concrete/objects, где даты — 'ДД.ММ.ГГГГ'), но на всякий случай проверяем
// формат, а не доверяем ему слепо — мусорную строку лучше отбросить, чем
// пустить в реконструкцию ряда и получить некорректную дату.
function normalizeDate(raw) {
  const value = (raw || '').toString().trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseHeadcount(value) {
  const num = parseFloat(String(value ?? '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

async function fetchAndParseCsv() {
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`Не удалось скачать CSV с отчётами по людям: HTTP ${res.status}`);
  }
  const csvText = await res.text();
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data;
}

function normalizeRow(row) {
  return {
    report_date: normalizeDate(row['Дата']),
    site: clean(row['Участок']),
    object_category: clean(row['Категория объекта']),
    object_name: clean(row['Объект']),
    position: clean(row['Позиция']),
    contractor: clean(row['Субподрядчик']),
    profession: clean(row['Профессия']),
    headcount: parseHeadcount(row['Количество']),
  };
}

function persist(rawRows, filled) {
  const db = getWriteDb();

  const insertRaw = db.prepare(`
    INSERT INTO people_reports (
      report_date, site, object_category, object_name, position, contractor, profession, headcount
    ) VALUES (
      @report_date, @site, @object_category, @object_name, @position, @contractor, @profession, @headcount
    )
  `);
  const insertFilled = db.prepare(`
    INSERT INTO people_reports_filled (
      report_date, site, object_category, object_name, position, contractor, profession, headcount,
      is_filled, is_weekend, source_date
    ) VALUES (
      @report_date, @site, @object_category, @object_name, @position, @contractor, @profession, @headcount,
      @is_filled, @is_weekend, @source_date
    )
  `);
  const insertDay = db.prepare(`
    INSERT INTO people_report_days (
      report_date, site, is_weekend, status, is_filled, source_date, total_headcount, entries_count
    ) VALUES (
      @report_date, @site, @is_weekend, @status, @is_filled, @source_date, @total_headcount, @entries_count
    )
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const replaceAll = db.transaction(() => {
    db.prepare('DELETE FROM people_reports').run();
    db.prepare('DELETE FROM people_reports_filled').run();
    db.prepare('DELETE FROM people_report_days').run();

    for (const row of rawRows) insertRaw.run(row);
    for (const row of filled.detailRows) insertFilled.run(row);
    for (const row of filled.dayRows) insertDay.run(row);

    upsertMeta.run({ key: 'people_last_synced_at', value: new Date().toISOString() });
    upsertMeta.run({ key: 'people_row_count', value: String(rawRows.length) });
    upsertMeta.run({ key: 'people_filled_row_count', value: String(filled.detailRows.length) });
  });

  replaceAll();
}

async function runSyncOnce() {
  const rawParsed = await fetchAndParseCsv();
  const normalizedRows = rawParsed
    .filter((row) => Object.values(row).some((v) => v && String(v).trim()))
    .map(normalizeRow)
    .filter((row) => row.report_date && row.site);

  const filled = buildFilledPeopleSeries(normalizedRows);
  persist(normalizedRows, filled);

  console.log(
    `[people-sync] загружено ${normalizedRows.length} строк, ` +
      `восстановлено ${filled.detailRows.length} строк ряда ` +
      `(${filled.dayRows.filter((d) => d.is_filled).length} дней автозаполнено)`
  );
  return normalizedRows.length;
}

function startPeopleSync() {
  runSyncOnce().catch((err) => console.error('[people-sync] ошибка стартового синка:', err.message));
  cron.schedule(CRON_SCHEDULE, () => {
    runSyncOnce().catch((err) => console.error('[people-sync] ошибка планового синка:', err.message));
  });
}

module.exports = { startPeopleSync, runSyncOnce, CSV_URL };
