// Семантический поиск по своду строительных расценок 2026 (коллекция Qdrant
// rascenki_2026, наполняется server/syncRascenki.js). Домен «Поиск по
// расценкам» в чате аналитики (src/pages/ConcreteChatPage.jsx) — в отличие от
// остальных доменов, здесь НЕТ text-to-SQL: ответ это всегда таблица
// фиксированного формата, собранная напрямую из найденных точек, без LLM в
// роли «сформулируй ответ» (цены и обоснования нельзя перефразировать или
// досчитывать — только отдавать дословно из свода).
//
// Порядок блоков в таблице ФИКСИРОВАННЫЙ, не зависит от score:
//   1. Расценки утверждённые на предприятии — все объекты
//   2. Расценки из ЕНиР для бригад
//   3. Расценки из ЕНиР для фирм
//   4. Расценки утверждённые на предприятии — коммерция (object != «Все объекты»)
// Внутри блока — по релевантности. Пустой блок не пропускаем молча, а выводим
// строку-заглушку «нет расценок в этой категории».
const { embed } = require('./embeddings');
const { getClient, collectionStats } = require('./qdrantClient');
const { callOllamaJson } = require('./ollamaClient');

const COLLECTION = 'rascenki_2026';

const APPROVED = 'Расценки утверждённые на предприятии';
const ALL_OBJECTS = 'Все объекты';

// Блоки квадранта: блоки 1 и 4 — одна категория («утверждённые на
// предприятии»), различаются только полем object, поэтому фильтры строим
// через must/must_not по object. Столбец «Категория» их не различает
// (это дублировало бы столбец «Объект») — при пустом блоке отличие уходит
// в emptyObject.
const BLOCKS = [
  {
    label: 'Расценки утверждённые на предприятии',
    emptyObject: ALL_OBJECTS,
    filter: {
      must: [
        { key: 'class', match: { value: APPROVED } },
        { key: 'object', match: { value: ALL_OBJECTS } },
      ],
    },
  },
  {
    label: 'Расценки из ЕНиР для бригад',
    filter: { must: [{ key: 'class', match: { value: 'Расценки из ЕНиР для бригад' } }] },
  },
  {
    label: 'Расценки из ЕНиР для фирм',
    filter: { must: [{ key: 'class', match: { value: 'Расценки из ЕНиР для фирм' } }] },
  },
  {
    label: 'Расценки утверждённые на предприятии',
    emptyObject: 'Коммерческие объекты',
    filter: {
      must: [{ key: 'class', match: { value: APPROVED } }],
      must_not: [{ key: 'object', match: { value: ALL_OBJECTS } }],
    },
  },
];

const COLUMNS = ['Категория', 'Наименование работ', 'Ед.изм', 'Цена без НДС', 'Цена с НДС 16%', 'Объект', 'Обоснование'];
// Относительные ширины столбцов (см. TableAnswer в ConcreteChatPage) —
// «Наименование работ» самое длинное, единица и цены узкие.
const COL_WIDTHS = ['16%', '34%', '5%', '8%', '8%', '12%', '17%'];

const CANDIDATES_PER_BLOCK = Number(process.env.RASCENKI_CANDIDATES_PER_BLOCK || 15);
// Сколько строк показываем в блоке. Если LLM-реранкер отработал — можно
// больше (он уже отсеял лишнее); если не отработал (Ollama Cloud часто
// обрывает соединение) — показываем меньше, чтобы «что попало» не заполняло
// таблицу.
const MAX_ROWS_WITH_RERANK = Number(process.env.RASCENKI_MAX_ROWS || 6);
const MAX_ROWS_NO_RERANK = Number(process.env.RASCENKI_MAX_ROWS_NO_RERANK || 4);
// Хард-пол по косинусу (Voyage voyage-3.5-lite). На коротких русских
// запросах точные совпадения дают ~0.5–0.65, шум — ~0.35–0.45.
const MIN_SCORE = Number(process.env.RASCENKI_MIN_SCORE || 0.38);
// Относительный порог внутри блока: оставляем только позиции, чей score не
// сильно ниже лучшего в этом же блоке. Это и отсекает «что попало» даже
// когда LLM-реранкер недоступен — у нерелевантных строк косинус заметно
// меньше, чем у настоящего совпадения.
const REL_MARGIN = Number(process.env.RASCENKI_REL_MARGIN || 0.07);
// Реранкеру шлём объединённый топ по score, не все 4×15 кандидатов —
// меньше промпт, быстрее и надёжнее ответ.
const RERANK_MAX_CANDIDATES = Number(process.env.RASCENKI_RERANK_MAX_CANDIDATES || 36);
const RERANK_MODEL = process.env.RASCENKI_RERANK_MODEL || undefined; // undefined → дефолт ollamaClient
const RERANK_TIMEOUT_MS = Number(process.env.RASCENKI_RERANK_TIMEOUT_MS || 18000);
const RERANK_ATTEMPTS = Number(process.env.RASCENKI_RERANK_ATTEMPTS || 2);
// Общий потолок на реранкинг с учётом всех повторов: превысил — отдаём
// ответ по score, не заставляя пользователя ждать. Относительный порог
// (REL_MARGIN) и так отсекает основной мусор без реранкера.
const RERANK_BUDGET_MS = Number(process.env.RASCENKI_RERANK_BUDGET_MS || 22000);

