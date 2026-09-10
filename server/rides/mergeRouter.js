// /api/v1/requests/... — объединение заявок водителем (П.6 ТЗ доработок).
// Смонтирован на том же префиксе, что и requestsRouter/stopProposalsRouter.
//
// Водитель с активной заявкой A предлагает подвезти попутно заявку B из
// пула. Нужно двойное согласие: заказчик A и диспетчер. Пока оба не
// согласились — B «мягко» заблокирована в пуле (merge_lock). Оба «за» →
// точки B вливаются в маршрут A (mergeApply.applyMerge). Таймаут 5 минут
// → авто-отклонение (proposalTimeout.js).
const express = require('express');
const { getWriteDb } = require('./db');
const { requireRideRole } = require('./auth');
const { emitToDrivers, emitToDispatcher, emitToEmployee, emitToDriver } = require('./socket');
const { logEvent } = require('./events');
const { validate, z, getRow, serializeForDriver, serializeForDispatcher, staleThreshold } = require('./requestView');
const { serializeMerge, listPendingMerges } = require('./mergeView');
const { applyMerge } = require('./mergeApply');

const router = express.Router();

const mergeSchema = z.object({ intoRequestId: z.coerce.number().int().positive() });
const rejectSchema = z.object({ reason: z.string().trim().min(1, 'Укажите причину отказа') });

function unlockB(db, bId) {
  db.prepare('UPDATE requests SET merge_lock = 0 WHERE id = ? AND merge_lock = 1').run(bId);
}

// Диспетчер: очередь предложений объединения.
router.get('/merges/pending', requireRideRole('dispatcher'), (req, res) => {
  res.json({ merges: listPendingMerges(getWriteDb()) });
});

// Согласие по объединению — от заказчика заявки A либо от диспетчера.
router.post('/merges/:mId/approve', requireRideRole('employee', 'dispatcher'), async (req, res) => {
  const db = getWriteDb();
  const mId = Number(req.params.mId);
  const m = db.prepare('SELECT * FROM request_merges WHERE id = ?').get(mId);
  if (!m) return res.status(404).json({ error: 'Предложение не найдено' });
  if (m.status !== 'pending') return res.status(409).json({ error: 'Это предложение уже обработано' });

  const A = db.prepare('SELECT * FROM requests WHERE id = ?').get(m.request_a_id);
  const B = db.prepare('SELECT * FROM requests WHERE id = ?').get(m.request_b_id);
  const isDispatcher = req.rideUser.role === 'dispatcher';
  const isAOwner = A && A.employee_id === req.rideUser.id;
  if (!isDispatcher && !isAOwner) return res.status(403).json({ error: 'Вы не можете согласовать это объединение' });

  // Заявки могли уйти вперёд, пока шло согласование.
  if (!A || !['assigned', 'in_progress'].includes(A.status) || !B || B.status !== 'pending_assignment' || !B.merge_lock) {
    db.prepare("UPDATE request_merges SET status = 'rejected', decision_reason = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'")
      .run('Заявки изменились, объединение больше невозможно', mId);
    if (B) unlockB(db, B.id);
    logEvent(db, { requestId: m.request_a_id, type: 'merge_rejected', actorUserId: req.rideUser.id, payload: { mergeId: mId, auto: true, reason: 'заявки изменились' } });
    const merge = serializeMerge(db, mId);
    emitToDispatcher('merge:updated', merge);
    emitToDriver(m.driver_id, 'merge:updated', merge);
    if (B) emitToDrivers('request:new', serializeForDriver(getRow(db, B.id)));
    return res.status(409).json({ error: 'Объединение отменено — заявки изменились' });
  }

  const flags = db.transaction(() => {
    if (isAOwner) db.prepare('UPDATE request_merges SET approved_by_a = 1 WHERE id = ?').run(mId);
    if (isDispatcher) db.prepare('UPDATE request_merges SET approved_by_dispatcher = 1 WHERE id = ?').run(mId);
    logEvent(db, {
      requestId: m.request_a_id,
      type: 'merge_approved',
      actorUserId: req.rideUser.id,
      payload: { mergeId: mId, by: isDispatcher ? 'dispatcher' : 'initiator' },
    });
    return db.prepare('SELECT approved_by_a, approved_by_dispatcher FROM request_merges WHERE id = ?').get(mId);
  })();

  if (flags.approved_by_a && flags.approved_by_dispatcher) {
    await applyMerge(db, mId, req.rideUser.id);
  }

  const merge = serializeMerge(db, mId);
  emitToDispatcher('merge:updated', merge);
  emitToEmployee(A.employee_id, 'merge:updated', merge);
  emitToEmployee(B.employee_id, 'merge:updated', merge);
  emitToDriver(m.driver_id, 'merge:updated', merge);
  res.json({ merge });
});

