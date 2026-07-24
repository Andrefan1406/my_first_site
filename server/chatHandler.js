// Двухшаговый text-to-SQL чат, общий для двух доменов (аналитика по бетону
// и аналитика по объектам компании), выбираемых полем body.domain:
// 1) вопрос -> LLM генерирует SQL -> валидация (sqlGuard) -> выполнение (readonly)
// 2) результат SQL -> LLM формирует финальный ответ {type, text, table?, chart?}
// Второй вызов никогда не видит непровалидированный SQL — только уже
// безопасно выполненные строки.
const { getReadDb, getLastSyncedAt } = require('./db');
const { assertSafeSelect, SqlGuardError } = require('./sqlGuard');
const { callOllamaJson } = require('./ollamaClient');

const MAX_ATTEMPTS = 3; // 1 попытка + до 2 повторов, как в ТЗ
const MAX_HISTORY = 10;

// Ни gpt-oss:120b-cloud, ни доступные бесплатные альтернативы (nemotron-3-super,
// gemma4:31b, minimax-m2.5) не показали стабильной точности в text-to-SQL —
// см. обсуждение с пользователем. Пока используем ту же модель, что и Smart Request.
const SQL_MODEL = 'gpt-oss:120b-cloud';

function getDistinctValues(table, column, limit = 25) {
  try {
    const rows = getReadDb()
      .prepare(
        `SELECT DISTINCT ${column} AS v FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != '' LIMIT ?`
      )
      .all(limit);
    return rows.map((r) => r.v);
  } catch (err) {
    return [];
  }
}

function getTodayInAlmaty() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date());
}

// Модель ненадёжно считает диапазоны дат сама (путает "в этом месяце" с "сегодня") —
// поэтому все нужные диапазоны считаем на сервере и даём готовыми строками.
function getDateRanges() {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' });
  const now = new Date();
  const todayStr = fmt.format(now);
  const [y, m] = todayStr.split('-').map(Number);

  const toStr = (date) => fmt.format(date);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  return {
    today: todayStr,
    yesterday: toStr(yesterday),
    currentMonthStart: toStr(monthStart),
    currentMonthEnd: toStr(monthEnd),
    last7DaysStart: toStr(weekAgo),
  };
}

const CONCRETE_TABLE_SCHEMA = `
Таблица concrete_orders (заявки на бетон/раствор, одна строка = одна отгрузка):
  shipment_date      TEXT  -- дата отгрузки, формат 'YYYY-MM-DD'
  category           TEXT  -- категория объекта
  material           TEXT  -- материал: 'Бетон' или 'Раствор'
  object_name        TEXT  -- короткий код объекта, напр. 'НЖ 4'
  block_position     TEXT  -- блок/позиция на объекте, свободный текст
  grade_class        TEXT  -- марка/класс бетона или раствора, свободный текст, напр. 'В25'
  volume_planned_m3  REAL  -- заявленный объём, м3
  volume_actual_m3   REAL  -- фактически отгруженный объём, м3 (может быть NULL, если ещё не отгружено)
  execution_note     TEXT  -- отметка о фактическом исполнении заявки
Разрешена только одна таблица: concrete_orders.
`.trim();

