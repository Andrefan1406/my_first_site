// /api/v1/fleet-status — агрегатная занятость парка для формы подачи
// заявки (П.3 ТЗ доработок) и для сводки у диспетчера (П.2). Намеренно
// БЕЗ разбивки по конкретным машинам — заказчику это не нужно, ему важно
// одно: есть ли сейчас кого прислать, а если нет — примерно когда
// освободится ближайшая.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireAnyRideUser } = require('./auth');

const router = express.Router();

router.get('/', requireAnyRideUser, (req, res) => {
  const db = getWriteDb();

  const freeCount = db.prepare("SELECT COUNT(*) AS c FROM drivers WHERE status = 'available'").get().c;
  const busyCount = db.prepare("SELECT COUNT(*) AS c FROM drivers WHERE status = 'busy'").get().c;

  // Ближайшее освобождение — минимальный expected_completion_at среди
  // активных заявок занятых водителей (эта величина пересчитывается при
  // каждом изменении маршрута и при выходе в рейс, см. routeEstimate.js).
  const row = db
    .prepare(
      `SELECT MIN(r.expected_completion_at) AS next_free
         FROM requests r
         JOIN drivers d ON d.id = r.driver_id
        WHERE d.status = 'busy'
          AND r.status IN ('assigned', 'in_progress')
          AND r.expected_completion_at IS NOT NULL`
    )
    .get();

  res.json({
    hasFree: freeCount > 0,
    freeCount,
    busyCount,
    nextFreeAt: row && row.next_free ? row.next_free : null,
  });
});

module.exports = router;
