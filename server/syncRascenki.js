// Периодическая индексация свода строительных расценок 2026 ТОО «VK development
// group» (rascenki_2026_svod.xlsx) в векторную коллекцию Qdrant для
// семантического поиска по видам работ ("расценка на штукатурку", "сколько
// стоит облицовка плиткой" и т.п. — см. server/rascenkiSearch.js).
//
// Отличия от остальных синков (syncConcrete/syncObjects/syncDefectActs):
//   - здесь НЕТ SQL-зеркала: домен чисто поисковый (фиксированная таблица из
//     4 блоков-классов, без агрегатов), SQLite тут ничего не считает —
//     единственный источник ответа это Qdrant. В sync_meta пишется только
//     отметка времени (rascenki_last_synced_at) для guard'а «данные ещё
//     загружаются» в chatHandler.
//   - источник данных — опубликованный CSV Google Таблицы со сводом
//     (RASCENKI_SYNC_CSV_URL). Пока таблица не опубликована, разовую загрузку
//     из локального xlsx делает server/rascenkiSeedXlsx.js тем же
//     нормализатором и индексатором, что и здесь.
//
// Одна строка свода = одна точка Qdrant. Текст для эмбеддинга — склейка
// "Раздел + Подраздел + Наименование работ + Ед.изм" (остальные поля не
// эмбеддятся, а хранятся в payload для фильтрации по классу/объекту и вывода).
const cron = require('node-cron');
const Papa = require('papaparse');
const { getWriteDb } = require('./db');
const { embedBatch, EMBEDDING_DIM } = require('./embeddings');
const { getClient, upsertPoints } = require('./qdrantClient');

const QDRANT_COLLECTION = 'rascenki_2026';
// Размер батча: столько строк уходит в один вызов эмбеддингов и в один upsert
// в Qdrant. 96 — под лимит Gemini batchEmbedContents (100 запросов за вызов).
const EMBED_BATCH_SIZE = Number(process.env.RASCENKI_EMBED_BATCH_SIZE || 96);

// Свод правится редко (входящие согласования расценок приходят пачками раз в
// несколько дней) — переиндексация раз в сутки с запасом.
const CRON_SCHEDULE = process.env.RASCENKI_SYNC_CRON || '30 4 * * *';
const CSV_URL = process.env.RASCENKI_SYNC_CSV_URL || '';

// Первый синк — не в момент старта процесса, а через пару минут: на старте
// Render Starter (512МБ) и так параллельно грузит все остальные синки (people
// ~131k строк, gpr ~150k, concrete ~11k) и балансирует на грани памяти —
// не подкидываем туда ещё и переиндексацию свода. К моменту отложенного
// запуска стартовый «шторм» уже отработал.
const FIRST_RUN_DELAY_MS = Number(process.env.RASCENKI_FIRST_SYNC_DELAY_MS || 2 * 60 * 1000);

// В шапке свода 3 «титульных» строки (название свода, название компании,
// пустая) перед строкой заголовков колонок — точную позицию не хардкодим, а
// находим по самой строке заголовков, чтобы синк не сломался, если перед
// таблицей добавят/уберут строку.
function findHeaderRow(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const cells = (matrix[i] || []).map((c) => String(c ?? '').trim().toLowerCase());
    if (cells.includes('класс') && cells.some((c) => c.startsWith('наименование'))) return i;
  }
  return 3;
}

// Сопоставление колонок по ТЕКСТУ заголовка, а не по позиции — порядок
// колонок в своде может меняться при доработках таблицы, а названия
// заголовков стабильны.
function resolveColumns(headerCells) {
  const idx = {};
  (headerCells || []).forEach((raw, i) => {
    const h = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (h === 'класс') idx.class = i;
    else if (h.startsWith('№ раздел')) idx.n_section = i;
    else if (h === 'раздел') idx.section = i;
    else if (h.startsWith('№ подраздел')) idx.n_subsection = i;
    else if (h === 'подраздел') idx.subsection = i;
    else if (h.startsWith('№ работ')) idx.n_item = i;
    else if (h.startsWith('наименование')) idx.name = i;
    else if (h.startsWith('ед')) idx.unit = i;
    else if (h.startsWith('цена без ндс')) idx.price_no_vat = i;
    else if (h.startsWith('цена с ндс')) idx.price_vat = i;
    else if (h.startsWith('обоснование')) idx.justification = i;
    else if (h === 'объект') idx.object = i;
  });
  return idx;
}

// "2 784" / "2784,00" / 2784 -> число; "-"/""/пусто -> null (расценки без
// цены в своде реально есть — их всё равно индексируем, чтобы работа
// находилась поиском, но цену показываем как «—», НЕ выдумываем значение).
function parseNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).replace(/[\s  ]/g, '').replace(',', '.').trim();
  if (!trimmed || trimmed === '-') return null;
  const num = parseFloat(trimmed);
  return Number.isNaN(num) ? null : num;
}

const clean = (value) => {
  const v = value === undefined || value === null ? '' : String(value).trim();
  return v || null;
};

// Текст для эмбеддинга — см. верхний комментарий файла.
function buildSearchableText(row) {
  return [row.section, row.subsection, row.name, row.unit].filter(Boolean).join(' ');
}

