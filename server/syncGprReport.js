// Синхронизация процента готовности из графиков производства работ (ГПР) —
// нескольких источников сразу (см. SOURCES ниже). Логика разбора одного
// листа 1:1 повторяет исходный Python-парсер на ноутбуке (см. историю
// задачи "парсер ГПР поз.64.ipynb"), переписанный на Node и обобщённый на
// произвольное число листов после добавления второго источника (НЖ3).
//
// Формат исходника — общий шаблон компании, стабильный между листами по
// смыслу, но не по точному номеру строки/колонки (сколько строк-заголовков
// объекта идёт перед подписями колонок, растянуты ли недельные даты на одну
// строку или на несколько подряд — у листа "факт" (Нурлы Жол 4) 2025 год и
// 2026-2027 годы прописаны в двух РАЗНЫХ строках одна под другой, видимо
// из-за того что таблицу дописывали по частям). Поэтому строка подписей и
// строки с датами ищутся динамически, а не хардкодятся номером:
// - строка подписей — первая строка, где есть ячейка "Окончание" (по ней же
//   вычисляем колонку начала недельных дат, и "Конструктивы" — колонку
//   названия работы); ищем в первых LABELS_SEARCH_ROWS строках;
// - дальше подряд читаем строки и собираем из них ячейки-serial-даты
//   (число >= MIN_DATE_SERIAL — так отличаем реальную дату от, например,
//   доли 0..1 в строке-подытоге "Позиция N"), пока не упрёмся в границу
//   данных: либо колонка A уже содержит маркер 'поз.NN' (данные начались
//   без явной строки-подытога), либо колонка "Конструктивы" содержит
//   "Позиция ..." (итоговая сводка перед данными этой позиции).
// Колонка A содержит маркер 'поз.NN' у каждой строки данных этой позиции; у
// строк-разделов без данных (например, "Кровельные работы" на листе
// "64,72") колонка A ВСЁ РАВНО содержит маркер позиции — их приходится
// исключать по имени (source.excludeWorkNames), а не по пустой колонке A.
// У строк-заголовков "Позиция N" колонка A, наоборот, пустая — их отсеивает
// POSITION_MARKER_RE.
const cron = require('node-cron');
const { getWriteDb } = require('./db');
const { getUnformattedValues } = require('./googleSheetsClient');

const LABELS_SEARCH_ROWS = 10; // сколько первых строк листа проверяем в поисках подписи "Окончание"
const MIN_DATE_SERIAL = 40000; // Excel-serial дат начиная примерно с 2009 года
const MAX_DATE_SERIAL = 60000; // ...и примерно по 2064 год — обе границы просто отсекают заведомо не-даты
                                // (доли 0..1, суммы в тенге и т.п.), которые тоже могут быть числами
