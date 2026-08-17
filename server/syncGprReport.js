// Синхронизация процента готовности из графиков производства работ (ГПР) —
// нескольких источников сразу (см. SOURCES ниже). Логика разбора одного
// листа 1:1 повторяет исходный Python-парсер на ноутбуке (см. историю
// задачи "парсер ГПР поз.64.ipynb"), переписанный на Node и обобщённый на
// произвольное число листов после добавления второго источника (НЖ3).
//
// Формат исходника — общий шаблон компании, стабильный между листами, хоть
// сами колонки до дат и отличаются числом (лист НЖ3 добавляет колонку
// "Подрядчик"): строка 4 (0-индекс 3) — подписи колонок, где последняя перед
// датами всегда называется "Окончание" (по ней ищем, с какой колонки
// начинаются даты — не хардкодим номер колонки на каждый лист); строка 6
// (0-индекс 5) — сами Excel-serial-даты (одна колонка = одна пятница);
// данные — с строки 8 (0-индекс 7). Колонка A содержит маркер 'поз.NN' у
// каждой строки данных этой позиции; у строк-разделов без данных (например,
// "Кровельные работы" на листе "64,72") колонка A ВСЁ РАВНО содержит маркер
// позиции — их приходится исключать по имени (source.excludeWorkNames), а
// не по пустой колонке A. У строк-заголовков "Позиция N" (итоговая сводка)
// колонка A, наоборот, пустая — их отсеивает POSITION_MARKER_RE.
const cron = require('node-cron');
const { getWriteDb } = require('./db');
const { getUnformattedValues } = require('./googleSheetsClient');

const LABELS_ROW_INDEX = 3; // 0-индекс: строка 4 — подписи колонок, последняя перед датами — "Окончание"
const HEADER_ROW_INDEX = 5; // 0-индекс: строка 6 — Excel-serial-даты
const FIRST_DATA_ROW_INDEX = 7; // 0-индекс: строка 8 — первая строка с данными
const DATA_RANGE = 'A1:CZ600'; // с запасом и по строкам (лист "план_processed" доходит до строки 454), и по колонкам

const POSITION_MARKER_RE = /^поз\.\d+/;

const SOURCES = [
  {
    key: 'poz64_72',
    label: 'ГПР 64,72',
    spreadsheetId: '1eC80R11Hp26IVfLLa4M-_wnYGqTRHEi6k2_XG5Goqf0',
    sheetName: '64,72',
    // поз.64 и поз.72 — основные (не "коммерческие") блоки этого листа. Есть
    // ещё 'поз.64 ком.'/'поз.72 ком.' (отдельные строки-маркеры для
    // коммерческих помещений тех же позиций) — их намеренно не включаем,
    // не просили.
    includePosition: (pos) => pos === 'поз.64' || pos === 'поз.72',
    // Строки-разделы без данных (заголовок группы работ, а не отдельная работа).
    excludeWorkNames: new Set(['Кровельные работы', 'Окна и витражи', 'ВК и ОВ']),
  },
  {
    key: 'nz3',
    label: 'ГПР НЖ3 (ОВ, ВК)',
    spreadsheetId: '160_Nmmj4p0jX5NdJLTpRntoFHDHoxiyZptEVdp0U3mE',
    sheetName: 'НЖ3',
    // Вся вкладка целиком — любая позиция с маркером поз.NN (56, 72, 69, 64, 63, 59, 65).
    includePosition: () => true,
    // "Водоснабжение и канализация" и "Отопление" здесь — промежуточные
    // итоги (агрегат по своим же дочерним строкам: "Ливневая канализация"/
    // "Пожарный водопровод"/"Канализация"/"ХВС"/"ГВС" и "Отопление
    // (стояки)"/"...(разводка и радиаторы)"/"...(тепловой узел)"
    // соответственно) — НЕ отдельная работа, поэтому не пропуск, если
    // пусто. В листе "64,72" эти же названия — реальные конечные позиции,
    // их исключение отсюда не касается (разные source, разные списки).
    excludeWorkNames: new Set(['Водоснабжение и канализация', 'Отопление']),
  },
  {
    key: 'facades',
    label: 'Фасады',
    spreadsheetId: '1WcB1F8B8vdth1DHwa6UkKSfMag1UmDzRWcuHik9kUEA',
    sheetName: 'план_processed',
    // Вся вкладка целиком — 5 объектов (Нурлы Жол 3, Спорт, Экополис, Лицей,
    // Ледовый каток), 16 позиций (56, 59, 63, 64, 65, 69, 72, 74, 76,
    // "73,75", 93, 100, 101, 103, 104, 105).
    includePosition: () => true,
    excludeWorkNames: new Set(),
    // У части позиций есть несколько блоков (например, поз.59 — 4 блока):
    // строка "Блок N" в колонке "Конструктивы" — промежуточный итог по
    // своим дочерним строкам (та же природа, что "Позиция N"/подытоги в
    // НЖ3), не отдельная работа. См. блок-трекинг в fetchAndParseSource.
    blockMarkerRe: /^Блок\s+\d+/i,
  },
  {
    key: 'sport2',
    label: 'ГПР Спорт 2',
    spreadsheetId: '1I1zCQjPKGjZmRp2yIr23shae6SXMV-I6YO-rDGzvBgA',
    sheetName: 'ГПР',
    // Вся вкладка целиком — 6 позиций (73,75, 74, 76, 93, 100, 101). У листа
    // есть доп. колонка "план/факт/прогноз" (B) и строки-материалы (тип
    // "Материал" в последней колонке) вперемешку со строками-работами —
    // но и у "Позиция N"-сводок, и у строк-материалов колонка A (позиция)
    // пустая, так что оба вида уже отсеиваются общей проверкой
    // POSITION_MARKER_RE, без доп. фильтров.
    includePosition: () => true,
    excludeWorkNames: new Set(),
  },
];

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