// matrix — массив массивов (строки листа как есть: из Papa.parse без header
// или из XLSX.utils.sheet_to_json({header:1})).
function normalizeMatrix(matrix) {
  const headerRow = findHeaderRow(matrix);
  const col = resolveColumns(matrix[headerRow]);
  if (col.class === undefined || col.name === undefined) {
    throw new Error('В своде расценок не найдены колонки «Класс»/«Наименование работ» — проверьте структуру таблицы');
  }

  const rows = [];
  matrix.slice(headerRow + 1).forEach((r) => {
    if (!Array.isArray(r)) return;
    const name = clean(r[col.name]);
    const cls = clean(r[col.class]);
    // Строки-подзаголовки разделов и пустые строки (без наименования или без
    // класса) в поиск не берём — эмбеддить и показывать нечего.
    if (!name || !cls) return;
    rows.push({
      id: rows.length + 1,
      class: cls,
      n_section: clean(r[col.n_section]),
      section: clean(r[col.section]),
      n_subsection: clean(r[col.n_subsection]),
      subsection: clean(r[col.subsection]),
      n_item: clean(r[col.n_item]),
      name,
      unit: clean(r[col.unit]),
      price_no_vat: parseNumber(r[col.price_no_vat]),
      price_vat: parseNumber(r[col.price_vat]),
      justification: clean(r[col.justification]),
      // Пустой «Объект» трактуем как «Все объекты» — в своде это подразумеваемое
      // значение по умолчанию (см. деление на блоки в rascenkiSearch.js).
      object: clean(r[col.object]) || 'Все объекты',
    });
  });
  return rows;
}

// Полная перезаливка коллекции (recreateCollection) — как в
// syncDefectActs.reindexEmbeddings: у строк свода нет стабильного ID, id
// назначаются заново одним и тем же проходом, точечно вычищать «осиротевшие»
// точки смысла нет.
async function reindexRascenki(rows) {
  const client = getClient();
  await client.recreateCollection(QDRANT_COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
  });

  // Индексируем поля, по которым идёт фильтрация в поиске (класс — всегда;
  // объект — чтобы отделить «утверждённые: все объекты» от «утверждённые:
  // коммерция»; section — на будущее, для сужения по разделу).
  for (const field of ['class', 'object', 'section']) {
    await client.createPayloadIndex(QDRANT_COLLECTION, {
      field_name: field,
      field_schema: 'keyword',
      wait: true,
    });
  }

  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch.map(buildSearchableText));
    const points = batch.map((row, j) => ({
      id: row.id,
      vector: vectors[j],
      payload: { ...row, searchable_text: buildSearchableText(row) },
    }));
    await upsertPoints(QDRANT_COLLECTION, points);
  }

  return rows.length;
}

function setLastSynced() {
  try {
    getWriteDb()
      .prepare(
        `INSERT INTO sync_meta (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run({ key: 'rascenki_last_synced_at', value: new Date().toISOString() });
  } catch (err) {
    console.error('[rascenki-sync] не удалось записать sync_meta:', err.message);
  }
}

async function fetchAndParseCsv() {
  if (!CSV_URL) {
    throw new Error('RASCENKI_SYNC_CSV_URL не задан — укажите ссылку на опубликованный CSV Google Таблицы со сводом расценок');
  }
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`Не удалось скачать CSV со сводом расценок: HTTP ${res.status}`);
  }
  const csvText = await res.text();
  // header:false — колонки сопоставляем сами по строке заголовков (она не
  // первая в файле, перед ней титульные строки), см. findHeaderRow.
  const { data } = Papa.parse(csvText, { skipEmptyLines: false });
  return data;
}

async function runSyncOnce() {
  const matrix = await fetchAndParseCsv();
  const rows = normalizeMatrix(matrix);
  if (!rows.length) {
    throw new Error('В своде расценок не найдено ни одной строки — проверьте структуру опубликованной таблицы');
  }
  await reindexRascenki(rows);
  setLastSynced();
  console.log(`[rascenki-sync] проиндексировано ${rows.length} расценок в Qdrant (${QDRANT_COLLECTION})`);
  return rows.length;
}

function startRascenkiSync() {
  if (!CSV_URL) {
    console.warn(
      '[rascenki-sync] RASCENKI_SYNC_CSV_URL не задан — плановый синк расценок отключён ' +
        '(разовая загрузка из xlsx: npm run rascenki:seed -- "<путь к rascenki_2026_svod.xlsx>")'
    );
    return;
  }
  // .unref() — таймер не держит процесс живым сам по себе (сервер и так слушает порт).
  setTimeout(() => {
    console.log(`[rascenki-sync] запускаю первый синк (отложен на ${Math.round(FIRST_RUN_DELAY_MS / 1000)}с после старта)`);
    runSyncOnce().catch((err) => console.error('[rascenki-sync] ошибка первого синка:', err.message));
  }, FIRST_RUN_DELAY_MS).unref();

  cron.schedule(CRON_SCHEDULE, () => {
    runSyncOnce().catch((err) => console.error('[rascenki-sync] ошибка планового синка:', err.message));
  });
}

module.exports = {
  startRascenkiSync,
  runSyncOnce,
  normalizeMatrix,
  reindexRascenki,
  setLastSynced,
  buildSearchableText,
  QDRANT_COLLECTION,
  CSV_URL,
};
