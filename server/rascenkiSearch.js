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

// Блоки квадранта: класс 1 и 4 различаются только полем object (оба —
// «утверждённые на предприятии»), поэтому фильтры строим через must/must_not
// по object, а не только по class.
const BLOCKS = [
  {
    label: 'Расценки утверждённые на предприятии — все объекты',
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
    label: 'Расценки утверждённые на предприятии — коммерция',
    filter: {
      must: [{ key: 'class', match: { value: APPROVED } }],
      must_not: [{ key: 'object', match: { value: ALL_OBJECTS } }],
    },
  },
];

const COLUMNS = ['Класс', 'Наименование работ', 'Ед.изм', 'Цена без НДС', 'Цена с НДС 16%', 'Объект', 'Обоснование'];

const CANDIDATES_PER_BLOCK = Number(process.env.RASCENKI_CANDIDATES_PER_BLOCK || 25);
const MAX_ROWS_PER_BLOCK = 8;
// Мягкий пол по косинусной близости (эмбеддинги Voyage voyage-3.5-lite).
// У voyage-3.5-lite на коротких русских запросах даже точные совпадения дают
// косинус ~0.45–0.55, а связанные подработы ("грунтовка под наливной пол" для
// запроса "наливной пол") — ~0.43. Поэтому порог держим НИЗКИМ: это лишь отсев
// явного мусора, а осмысленную фильтрацию делает LLM-реранкер (rerankByLlm).
// Подстроить через RASCENKI_MIN_SCORE.
const MIN_SCORE = Number(process.env.RASCENKI_MIN_SCORE || 0.3);

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

  const out = await callOllamaJson([{ role: 'user', content: prompt }], { format: 'json', temperature: 0 });
  if (!Array.isArray(out?.relevant_ids)) {
    throw new Error('реранкер вернул ответ без массива relevant_ids');
  }
  // Пустой массив — валидный ответ («ничего из кандидатов не подходит»),
  // его уважаем (покажем заглушки), а не откатываемся на порядок по score.
  return out.relevant_ids.map(Number).filter((n) => Number.isInteger(n));
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
  // Мягкий пол по score применяем всегда — и как единственный фильтр без
  // реранкера, и как страховку от того, что реранкер оставит явный мусор.
  const filteredPerBlock = perBlock.map((items) => items.filter((it) => it.score >= MIN_SCORE));

  let rankIndex = null; // Map<id, позиция в выдаче реранкера>; null = реранкер не отработал
  const allCandidates = filteredPerBlock.flat();
  if (allCandidates.length) {
    try {
      const ids = await rerankByLlm(question, allCandidates);
      rankIndex = new Map(ids.map((id, i) => [id, i]));
    } catch (err) {
      console.error('[rascenki] реранкинг недоступен, используем порядок по score:', err.message);
    }
  }

  let totalRows = 0;
  const rows = [];
  BLOCKS.forEach((block, bi) => {
    let items = filteredPerBlock[bi];
    if (rankIndex) {
      items = items
        .filter((it) => rankIndex.has(it.id))
        .sort((a, b) => rankIndex.get(a.id) - rankIndex.get(b.id));
    } else {
      items = [...items].sort((a, b) => b.score - a.score);
    }
    items = items.slice(0, MAX_ROWS_PER_BLOCK);

    if (!items.length) {
      rows.push([block.label, 'нет расценок в этой категории', '', '', '', '', '']);
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
      table: { columns: COLUMNS, rows },
    },
    sql: null,
  };
}

module.exports = { searchRascenki, COLLECTION };