async function fetchAndParseSource(source) {
  const raw = await getUnformattedValues(source.spreadsheetId, source.sheetName, DATA_RANGE);

  const labelsRow = raw[LABELS_ROW_INDEX] || [];
  const endColIndex = labelsRow.findIndex((v) => typeof v === 'string' && v.trim() === 'Окончание');
  if (endColIndex === -1) {
    throw new Error(`[${source.key}] не найдена колонка "Окончание" в строке заголовков листа "${source.sheetName}"`);
  }
  const firstDateCol = endColIndex + 1;

  const workNameColIndex = labelsRow.findIndex((v) => typeof v === 'string' && v.trim() === 'Конструктивы');
  if (workNameColIndex === -1) {
    throw new Error(`[${source.key}] не найдена колонка "Конструктивы" в строке заголовков листа "${source.sheetName}"`);
  }

  const headerRow = raw[HEADER_ROW_INDEX] || [];
  // Колонки без числа в заголовке (пустой хвост таблицы) — не настоящие
  // недельные колонки, пропускаем их.
  const dateColumns = [];
  for (let c = firstDateCol; c < headerRow.length; c++) {
    const serial = headerRow[c];
    if (typeof serial === 'number' && Number.isFinite(serial)) {
      dateColumns.push({ colIndex: c, reportDate: excelSerialToISODate(serial) });
    }
  }

  const rows = [];
  let currentPosition = '';
  let currentBlock = '';
  for (let r = FIRST_DATA_ROW_INDEX; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row.length) continue;

    const position = (row[0] || '').toString().trim();
    if (!position || !POSITION_MARKER_RE.test(position)) continue; // "Позиция N" — итоговая строка, не данные
    if (position !== currentPosition) {
      currentPosition = position;
      currentBlock = '';
    }
    if (!source.includePosition(position)) continue;

    const workName = (row[workNameColIndex] || '').toString().trim();
    if (!workName) continue;

    if (source.blockMarkerRe && source.blockMarkerRe.test(workName)) {
      currentBlock = workName; // подытог блока, не отдельная работа — только запоминаем контекст
      continue;
    }

    if (source.excludeWorkNames.has(workName)) continue;

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
      rows.push({
        source_key: source.key,
        source_label: source.label,
        position,
        block: currentBlock,
        work_name: workName,
        report_date: reportDate,
        percent,
      });
    }
  }

  return rows;
}

async function fetchAndParse() {
  const all = [];
  for (const source of SOURCES) {
    const rows = await fetchAndParseSource(source);
    all.push(...rows);
  }
  return all;
}

