// Синхронизация процента готовности из графика производства работ (ГПР),
// лист "64,72", только строки позиции 'поз.64' (позиция 72 того же листа
// пока не нужна — явное решение пользователя, легко расширить позже).
// Логика разбора 1:1 повторяет исходный Python-парсер на ноутбуке
// (см. историю задачи "парсер ГПР поз.64.ipynb"), переписанный на Node,
// чтобы встроить в тот же процесс, что и остальные синки этого проекта.
//
// Формат исходника (googlesheets, тот же файл, что и ссылка "ГПР 64, 72" на
// /grafiki): строка 6 (0-индекс 5) — заголовок с датами (Excel-serial-числа,
// одна колонка = одна пятница, начиная с колонки F/индекс 5); данные — с
// строки 8 (0-индекс 7). Колонка A содержит маркер 'поз.64' у КАЖДОЙ строки
// этой позиции (включая три строки-разделы без данных — "Кровельные
// работы"/"Окна и витражи"/"ВК и ОВ" — их исключаем по имени, как и
// ноутбук). Ячейка "Процент" пустая = работа этой недели ещё НЕ занесена в
// отчёт (не путать с 0% — ноль тоже явно проставляется, когда работы ещё не
// начаты, см. комментарий у computeGprReportGaps ниже).
const cron = require('node-cron');
const { getWriteDb } = require('./db');
const { getUnformattedValues } = require('./googleSheetsClient');

const SPREADSHEET_ID = '1eC80R11Hp26IVfLLa4M-_wnYGqTRHEi6k2_XG5Goqf0';
const SHEET_NAME = '64,72';
const POSITION = 'поз.64';
const DATA_RANGE = 'A1:CA200'; // с запасом по строкам; реальных строк позиции — 19

const HEADER_ROW_INDEX = 5; // 0-индекс: строка 6 в таблице — Excel-serial-даты
const FIRST_DATA_ROW_INDEX = 7; // 0-индекс: строка 8 — первая строка с данными
const FIRST_DATE_COL_INDEX = 5; // 0-индекс: колонка F — первая недельная колонка

const SECTION_HEADERS = new Set(['Кровельные работы', 'Окна и витражи', 'ВК и ОВ']);

const CRON_SCHEDULE = process.env.GPR_REPORT_SYNC_CRON || '0 */6 * * *';

// Excel/Sheets серийная дата -> 'YYYY-MM-DD'. origin 1899-12-30 — тот же,
// что в ноутбуке (pandas: unit='D', origin='1899-12-30'), учитывает
// исторический баг Excel с "1900 — високосный год".
function excelSerialToISODate(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchAndParse() {
  const raw = await getUnformattedValues(SPREADSHEET_ID, SHEET_NAME, DATA_RANGE);

  const headerRow = raw[HEADER_ROW_INDEX] || [];
  // Колонки без числа в заголовке (пустой хвост таблицы) — не настоящие
  // недельные колонки, пропускаем их (тот же фильтр, что в ноутбуке).
  const dateColumns = [];
  for (let c = FIRST_DATE_COL_INDEX; c < headerRow.length; c++) {
    const serial = headerRow[c];
    if (typeof serial === 'number' && Number.isFinite(serial)) {
      dateColumns.push({ colIndex: c, reportDate: excelSerialToISODate(serial) });
    }
  }

  const rows = [];
  for (let r = FIRST_DATA_ROW_INDEX; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row.length) continue;
    if (row[0] !== POSITION) continue;

    const workName = (row[2] || '').toString().trim();
    if (!workName || SECTION_HEADERS.has(workName)) continue;

    for (const { colIndex, reportDate } of dateColumns) {
      const cell = row[colIndex];
      let percent = null;
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        percent = cell * 100;
      } else if (typeof cell === 'string' && cell.trim() !== '') {
        const parsed = parseFloat(cell.replace(',', '.'));
        if (!Number.isNaN(parsed)) percent = parsed * 100;
      }
      // cell === undefined/''/null -> percent остаётся null (пусто в исходнике)
      rows.push({ position: POSITION, work_name: workName, report_date: reportDate, percent });
    }
  }

  return rows;
}

