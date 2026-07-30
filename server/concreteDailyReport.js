// API для "Ежедневного отчёта БРУ": агрегирует concrete_orders на сервере
// для одной даты отгрузки, вместо того чтобы гонять на клиент сырые строки
// и парсить CSV в браузере (см. src/ConcreteDailyReportPage.js). Read-only,
// без авторизации — как и остальная concrete-аналитика.
const express = require('express');
const { getReadDb } = require('./db');

const router = express.Router();

// Объём исполненной заявки: фактически отгруженный, а если он не указан
// (0/NULL) — заявленный.
const VOLUME_EXPR = 'COALESCE(NULLIF(volume_actual_m3, 0), volume_planned_m3, 0)';
const FULFILLED_EXPR = "execution_note IS NOT NULL AND execution_note != ''";

function buildMaterialSection(db, material, date) {
  const rows = db
    .prepare(`
      SELECT
        object_name AS object,
        grade_class AS grade,
        SUM(${VOLUME_EXPR}) AS volume
      FROM concrete_orders
      WHERE material = @material
        AND shipment_date = @date
        AND ${FULFILLED_EXPR}
      GROUP BY object_name, grade_class
    `)
    .all({ material, date })
    .map((row) => ({
      object: row.object || '—',
      grade: row.grade || '—',
      volume: row.volume || 0,
    }))
    .sort((a, b) => a.object.localeCompare(b.object, 'ru'));

  const dailyTotal = rows.reduce((sum, row) => sum + row.volume, 0);

  const monthPrefix = date.slice(0, 7);
  const { monthTotal } = db
    .prepare(`
      SELECT SUM(${VOLUME_EXPR}) AS monthTotal
      FROM concrete_orders
      WHERE material = @material
        AND ${FULFILLED_EXPR}
        AND shipment_date >= @monthStart
        AND shipment_date <= @date
    `)
    .get({ material, date, monthStart: `${monthPrefix}-01` });

  return { name: material, rows, dailyTotal, monthTotal: monthTotal || 0 };
}

router.get('/daily-report', (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Параметр date обязателен, формат YYYY-MM-DD' });
  }

  const db = getReadDb();
  res.json({
    date,
    // Бетон всегда первым, затем раствор
    materials: [
      buildMaterialSection(db, 'Бетон', date),
      buildMaterialSection(db, 'Раствор', date),
    ],
  });
});

module.exports = router;