function buildConcreteSqlSystemPrompt() {
  const objects = getDistinctValues('concrete_orders', 'object_name', 40);
  const categories = getDistinctValues('concrete_orders', 'category', 15);
  const materials = getDistinctValues('concrete_orders', 'material', 5);
  const grades = getDistinctValues('concrete_orders', 'grade_class', 25);
  const dates = getDateRanges();

  return `
Ты помощник, который превращает вопросы пользователя на русском языке в SQL-запросы SQLite
для аналитики по заявкам на бетон и раствор.

${CONCRETE_TABLE_SCHEMA}

Реальные значения object_name в базе (используй точное совпадение или LIKE '%...%'): ${JSON.stringify(objects)}
Реальные значения category: ${JSON.stringify(categories)}
Реальные значения material: ${JSON.stringify(materials)}
Примеры значений grade_class: ${JSON.stringify(grades)}

Готовые диапазоны дат (используй их буквально, не вычисляй даты сам):
- сегодня: ${dates.today}
- вчера: ${dates.yesterday}
- текущий месяц: BETWEEN '${dates.currentMonthStart}' AND '${dates.currentMonthEnd}'
- последние 7 дней: BETWEEN '${dates.last7DaysStart}' AND '${dates.today}'

Правила:
- Генерируй ТОЛЬКО один SELECT-запрос. Никаких INSERT/UPDATE/DELETE/DROP и любых других
  модифицирующих операций — они всё равно будут отклонены на сервере.
- "В этом месяце" — это ВЕСЬ текущий месяц (диапазон выше), а НЕ "сегодня". Не путай их.
- НЕ добавляй фильтр по дате (WHERE shipment_date ...), если пользователь явно не указал период
  (день/месяц/неделю/"сегодня"/"в этом месяце" и т.п.). Фразы "за всё время", "суммарно",
  "сколько всего" БЕЗ указания периода означают ОТСУТСТВИЕ фильтра по дате.
- Для объёмов используй SUM(volume_actual_m3) или SUM(volume_planned_m3) — не COUNT(*), если
  вопрос про количество кубометров ("сколько бетона", "сколько кубов"). COUNT(*) используй только
  если явно спрашивают про число заявок/заказов ("сколько заявок", "сколько заказов").
- Для объёма отгрузки используй volume_actual_m3, если вопрос про то, что реально отгружено/выполнено;
  используй volume_planned_m3, если вопрос про заявленный объём.
- Если вопрос — уточнение предыдущего (например "а раствора?"), сначала определи, какие фильтры
  (период, объект, материал и т.п.) были в предыдущих вопросах этого диалога, и перенеси их в новый
  SQL, заменив только то, что уточняет новое сообщение. Не отбрасывай период/объект из предыдущего
  вопроса, если пользователь не сказал ничего, что явно его меняет.
- Если в предыдущем сообщении был возвращён текст с ошибкой выполнения SQL — исправь запрос.

Прежде чем ответить, кратко продумай: какой период имеется в виду, что именно нужно посчитать
(сумма объёма или количество заявок) и какие фильтры перенести из предыдущих сообщений диалога.

Ответь строго в формате JSON: {"sql": "<SQL-запрос одной строкой>"}
`.trim();
}

const OBJECTS_TABLE_SCHEMA = `
Таблица objects (объекты компании: жилые дома, соцобъекты, инженерные сети, дороги и т.п.,
одна строка = один объект):
  object_name           TEXT    -- полное официальное наименование объекта (длинный текст, обычно включает позицию по генплану)
  object_name_short     TEXT    -- краткое наименование, часто пусто
  position               TEXT   -- позиция по генплану, напр. '51', '51/1', '56,60,64,72'
  object_type            TEXT   -- тип объекта, см. список значений ниже
  status                 TEXT   -- 'сдан' | 'строится' | 'в планах'
  address                 TEXT  -- присвоенный адрес
  commissioning_date      TEXT  -- дата акта ввода в эксплуатацию, 'YYYY-MM-DD' (NULL, если ещё не сдан)
  apartments_count        INTEGER -- количество квартир (заполнено только для жилых домов)
  building_area_m2        REAL  -- общая площадь здания, м2
  apartments_area_m2      REAL  -- общая площадь квартир, м2
  sewer_network_m         REAL  -- протяжённость сетей канализации, м
  water_network_m         REAL  -- протяжённость сетей водоснабжения, м
  heating_network_m       REAL  -- протяжённость сетей теплоснабжения, м
  power_network_m         REAL  -- протяжённость сетей электроснабжения, м
  low_current_network_m   REAL  -- протяжённость слаботочных сетей, м
  coverage_area_m2        REAL  -- площадь дорожного покрытия, м2 (для дорог/проездов)
Разрешена только одна таблица: objects.
`.trim();