function storeValues(rows) {
  const db = getWriteDb();
  const insert = db.prepare(`
    INSERT INTO gpr_report_values (position, work_name, report_date, percent)
    VALUES (@position, @work_name, @report_date, @percent)
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const replaceAll = db.transaction((allRows) => {
    db.prepare(`DELETE FROM gpr_report_values WHERE position = ?`).run(POSITION);
    for (const row of allRows) insert.run(row);
    upsertMeta.run({ key: 'gpr_report_last_synced_at', value: new Date().toISOString() });
    upsertMeta.run({ key: 'gpr_report_row_count', value: String(allRows.length) });
  });

  replaceAll(rows);
  return rows.length;
}

// Ближайшая пятница на дату `date` или раньше — контрольный рубеж
// "отчёты заполняются каждую пятницу, проверяем в понедельник за прошлую
// пятницу или раньше": если сегодня, скажем, среда 12.08.2026, рубеж —
// пятница 07.08.2026, и КАЖДЫЙ конструктив должен иметь непустой % на эту
// дату (или позже уже не важно — но не раньше).
function lastFridayOnOrBefore(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Вс ... 5=Пт ... 6=Сб
  const diff = (day - 5 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Пропуск = конструктив, у которого ЕСТЬ хоть одна заполненная неделя
// раньше (значит, работа реально идёт — это не "ещё не начали"), но после
// последней заполненной недели и вплоть до контрольной пятницы остались
// пустые ячейки. Проверено на реальных данных исходника: конструктивы,
// дошедшие до 100%, продолжают явно перезаполняться каждую неделю (100%
// повторяется, а не оставляется пустым) — пустой хвост появляется только у
// ещё незавершённых работ, то есть это настоящий "забыли занести", а не
// "работа закончена, дальше нечего репортить".
function computeGprReportGaps({ asOf } = {}) {
  const db = getWriteDb();
  const cutoffDate = lastFridayOnOrBefore(asOf || new Date());
  const cutoff = toISODate(cutoffDate);

  const rows = db
    .prepare(
      `SELECT work_name, report_date, percent
       FROM gpr_report_values
       WHERE position = ? AND report_date <= ?
       ORDER BY work_name, report_date`
    )
    .all(POSITION, cutoff);

  const byWork = new Map();
  for (const row of rows) {
    if (!byWork.has(row.work_name)) byWork.set(row.work_name, []);
    byWork.get(row.work_name).push(row);
  }

  const gaps = [];
  for (const [workName, entries] of byWork) {
    let lastFilledIndex = -1;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].percent !== null) lastFilledIndex = i;
    }
    if (lastFilledIndex === -1) continue; // работа ещё ни разу не заполнялась — не пропуск, а "не начата"

    const missingDates = entries.slice(lastFilledIndex + 1).map((e) => e.report_date);
    if (missingDates.length) {
      gaps.push({
        work_name: workName,
        last_filled_date: entries[lastFilledIndex].report_date,
        last_filled_percent: entries[lastFilledIndex].percent,
        missing_dates: missingDates,
      });
    }
  }

  return { position: POSITION, cutoff, gaps };
}

async function runSyncOnce() {
  const rows = await fetchAndParse();
  const count = storeValues(rows);
  console.log(`[gpr-report-sync] загружено ${count} значений (${POSITION})`);
  return count;
}

function startGprReportSync() {
  runSyncOnce().catch((err) => console.error('[gpr-report-sync] ошибка стартового синка:', err.message));
  cron.schedule(CRON_SCHEDULE, () => {
    runSyncOnce().catch((err) => console.error('[gpr-report-sync] ошибка планового синка:', err.message));
  });
}

module.exports = {
  startGprReportSync,
  runSyncOnce,
  computeGprReportGaps,
  lastFridayOnOrBefore,
  POSITION,
  SPREADSHEET_ID,
  SHEET_NAME,
};