const DATA_RANGE = 'A1:FZ1000'; // с запасом и по строкам, и по колонкам (лист "факт" использует до ~150 колонок)

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
  {
    key: 'nz4',
    label: 'ГПР Нурлы Жол 4',
    spreadsheetId: '102E0nzIE4gyp_t4HNozvy4w-dZAa8rZ_oqx_L5IAPjQ',
    sheetName: 'факт',
    // 2025 год и 2026-2027 годы прописаны в двух строках подряд под
    // подписями (offset 1 и 2 от строки подписей), а не в одной, как у
    // остальных листов (offset 2 по умолчанию) — см. dateRowOffsets ниже.
    dateRowOffsets: [1, 2],
    // Вся вкладка целиком — 9 позиций (1.1..1.9). У листа есть колонка
    // "Категория" (последняя), размечающая каждую строку данных как
    // "Работа" (реальная работа, отслеживаем % готовности) или "Материал"
    // (расход материала, например "Арматура АI Ø6, тн" — число там не %
    // готовности, а доля/объём поставки) — и, в отличие от листа "ГПР
    // Спорт 2", строки-материалы здесь ИМЕЮТ маркер позиции в колонке A
    // (не отсеиваются пустой колонкой A), поэтому фильтруются явно по
    // "Категория" === "Материал" (см. fetchAndParseSource).
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

  let labelsRowIndex = -1;
  let endColIndex = -1;
  for (let r = 0; r < Math.min(raw.length, LABELS_SEARCH_ROWS); r++) {
    const idx = (raw[r] || []).findIndex((v) => typeof v === 'string' && v.trim() === 'Окончание');
    if (idx !== -1) {
      labelsRowIndex = r;
      endColIndex = idx;
      break;
    }
  }
  if (labelsRowIndex === -1) {
    throw new Error(`[${source.key}] не найдена колонка "Окончание" в первых строках листа "${source.sheetName}"`);
  }
  const labelsRow = raw[labelsRowIndex];
  const firstDateCol = endColIndex + 1;

  const workNameColIndex = labelsRow.findIndex((v) => typeof v === 'string' && v.trim() === 'Конструктивы');
  if (workNameColIndex === -1) {
    throw new Error(`[${source.key}] не найдена колонка "Конструктивы" в строке заголовков листа "${source.sheetName}"`);
  }

  // Категория строки ("Работа"/"Материал") — есть не у всех листов; если
  // колонки нет, ниже просто ничего не фильтруется по ней.
  const categoryColIndex = labelsRow.findIndex((v) => typeof v === 'string' && v.trim() === 'Категория');

  // Некоторые листы (например "64,72", "факт") дописывают справа побочную
  // таблицу "Остаток по КС" (сверка оплат) — свои даты-маркеры (тоже
  // правдоподобные serial-числа) и суммы в тенге, начинающуюся с текстовых
  // подписей вроде "Доля"/"Сумма по КС"/"Остаток"/"НДС ...%" в строке
  // подписей. Отсекаем недельные колонки ДО первой такой текстовой ячейки
  // после firstDateCol — иначе побочная таблица подмешивает свои
  // даты-маркеры к недельным (реальная коллизия: те же календарные даты на
  // ДРУГИХ номерах колонок дают дубликат в БД).
  let boundaryCol = Infinity; // нет текстовой ячейки в пределах labelsRow — значит, побочной таблицы нет, границу не ставим
  for (let c = firstDateCol; c < labelsRow.length; c++) {
    if (typeof labelsRow[c] === 'string' && labelsRow[c].trim() !== '') {
      boundaryCol = c;
      break;
    }
  }

  // Недельные даты — в строке(-ах) на source.dateRowOffsets ниже строки
  // подписей (по умолчанию [2] — так исторически устроены все листы, кроме
  // "факт", где 2025 год и 2026-2027 годы прописаны в двух строках подряд,
  // offset [1, 2]).
  const dateColumnsMap = new Map(); // colIndex -> reportDate
  for (const offset of source.dateRowOffsets || [2]) {
    const row = raw[labelsRowIndex + offset] || [];
    for (let c = firstDateCol; c < Math.min(row.length, boundaryCol); c++) {
      const v = row[c];
      if (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= MIN_DATE_SERIAL &&
        v <= MAX_DATE_SERIAL &&
        !dateColumnsMap.has(c)
      ) {
        dateColumnsMap.set(c, excelSerialToISODate(v));
      }
    }
  }
  const dateColumns = [...dateColumnsMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([colIndex, reportDate]) => ({ colIndex, reportDate }));

  // Первая строка данных — динамически ищем начиная сразу после подписей:
  // как только встречаем маркер позиции 'поз.NN' в колонке A, либо
  // "Позиция N" (итоговая сводка) в колонке "Конструктивы". Именно \s, а
  // не \b — у кириллицы JS-регэксп \b не работает ожидаемо ("я" не
  // считается символом \w), так что "Позиция\b" не совпадёт вообще.
  let firstDataRowIndex = labelsRowIndex + 1;
  for (let r = labelsRowIndex + 1; r < raw.length; r++) {
    const row = raw[r] || [];
    const pos0 = (row[0] || '').toString().trim();
    const workCell = (row[workNameColIndex] || '').toString().trim();
    if (POSITION_MARKER_RE.test(pos0) || /^Позиция\s/i.test(workCell)) {
      firstDataRowIndex = r;
      break;
    }
    firstDataRowIndex = r + 1;
  }

  const rows = [];
  let currentPosition = '';
  let currentBlock = '';
  for (let r = firstDataRowIndex; r < raw.length; r++) {
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

    if (categoryColIndex !== -1) {
      const category = (row[categoryColIndex] || '').toString().trim();
      if (category === 'Материал') continue; // расход материала, не % готовности работы
    }

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
