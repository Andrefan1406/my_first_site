// API для дашборда «Аналитика по бетону и раствору»: агрегирующие эндпоинты
// поверх concrete_orders (~10k строк) — считаем на сервере, а не гоняем
// сырые строки на клиент при каждой смене фильтра. Доступ — как у остального
// concrete-чата (см. chatHandler.js): без отдельной авторизации на бэкенде,
// достаточно попасть на страницу через фронтенд (PrivateRoute), это не
// админ-инструмент с побочными эффектами, а read-only аналитика.
//
// Категория/объект/позиция фильтруются по реальным уникальным значениям
// колонок category/object_name/block_position как они есть в базе — без
// сопоставления с таксономией constructionData.js (там разъезжаются старые
// и новые варианты написания, из-за чего часть данных проваливалась в
// "Прочие" и не считалась). Пока эти столбцы не приведены к единому виду
// в самой таблице, фильтры показывают ровно то, что реально в data.
const express = require('express');
const { getReadDb } = require('./db');
const { callOllamaJson } = require('./ollamaClient');

const router = express.Router();

// "Сегодня" в таймзоне компании (Asia/Almaty) — тот же приём, что и в
// chatHandler.js: чтобы просрочка считалась по локальному дню, а не по UTC
// (date('now') в SQLite — всегда UTC).
function getTodayInAlmaty() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date());
}

// Общие для всех эндпоинтов фильтры: категория/объект/позиция — точное
// равенство по сырым значениям, плюс марка/класс, материал, статус
// исполнения, период. Период применяется к разным полям в разных запросах
// (см. вызовы ниже), поэтому колонка передаётся параметром.
function buildCommonClauses(query, { dateColumn }) {
  const { category, object, position, grade, material, status, from, to } = query;
  const clauses = [];
  const params = {};

  if (category) {
    clauses.push('category = @category');
    params.category = category;
  }
  if (object) {
    clauses.push('object_name = @object');
    params.object = object;
  }
  if (position) {
    clauses.push('block_position = @position');
    params.position = position;
  }
  if (grade) {
    clauses.push('grade_class = @grade');
    params.grade = grade;
  }
  if (material) {
    clauses.push('material = @material');
    params.material = material;
  }
  if (status === 'executed') {
    clauses.push("(execution_note IS NOT NULL AND execution_note != '')");
  } else if (status === 'not_executed') {
    clauses.push("(execution_note IS NULL OR execution_note = '')");
  }
  if (from) {
    clauses.push(`${dateColumn} >= @from`);
    params.from = from;
  }
  if (to) {
    clauses.push(`${dateColumn} <= @to`);
    params.to = to;
  }

  return { clauses, params };
}

// Список уникальных значений колонки, с необязательным сужением по уже
// выбранным category/object/position — так каждый фильтр остаётся
// самостоятельно выбираемым, но подсказывает только реально сочетающиеся
// варианты (взаимный каскад в обе стороны, не только category->object->position).
function distinctScoped(column, { category, object, position }, excludeKey) {
  const db = getReadDb();
  const clauses = [`${column} IS NOT NULL`, `${column} != ''`];
  const params = {};

  if (excludeKey !== 'category' && category) {
    clauses.push('category = @category');
    params.category = category;
  }
  if (excludeKey !== 'object' && object) {
    clauses.push('object_name = @object');
    params.object = object;
  }
  if (excludeKey !== 'position' && position) {
    clauses.push('block_position = @position');
    params.position = position;
  }

  return db
    .prepare(`SELECT DISTINCT ${column} AS v FROM concrete_orders WHERE ${clauses.join(' AND ')} ORDER BY ${column}`)
    .all(params)
    .map((r) => r.v);
}

// Списки значений для выпадающих фильтров — прямые DISTINCT по сырым
// столбцам, без какой-либо классификации. Марка/материал не завязаны на
// категорию/объект/позицию.
router.get('/options', (req, res) => {
  const db = getReadDb();
  const scope = { category: req.query.category, object: req.query.object, position: req.query.position };

  const distinct = (column) =>
    db.prepare(`SELECT DISTINCT ${column} AS v FROM concrete_orders WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY ${column}`)
      .all()
      .map((r) => r.v);

  res.json({
    categories: distinctScoped('category', scope, 'category'),
    objects: distinctScoped('object_name', scope, 'object'),
    positions: distinctScoped('block_position', scope, 'position'),
    grades: distinct('grade_class'),
    materials: distinct('material'),
  });
});