const fmtPrice = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ru-RU'));

async function fetchBlockCandidates(vector, block) {
  const res = await getClient().query(COLLECTION, {
    query: vector,
    filter: block.filter,
    limit: CANDIDATES_PER_BLOCK,
    with_payload: true,
  });
  return (res.points || []).map((p) => ({ score: p.score, ...p.payload }));
}

// LLM-реранкер: в ЕНиР много позиций, близких по словам, но разных по сути
// (черновая / улучшенная / высококачественная штукатурка; стены / потолок /
// откосы). Векторный поиск их путает — просим модель оставить только реально
// подходящие под запрос и упорядочить по релевантности. Провал реранкинга не
// критичен — откатываемся на порядок по score (см. searchRascenki).
async function rerankByLlm(question, candidates) {
  const list = candidates.map((c) => ({
    id: c.id,
    раздел: c.section,
    подраздел: c.subsection,
    работа: c.name,
    ед: c.unit,
  }));
  const prompt = `Пользователь ищет строительную расценку по запросу: "${question}".
Ниже — кандидаты (JSON-массив). Верни те, что относятся к запросу:
- сам искомый вид работ во всех его вариантах (черновой/чистовой, с материалом/без, разной толщины и т.п.);
- и напрямую связанные подработы того же процесса (например для запроса "наливной пол" сюда попадают
  "грунтовка под наливной пол", "чистовая стяжка ... наливной пол").
НЕ бери позиции из другой области (для "наливной пол" — не бери штукатурку стен, кладку, электрику).
Лучше вернуть чуть больше близких по делу позиций, чем упустить нужную.
Кандидаты: ${JSON.stringify(list)}

Ответь строго JSON: {"relevant_ids": [<id>, ...]} — id в порядке убывания релевантности, без пояснений.`;

  // Ollama Cloud часто обрывает соединение (fetch failed) — пара быстрых
  // повторов сильно поднимает шанс успеха, а с коротким таймаутом это не
  // растягивает ответ надолго.
  let lastErr;
  for (let attempt = 1; attempt <= RERANK_ATTEMPTS; attempt++) {
    try {
      const out = await callOllamaJson(
        [{ role: 'user', content: prompt }],
        { format: 'json', temperature: 0, model: RERANK_MODEL, timeoutMs: RERANK_TIMEOUT_MS }
      );
      if (!Array.isArray(out?.relevant_ids)) {
        throw new Error('реранкер вернул ответ без массива relevant_ids');
      }
      // Пустой массив — валидный ответ («ничего из кандидатов не подходит»),
      // его уважаем (покажем заглушки), а не откатываемся на порядок по score.
      return out.relevant_ids.map(Number).filter((n) => Number.isInteger(n));
    } catch (err) {
      lastErr = err;
      if (attempt < RERANK_ATTEMPTS) await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw lastErr;
}

const NEEDS_REINDEX_TEXT =
  'Поиск по расценкам сейчас недоступен: индекс свода не построен или устарел. ' +
  'Запустите переиндексацию в личном кабинете администратора (раздел «Расценки»).';

function unavailable(text) {
  return { answer: { type: 'text', text }, sql: null };
}

async function searchRascenki(question) {
  // Индекс мог не создаться (переиндексацию по расценкам запускают вручную,
  // автосинка нет) или устареть по размерности вектора после смены модели
  // эмбеддингов — тогда запросы к нему падают/висят. Проверяем заранее и
  // отвечаем понятно, а не роняем чат в 500 или бесконечный спиннер.
  const stats = await collectionStats(COLLECTION);
  if (!stats.exists || stats.pointsCount === 0) {
    return unavailable(NEEDS_REINDEX_TEXT);
  }

  let vector;
  try {
    vector = await embed(question, { isQuery: true });
  } catch (err) {
    console.error('[rascenki] эмбеддинг запроса не удался:', err.message);
    return unavailable('Не удалось обработать запрос — сервис эмбеддингов временно недоступен, попробуйте позже.');
  }

  let perBlock;
  try {
    perBlock = await Promise.all(BLOCKS.map((b) => fetchBlockCandidates(vector, b)));
  } catch (err) {
    console.error('[rascenki] поиск в Qdrant не удался:', err.message);
    return unavailable(NEEDS_REINDEX_TEXT);
  }
  // Двойной фильтр по каждому блоку: хард-пол по косинусу + относительный
  // порог (не сильно ниже лучшего в блоке). Именно относительный порог
  // отсекает «что попало», когда LLM-реранкер недоступен.
  const gatedPerBlock = perBlock.map((items) => {
    const passed = items.filter((it) => it.score >= MIN_SCORE);
    if (!passed.length) return [];
    const best = Math.max(...passed.map((it) => it.score));
    return passed
      .filter((it) => it.score >= best - REL_MARGIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATES_PER_BLOCK);
  });

  let rankIndex = null; // Map<id, позиция в выдаче реранкера>; null = реранкер не отработал
  const allCandidates = gatedPerBlock
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, RERANK_MAX_CANDIDATES);
  const rerankedIds = new Set(allCandidates.map((c) => c.id));
  if (allCandidates.length) {
    try {
      const ids = await Promise.race([
        rerankByLlm(question, allCandidates),
        new Promise((_, rej) => setTimeout(() => rej(new Error('превышен бюджет времени на реранкинг')), RERANK_BUDGET_MS)),
      ]);
      rankIndex = new Map(ids.map((id, i) => [id, i]));
    } catch (err) {
      console.error('[rascenki] реранкинг недоступен/долгий, используем порядок по score:', err.message);
    }
  }

  const perBlockLimit = rankIndex ? MAX_ROWS_WITH_RERANK : MAX_ROWS_NO_RERANK;
  let totalRows = 0;
  const rows = [];
  BLOCKS.forEach((block, bi) => {
    let items = gatedPerBlock[bi];
    // Реранкер применяем к блоку только если его кандидаты вообще до него
    // дошли (в топ RERANK_MAX_CANDIDATES). Иначе — обычный порядок по score,
    // чтобы блок не оказался пустым из-за среза.
    const blockWentToRerank = items.some((it) => rerankedIds.has(it.id));
    if (rankIndex && blockWentToRerank) {
      items = items
        .filter((it) => rankIndex.has(it.id))
        .sort((a, b) => rankIndex.get(a.id) - rankIndex.get(b.id));
      items = items.slice(0, perBlockLimit);
    } else {
      items = [...items].sort((a, b) => b.score - a.score).slice(0, MAX_ROWS_NO_RERANK);
    }

    if (!items.length) {
      rows.push([block.label, 'нет расценок в этой категории', '', '', '', block.emptyObject || '', '']);
      return;
    }
    totalRows += items.length;
    for (const it of items) {
      rows.push([
        block.label,
        it.name,
        it.unit || '',
        fmtPrice(it.price_no_vat),
        fmtPrice(it.price_vat),
        it.object || '',
        it.justification || '',
      ]);
    }
  });

  const text = totalRows
    ? `Найдены расценки по запросу «${question}». Цены и обоснования — дословно из свода; проверяйте объект по каждой строке.`
    : `По запросу «${question}» в своде расценок ничего подходящего не нашлось. Попробуйте переформулировать или сузить вид работ.`;

  return {
    answer: {
      type: 'table',
      text,
      title: `Расценки: ${question}`.slice(0, 80),
      subtitle:
        'Семантический поиск по своду расценок 2026; блоки в фиксированном порядке (утверждённые → ЕНиР бригады → ЕНиР фирмы → коммерция)',
      table: { columns: COLUMNS, rows, colWidths: COL_WIDTHS },
    },
    sql: null,
  };
}

module.exports = { searchRascenki, COLLECTION };
