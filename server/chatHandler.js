// Двухшаговый text-to-SQL чат по заявкам на бетон:
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

const TABLE_SCHEMA = `
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

function getDistinctValues(column, limit = 25) {
  try {
    const rows = getReadDb()
      .prepare(
        `SELECT DISTINCT ${column} AS v FROM concrete_orders WHERE ${column} IS NOT NULL AND ${column} != '' LIMIT ?`
      )
      .all(limit);
    return rows.map((r) => r.v);
  } catch (err) {
    return [];
  }
}

// Модель ненадёжно считает диапазоны дат сама (путает "в этом месяце" с "сегодня") —
// поэтому все нужные диапазоны считаем на сервере и даём готовыми строками.
function getDateRanges() {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' });
  const now = new Date();
  const todayStr = fmt.format(now);
  const [y, m, d] = todayStr.split('-').map(Number);

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

function buildSqlSystemPrompt() {
  const objects = getDistinctValues('object_name', 40);
  const categories = getDistinctValues('category', 15);
  const materials = getDistinctValues('material', 5);
  const grades = getDistinctValues('grade_class', 25);
  const dates = getDateRanges();

  return `
Ты помощник, который превращает вопросы пользователя на русском языке в SQL-запросы SQLite
для аналитики по заявкам на бетон и раствор.

${TABLE_SCHEMA}

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

function buildAnswerSystemPrompt(question, sql, rows) {
  const preview = rows.slice(0, 200);
  return `
Ты помощник по аналитике заявок на бетон. Пользователь задал вопрос, для него уже выполнен SQL-запрос
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

async function generateAndRunSql(history) {
  const sqlMessages = [
    { role: 'system', content: buildSqlSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let lastSql = null;
  let lastErrorMessage = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const generated = await callOllamaJson(sqlMessages, { format: 'json', temperature: 0, model: SQL_MODEL });
    const candidateSql = generated?.sql;
    lastSql = candidateSql;

    try {
      const safeSql = assertSafeSelect(candidateSql);
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
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Ожидается тело { messages: [...] }' });
    }

    if (!getLastSyncedAt()) {
      return res.json({
        answer: { type: 'text', text: 'Данные по бетону ещё загружаются, попробуйте через минуту.' },
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
      ({ sql, rows } = await generateAndRunSql(history));
    } catch (err) {
      const status = err.status || 422;
      return res.status(status).json({ error: err.message, sql: err.lastSql || null });
    }

    let answer;
    try {
      answer = await callOllamaJson(
        [{ role: 'system', content: buildAnswerSystemPrompt(question, sql, rows) }],
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