function buildObjectsSqlSystemPrompt() {
  const objectTypes = getDistinctValues('objects', 'object_type', 20);
  const statuses = getDistinctValues('objects', 'status', 5);
  const today = getTodayInAlmaty();

  return `
Ты помощник, который превращает вопросы пользователя на русском языке в SQL-запросы SQLite
для аналитики по объектам строительной компании (жилые дома, школы, детсады, инженерные сети и т.п.).

${OBJECTS_TABLE_SCHEMA}

Реальные значения object_type в базе: ${JSON.stringify(objectTypes)}
Реальные значения status: ${JSON.stringify(statuses)}
Сегодняшняя дата: ${today} (год сдачи/ввода извлекай через strftime('%Y', commissioning_date)).

Правила:
- Генерируй ТОЛЬКО один SELECT-запрос. Никаких INSERT/UPDATE/DELETE/DROP и любых других
  модифицирующих операций — они всё равно будут отклонены на сервере.
- Для классификации типа объекта (жилой дом, школа, детский сад, инженерные сети и т.п.)
  используй ТОЛЬКО колонку object_type.
- Каждая строка — один объект. Не путай object_name (длинное полное наименование) с position
  (короткий номер позиции по генплану).
- Если пользователь называет объект по номеру позиции ("поз.58", "поз. 58", "позиция 58"),
  ищи через position = '58' ИЛИ object_name LIKE '%поз.58%' ИЛИ object_name LIKE '%поз. 58%' —
  в исходных данных позиция в тексте названия оформлена по-разному.
- apartments_count, building_area_m2, apartments_area_m2 осмысленно заполнены только для
  object_type = 'Жилой дом'; для остальных типов обычно NULL.
- sewer_network_m/water_network_m/heating_network_m/power_network_m/low_current_network_m/
  coverage_area_m2 заполнены в основном для инженерных сетей, дорог и проездов; для жилых
  домов обычно NULL — не включай их в SUM для жилых домов.
- "Сколько объектов" -> COUNT(*). "Сколько квартир/площади/метров сетей" -> SUM(соответствующей колонки).
- Если вопрос — уточнение предыдущего (например "а по школам?"), перенеси фильтры предыдущего
  вопроса (тип, статус, период) в новый SQL, заменив только то, что явно меняет новое сообщение.
- Если в предыдущем сообщении был возвращён текст с ошибкой выполнения SQL — исправь запрос.

Ответь строго в формате JSON: {"sql": "<SQL-запрос одной строкой>"}
`.trim();
}

const DOMAIN_CONFIG = {
  concrete: {
    table: 'concrete_orders',
    syncKey: 'last_synced_at',
    notReadyText: 'Данные по бетону ещё загружаются, попробуйте через минуту.',
    answerDomainLabel: 'заявкам на бетон и раствор',
    buildSqlSystemPrompt: buildConcreteSqlSystemPrompt,
  },
  objects: {
    table: 'objects',
    syncKey: 'objects_last_synced_at',
    notReadyText: 'Данные по объектам ещё загружаются, попробуйте через минуту.',
    answerDomainLabel: 'объектам компании (жилым домам, соцобъектам, инженерным сетям и т.п.)',
    buildSqlSystemPrompt: buildObjectsSqlSystemPrompt,
  },
};

function resolveDomain(domainKey) {
  return DOMAIN_CONFIG[domainKey] || DOMAIN_CONFIG.concrete;
}