// Отказ от объединения — заказчик A или диспетчер. Заявка B возвращается в пул.
router.post('/merges/:mId/reject', requireRideRole('employee', 'dispatcher'), validate(rejectSchema), (req, res) => {
  const db = getWriteDb();
  const mId = Number(req.params.mId);
  const m = db.prepare('SELECT * FROM request_merges WHERE id = ?').get(mId);
  if (!m) return res.status(404).json({ error: 'Предложение не найдено' });
  if (m.status !== 'pending') return res.status(409).json({ error: 'Это предложение уже обработано' });

  const A = db.prepare('SELECT employee_id FROM requests WHERE id = ?').get(m.request_a_id);
  const isDispatcher = req.rideUser.role === 'dispatcher';
  const isAOwner = A && A.employee_id === req.rideUser.id;
  if (!isDispatcher && !isAOwner) return res.status(403).json({ error: 'Вы не можете отклонить это объединение' });

  db.transaction(() => {
    db.prepare("UPDATE request_merges SET status = 'rejected', decision_reason = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?")
      .run(req.body.reason, req.rideUser.id, mId);
    unlockB(db, m.request_b_id);
    logEvent(db, { requestId: m.request_a_id, type: 'merge_rejected', actorUserId: req.rideUser.id, payload: { mergeId: mId, reason: req.body.reason } });
  })();

  const merge = serializeMerge(db, mId);
  emitToDispatcher('merge:updated', merge);
  emitToDriver(m.driver_id, 'merge:updated', merge);
  emitToDrivers('request:new', serializeForDriver(getRow(db, m.request_b_id)));
  emitToDispatcher('request:updated', serializeForDispatcher(getRow(db, m.request_b_id), staleThreshold()));
  res.json({ merge });
});

// Водитель предлагает объединение: :id — заявка B из пула, intoRequestId — его активная заявка A.
router.post('/:id/merge', requireRideRole('driver'), validate(mergeSchema), (req, res) => {
  const db = getWriteDb();
  const bId = Number(req.params.id);
  const aId = req.body.intoRequestId;
  if (aId === bId) return res.status(400).json({ error: 'Нельзя объединить заявку саму с собой' });

  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.status(403).json({ error: 'Вы не зарегистрированы как водитель' });

  const A = db.prepare('SELECT * FROM requests WHERE id = ?').get(aId);
  const B = db.prepare('SELECT * FROM requests WHERE id = ?').get(bId);
  if (!A || A.driver_id !== driver.id || !['assigned', 'in_progress'].includes(A.status)) {
    return res.status(409).json({ error: 'Объединять можно только со своей активной заявкой' });
  }
  if (!B || B.status !== 'pending_assignment' || B.on_hold || B.merge_lock || B.merged_into) {
    return res.status(409).json({ error: 'Эту заявку из пула уже нельзя объединить' });
  }
  const dup = db
    .prepare("SELECT id FROM request_merges WHERE status = 'pending' AND (request_a_id IN (?, ?) OR request_b_id IN (?, ?))")
    .get(aId, bId, aId, bId);
  if (dup) return res.status(409).json({ error: 'По одной из заявок уже идёт согласование объединения' });

  const mergeId = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO request_merges (request_a_id, request_b_id, driver_id) VALUES (?, ?, ?)')
      .run(aId, bId, driver.id);
    db.prepare('UPDATE requests SET merge_lock = 1 WHERE id = ?').run(bId);
    logEvent(db, {
      requestId: aId,
      type: 'merge_proposed',
      actorUserId: req.rideUser.id,
      payload: { mergeId: info.lastInsertRowid, withRequestId: bId, driverId: driver.id },
    });
    return info.lastInsertRowid;
  })();

  emitToDrivers('request:removed', { id: bId }); // B пропадает из пула у других
  const merge = serializeMerge(db, mergeId);
  emitToDispatcher('merge:new', merge);
  emitToEmployee(A.employee_id, 'merge:new', merge);
  emitToDispatcher('request:updated', serializeForDispatcher(getRow(db, bId), staleThreshold()));
  res.status(201).json({ merge });
});

module.exports = router;
