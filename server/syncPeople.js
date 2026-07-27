// Периодическая синхронизация ежедневных отчётов по людям: тот же публичный
// CSV-экспорт Google Таблицы, что уже читают src/PeopleDashboardPage.js и
// src/PeopleReportCharts.js на клиенте -> таблица people_reports.
//
// Синк разделён на два шага:
//   1) syncRawFromSheet()   — тянет CSV, полностью перезаписывает только
//      сырую таблицу people_reports.
//   2) rebuildDerivedTables() — пересчитывает people_report_gaps и
//      people_reports_resolved из уже сохранённых people_reports +
//      people_gap_decisions (решений администратора, см. peopleGapsAdmin.js).
// Второй шаг вызывается и после каждого синка, и сразу после того, как
// администратор принял/отменил решение по конкретному пропуску — поэтому он
// вынесен отдельной экспортируемой функцией, а не зашит внутрь синка.
//
// Полная перезапись сырых данных при каждом синке — как и в
// syncConcrete.js/syncObjects.js: у строк исходной таблицы нет стабильного ID,
// а объём данных пока небольшой. people_gap_decisions при этом НИКОГДА не
// перезаписывается синком — это решения человека, они должны переживать
// обновление сырых данных.
const cron = require('node-cron');
const Papa = require('papaparse');
const { getWriteDb } = require('./db');
const { detectPeopleGaps } = require('./peopleGapDetection');

const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS0qVYHkI9ySfT0LO9SwG36BYrmI-chO09ws7GSjWcnQU2pX4Gzw-R4LXg6tdi44KXa1i5yQYcLF27U/pub?output=csv';

const CRON_SCHEDULE = process.env.PEOPLE_SYNC_CRON || '0 */2 * * *';

const clean = (value) => {
  const v = (value || '').toString().trim();
  return v ? v : null;
};

// Дата в этой таблице уже приходит в формате 'YYYY-MM-DD' (в отличие от
// concrete/objects, где даты — 'ДД.ММ.ГГГГ'), но на всякий случай проверяем
// формат, а не доверяем ему слепо.
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