function buildAnswerSystemPrompt(question, sql, rows, domainLabel) {
  const preview = rows.slice(0, 200);
  return `
Ты помощник по аналитике ${domainLabel}. Пользователь задал вопрос, для него уже выполнен SQL-запрос
к базе, и ты получил результат. Сформируй понятный ответ на русском языке.

Вопрос пользователя: ${question}
Выполненный SQL: ${sql}
Результат (JSON, до 200 строк): ${JSON.stringify(preview)}

Выбери наиболее подходящий формат ответа:
- "text" — короткий текстовый ответ (для одного числа/факта);
- "table" — если результат — это список из нескольких строк с несколькими колонками;
- "chart" — если в вопросе или данных прослеживается динамика/сравнение по категориям
  (например, по датам или по объектам), подходящее для графика.

Если result пустой — вежливо сообщи, что данных не найдено, type "text".

Для "table" и "chart" дополнительно придумай:
- "title" — короткий говорящий заголовок (3-6 слов, без точки в конце), например
  "Отгрузка бетона по месяцам" или "Топ объектов по объёму бетона";
- "subtitle" — короткое уточнение под заголовком: что именно посчитано, за какой период,
  какие оговорки (например "по фактически отгруженному объёму, июль 2026" или
  "без учёта отменённых заявок"). Пиши без символа "*" в начале — его добавит интерфейс.

Ответь строго в формате JSON:
{
  "type": "text" | "table" | "chart",
  "text": "<текстовое summary, всегда заполняй>",
  "title": "<короткий заголовок, только для table/chart>",
  "subtitle": "<короткое уточнение, только для table/chart>",
  "table": { "columns": ["..."], "rows": [["...", 123], ...] },
  "chart": { "chartType": "bar" | "line", "xKey": "...", "series": [{"key":"...","name":"..."}], "data": [{"...": "..."}] }
}
Поля "title", "subtitle", "table" и "chart" включай только когда они соответствуют выбранному "type", иначе опускай.
`.trim();
}

function rowsToTable(rows) {
  if (!rows.length) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  return { columns, rows: rows.map((r) => columns.map((c) => r[c])) };
}

async function generateAndRunSql(history, domain) {
  const sqlMessages = [
    { role: 'system', content: domain.buildSqlSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const allowedTables = new Set([domain.table]);

  let lastSql = null;
  let lastErrorMessage = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const generated = await callOllamaJson(sqlMessages, { format: 'json', temperature: 0, model: SQL_MODEL });
    const candidateSql = generated?.sql;
    lastSql = candidateSql;

    try {
      const safeSql = assertSafeSelect(candidateSql, allowedTables);
      const rows = getReadDb().prepare(safeSql).all();
      return { sql: safeSql, rows };
    } catch (err) {
      lastErrorMessage = err instanceof SqlGuardError ? `Запрос отклонён: ${err.message}` : err.message;
      if (attempt === MAX_ATTEMPTS) break;
      sqlMessages.push({ role: 'assistant', content: JSON.stringify({ sql: candidateSql }) });
      sqlMessages.push({
        role: 'user',
        content: `Ошибка при выполнении твоего SQL: ${lastErrorMessage}. Пришли исправленный запрос в том же формате JSON.`,
      });
    }
  }

  const err = new Error(lastErrorMessage || 'Не удалось сформировать безопасный SQL-запрос.');
  err.status = 422;
  err.lastSql = lastSql;
  throw err;
}

async function handleChat(req, res) {
  try {
    const { messages, domain: domainKey } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Ожидается тело { messages: [...] }' });
    }

    const domain = resolveDomain(domainKey);

    if (!getLastSyncedAt(domain.syncKey)) {
      return res.json({
        answer: { type: 'text', text: domain.notReadyText },
        sql: null,
      });
    }

    const question = [...messages].reverse().find((m) => m.role === 'user')?.content;
    if (!question) {
      return res.status(400).json({ error: 'Не найден вопрос пользователя в messages' });
    }

    const history = messages.slice(-MAX_HISTORY);

    let sql;
    let rows;
    try {
      ({ sql, rows } = await generateAndRunSql(history, domain));
    } catch (err) {
      const status = err.status || 422;
      return res.status(status).json({ error: err.message, sql: err.lastSql || null });
    }

    let answer;
    try {
      answer = await callOllamaJson(
        [{ role: 'system', content: buildAnswerSystemPrompt(question, sql, rows, domain.answerDomainLabel) }],
        { format: 'json', temperature: 0, model: SQL_MODEL }
      );
    } catch (err) {
      // LLM не смог отформатировать ответ — отдаём сырую таблицу, чтобы не терять результат.
      answer = { type: 'table', text: 'Результат запроса:', table: rowsToTable(rows) };
    }

    return res.json({ answer, sql });
  } catch (err) {
    console.error('[chat] ошибка:', err);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    return res.status(status).json({ error: err.message || 'Внутренняя ошибка сервера' });
  }
}

module.exports = { handleChat };