function storeValues(rows) {
  const db = getWriteDb();
  const insert = db.prepare(`
    INSERT INTO gpr_report_values (source_key, source_label, position, block, work_name, report_date, percent)
    VALUES (@source_key, @source_label, @position, @block, @work_name, @report_date, @percent)
  `);
  const upsertMeta = db.prepare(`
    INSERT INTO sync_meta (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const replaceAll = db.transaction((allRows) => {
    db.prepare(`DELETE FROM gpr_report_values`).run();
    for (const row of allRows) insert.run(row);
    upsertMeta.run({ key: 'gpr_report_last_synced_at', value: new Date().toISOString() });
    upsertMeta.run({ key: 'gpr_report_row_count', value: String(allRows.length) });
  });

  replaceAll(rows);
  return rows.length;
}

// Контрольный рубеж — пятница, за которую уже наступил срок отчитаться.
// Отчёты заполняются каждую пятницу, но срок наступает не в саму пятницу,
// а во ВТОРНИК после неё — у ответственных остаются суббота, воскресенье
// и понедельник на дозаполнение без блокировки. Поэтому с пятницы по
// понедельник включительно рубежом всё ещё считается пятница НЕДЕЛЕЙ
// РАНЬШЕ (та, что уже прошла свой вторник), и только начиная со вторника
// рубеж сдвигается на только что прошедшую пятницу. Например, если
// сегодня вторник 11.08.2026 или позже (до следующей пятницы) — рубеж
// пятница 07.08.2026; если сегодня пятница/суббота/воскресенье/
// понедельник 07-10.08.2026 — рубеж всё ещё пятница 31.07.2026.
function lastFridayOnOrBefore(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Вс ... 5=Пт ... 6=Сб
  const diffToFriday = (day - 5 + 7) % 7; // сколько дней назад была последняя пятница (0, если сегодня пятница)
  d.setDate(d.getDate() - diffToFriday);
  if (diffToFriday < 4) {
    // Сегодня пт/сб/вс/пн после этой пятницы — срок ещё не наступил,
    // откатываемся на пятницу неделей раньше.
    d.setDate(d.getDate() - 7);
  }
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Пропуск = (источник, позиция, конструктив), у которого ЕСТЬ хоть одна
// заполненная неделя раньше (значит, работа реально идёт — это не "ещё не
// начали"), но после последней заполненной недели и вплоть до контрольной
// пятницы остались пустые ячейки. Проверено на реальных данных исходника:
// конструктивы, дошедшие до 100%, продолжают явно перезаполняться каждую
// неделю (100% повторяется, а не оставляется пустым) — пустой хвост
// появляется только у ещё незавершённых работ, то есть это настоящий
// "забыли занести", а не "работа закончена, дальше нечего репортить".
// Считает СРАЗУ по всем источникам (SOURCES) — вызывающий код (админ-панель,
// проверка блокировки email) не завязан на конкретный лист/позицию.
function computeGprReportGaps({ asOf } = {}) {
  const db = getWriteDb();
  const cutoffDate = lastFridayOnOrBefore(asOf || new Date());
  const cutoff = toISODate(cutoffDate);

  const rows = db
    .prepare(
      `SELECT source_key, source_label, position, block, work_name, report_date, percent
       FROM gpr_report_values
       WHERE report_date <= ?
       ORDER BY source_key, position, block, work_name, report_date`
    )
    .all(cutoff);

  const byGroup = new Map();
  for (const row of rows) {
    const key = `${row.source_key}|${row.position}|${row.block}|${row.work_name}`;
    if (!byGroup.has(key)) byGroup.set(key, { meta: row, entries: [] });
    byGroup.get(key).entries.push(row);
  }

  const gaps = [];
  for (const { meta, entries } of byGroup.values()) {
    let lastFilledIndex = -1;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].percent !== null) lastFilledIndex = i;
    }
    if (lastFilledIndex === -1) continue; // работа ещё ни разу не заполнялась — не пропуск, а "не начата"

    const missingDates = entries.slice(lastFilledIndex + 1).map((e) => e.report_date);
    if (missingDates.length) {
      gaps.push({
        source_key: meta.source_key,
        source_label: meta.source_label,
        position: meta.position,
        block: meta.block,
        work_name: meta.work_name,
        last_filled_date: entries[lastFilledIndex].report_date,
        last_filled_percent: entries[lastFilledIndex].percent,
        missing_dates: missingDates,
      });
    }
  }

  return { cutoff, gaps };
}

async function runSyncOnce() {
  const rows = await fetchAndParse();
  const count = storeValues(rows);
  console.log(`[gpr-report-sync] загружено ${count} значений (${SOURCES.map((s) => s.key).join(', ')})`);
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
  SOURCES,
};