function persistRaw(rawRows) {
  const db = getWriteDb();
  const insertRaw = db.prepare(`
    INSERT INTO people_reports (
      report_date, site, object_category, object_name, position, contractor, profession, headcount
    ) VALUES (
      @report_date, @site, @object_category, @object_name, @position, @contractor, @profession, @headcount
    )
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const replaceAll = db.transaction(() => {
    db.prepare('DELETE FROM people_reports').run();
    for (const row of rawRows) insertRaw.run(row);
    upsertMeta.run({ key: 'people_last_synced_at', value: new Date().toISOString() });
    upsertMeta.run({ key: 'people_row_count', value: String(rawRows.length) });
  });

  replaceAll();
}

async function syncRawFromSheet() {
  const rawParsed = await fetchAndParseCsv();
  const normalizedRows = rawParsed
    .filter((row) => Object.values(row).some((v) => v && String(v).trim()))
    .map(normalizeRow)
    .filter((row) => row.report_date && row.site);

  persistRaw(normalizedRows);
  return normalizedRows.length;
}

const groupDateKey = (site, date) => site + '::' + date;

// Пересчитывает people_report_gaps и people_reports_resolved из того, что
// уже лежит в БД: сырых отчётов (people_reports) и решений администратора
// (people_gap_decisions). Ничего не скачивает из интернета — чистая функция
// над текущим состоянием БД, поэтому безопасно вызывать после каждого
// изменения решений, не дожидаясь следующего планового синка.
function rebuildDerivedTables() {
  const db = getWriteDb();

  const rawRows = db.prepare(`
    SELECT report_date, site, object_category, object_name, position, contractor, profession, headcount
    FROM people_reports
  `).all();

  const decisions = db.prepare(`
    SELECT site, report_date, action, source_date, decided_by, decided_at
    FROM people_gap_decisions
  `).all();
  const decisionByKey = new Map(decisions.map((d) => [groupDateKey(d.site, d.report_date), d]));

  // Строки для каждой реальной даты по участку — нужны, чтобы материализовать
  // action='copy': копируем именно детальные строки source_date, а не сводную цифру.
  const rowsByGroupDate = new Map();
  for (const row of rawRows) {
    const key = groupDateKey(row.site, row.report_date);
    if (!rowsByGroupDate.has(key)) rowsByGroupDate.set(key, []);
    rowsByGroupDate.get(key).push(row);
  }

  const baseGaps = detectPeopleGaps(rawRows);

  const finalGapRows = [];
  const resolvedDetailRows = [];

  for (const gap of baseGaps) {
    const key = groupDateKey(gap.site, gap.report_date);

    if (gap.status === 'real') {
      finalGapRows.push({ ...gap, decided_by: null, decided_at: null, source_date: null });
      for (const row of rowsByGroupDate.get(key) || []) {
        resolvedDetailRows.push({
          ...row,
          is_filled: 0,
          is_weekend: gap.is_weekend,
          source_date: null,
          decided_by: null,
        });
      }
      continue;
    }

    // status === 'missing' (рабочий день или выходной без отчёта) — смотрим,
    // есть ли решение человека. Больше нет отдельного "выходной без отчёта —
    // это норма": по требованию пользователя выходные тоже считаются
    // пропуском и ждут явного решения администратора.
    const decision = decisionByKey.get(key);
    if (!decision) {
      finalGapRows.push({ ...gap, decided_by: null, decided_at: null, source_date: null });
      continue;
    }

    if (decision.action === 'confirm_no_report') {
      finalGapRows.push({
        ...gap,
        status: 'resolved_no_report',
        decided_by: decision.decided_by,
        decided_at: decision.decided_at,
        source_date: null,
      });
      continue;
    }

    if (decision.action === 'copy' && decision.source_date) {
      const sourceKey = groupDateKey(gap.site, decision.source_date);
      const sourceRows = rowsByGroupDate.get(sourceKey) || [];
      const total = sourceRows.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);

      finalGapRows.push({
        ...gap,
        status: 'resolved_copy',
        total_headcount: total,
        entries_count: sourceRows.length,
        decided_by: decision.decided_by,
        decided_at: decision.decided_at,
        source_date: decision.source_date,
      });

      for (const row of sourceRows) {
        resolvedDetailRows.push({
          ...row,
          report_date: gap.report_date,
          is_filled: 1,
          is_weekend: gap.is_weekend,
          source_date: decision.source_date,
          decided_by: decision.decided_by,
        });
      }
      continue;
    }

    // Решение есть, но некорректное (например, action='copy' без source_date,
    // либо source_date без реальных строк) — не материализуем данные, оставляем
    // пропуск как есть, чтобы не потерять сигнал "требует внимания".
    finalGapRows.push({ ...gap, decided_by: null, decided_at: null, source_date: null });
  }

  const insertGap = db.prepare(`
    INSERT INTO people_report_gaps (
      report_date, site, is_weekend, status, total_headcount, entries_count,
      decided_by, decided_at, source_date
    ) VALUES (
      @report_date, @site, @is_weekend, @status, @total_headcount, @entries_count,
      @decided_by, @decided_at, @source_date
    )
  `);
  const insertResolved = db.prepare(`
    INSERT INTO people_reports_resolved (
      report_date, site, object_category, object_name, position, contractor, profession, headcount,
      is_filled, is_weekend, source_date, decided_by
    ) VALUES (
      @report_date, @site, @object_category, @object_name, @position, @contractor, @profession, @headcount,
      @is_filled, @is_weekend, @source_date, @decided_by
    )
  `);

  const replaceDerived = db.transaction(() => {
    db.prepare('DELETE FROM people_report_gaps').run();
    db.prepare('DELETE FROM people_reports_resolved').run();
    for (const row of finalGapRows) insertGap.run(row);
    for (const row of resolvedDetailRows) insertResolved.run(row);
  });

  replaceDerived();

  return {
    gapRowCount: finalGapRows.length,
    resolvedRowCount: resolvedDetailRows.length,
    pendingGaps: finalGapRows.filter((r) => r.status === 'missing').length,
  };
}

async function runSyncOnce() {
  const rowCount = await syncRawFromSheet();
  const derived = rebuildDerivedTables();

  console.log(
    `[people-sync] загружено ${rowCount} строк, ` +
      `${derived.pendingGaps} пропусков ждут решения администратора`
  );
  return rowCount;
}

function startPeopleSync() {
  runSyncOnce().catch((err) => console.error('[people-sync] ошибка стартового синка:', err.message));
  cron.schedule(CRON_SCHEDULE, () => {
    runSyncOnce().catch((err) => console.error('[people-sync] ошибка планового синка:', err.message));
  });
}

module.exports = { startPeopleSync, runSyncOnce, rebuildDerivedTables, CSV_URL };