// Помесячные суммы объёма по материалу/году/месяцу — для двух графиков
// (Бетон/Раствор), сгруппированных по годам 2024-2026.
//
// Дата для группировки по месяцу — COALESCE(shipment_date, planned_delivery_date):
// если заявка уже отгружена, кладём её в месяц ФАКТИЧЕСКОЙ отгрузки, иначе —
// в месяц, на который её ПЛАНИРОВАЛИ. Это нужно, чтобы переключатель
// "План/Факт" на фронтенде не переставлял столбики по разным месяцам при
// переключении — меняется только то, какое число суммируется
// (volume_planned_m3 или volume_actual_m3), а не то, в какой месяц попадает
// строка.
router.get('/monthly', (req, res) => {
  const dateExpr = 'COALESCE(shipment_date, planned_delivery_date)';
  const { clauses, params } = buildCommonClauses(req.query, { dateColumn: dateExpr });

  clauses.push(`${dateExpr} IS NOT NULL`);
  clauses.push(`strftime('%Y', ${dateExpr}) IN ('2024', '2025', '2026')`);

  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = getReadDb()
    .prepare(`
      SELECT
        material,
        strftime('%Y', ${dateExpr}) AS year,
        strftime('%m', ${dateExpr}) AS month,
        SUM(volume_planned_m3) AS planned_m3,
        SUM(volume_actual_m3) AS actual_m3
      FROM concrete_orders
      ${where}
      GROUP BY material, year, month
      ORDER BY material, year, month
    `)
    .all(params);

  res.json({ rows });
});

// Сводка неисполненных заявок, сгруппированная по материалу/объекту/позиции —
// с количеством заявок, суммарным заявленным объёмом и признаками просрочки
// (по planned_delivery_date относительно сегодняшнего дня), чтобы сразу
// видеть, что уже должно было приехать, но не приехало. Группировка по
// позиции нужна фронтенду для разворачивания объекта в список позиций;
// сворачивание до уровня объекта и разделение на Бетон/Раствор — на клиенте.
router.get('/unexecuted', (req, res) => {
  const { clauses, params } = buildCommonClauses(req.query, { dateColumn: 'planned_delivery_date' });
  clauses.push("(execution_note IS NULL OR execution_note = '')");
  params.today = getTodayInAlmaty();

  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = getReadDb()
    .prepare(`
      SELECT
        object_name,
        block_position,
        material,
        COUNT(*) AS request_count,
        SUM(volume_planned_m3) AS sum_planned_m3,
        SUM(CASE WHEN planned_delivery_date IS NOT NULL AND planned_delivery_date < @today THEN 1 ELSE 0 END) AS overdue_count,
        MIN(planned_delivery_date) AS earliest_planned_delivery_date,
        MAX(
          CASE WHEN planned_delivery_date IS NOT NULL AND planned_delivery_date < @today
            THEN CAST(julianday(@today) - julianday(planned_delivery_date) AS INTEGER)
            ELSE 0
          END
        ) AS max_overdue_days
      FROM concrete_orders
      ${where}
      GROUP BY material, object_name, block_position
      ORDER BY object_name, max_overdue_days DESC, sum_planned_m3 DESC
    `)
    .all(params);

  res.json({ rows, today: params.today });
});

// Заголовки для графиков "Бетон"/"Раствор", сгенерированные LLM (тот же
// Ollama Cloud gpt-oss:120b-cloud, что и в chatHandler.js) на основе
// выбранных фильтров — вместо статичного "помесячно по годам". Best-effort:
// на ошибку/недоступность модели отдаём 502, фронтенд в этом случае молча
// остаётся на дефолтном заголовке.
router.get('/chart-titles', async (req, res) => {
  const { category, object, position, grade, material, from, to, valueMode } = req.query;

  const activeFilters = [];
  if (category) activeFilters.push(`категория: ${category}`);
  if (object) activeFilters.push(`объект: ${object}`);
  if (position) activeFilters.push(`позиция: ${position}`);
  if (grade) activeFilters.push(`марка/класс: ${grade}`);
  if (material) activeFilters.push(`материал: ${material}`);
  if (from) activeFilters.push(`с ${from}`);
  if (to) activeFilters.push(`по ${to}`);
  activeFilters.push(valueMode === 'actual' ? 'показатель: фактический объём' : 'показатель: плановый объём');

  const filtersText = activeFilters.join('; ');

  const messages = [
    {
      role: 'system',
      content:
        'Ты придумываешь короткие деловые русскоязычные заголовки для графиков ' +
        'дашборда стройкомпании. Отвечай ТОЛЬКО JSON вида ' +
        '{"concreteTitle": "...", "mortarTitle": "..."} без пояснений и без markdown. ' +
        'Каждый заголовок — до 60 символов, отражает главное из выбранных фильтров, ' +
        'не обязан перечислять их все через запятую.',
    },
    {
      role: 'user',
      content:
        `Два графика: помесячное сравнение объёма бетона по годам (2024/2025/2026) и такой же по раствору. ` +
        `Активные фильтры: ${filtersText}. Придумай заголовок для графика по бетону (concreteTitle) и по раствору (mortarTitle).`,
    },
  ];

  try {
    const result = await callOllamaJson(messages, { format: 'json', temperature: 0.3 });
    res.json({
      concreteTitle: typeof result.concreteTitle === 'string' ? result.concreteTitle : null,
      mortarTitle: typeof result.mortarTitle === 'string' ? result.mortarTitle : null,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
