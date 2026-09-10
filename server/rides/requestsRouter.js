// /api/v1/requests — весь жизненный цикл заявки на служебный транспорт:
// создание сотрудником, пул для водителей ("Взять заказ" — атомарно, см.
// claim ниже), смена статуса водителем, принудительное назначение и
// отмена диспетчером. Каждый переход статуса пишется в
// request_status_history — источник данных для отчётности.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireRideRole } = require('./auth');
const { emitToDrivers, emitToDispatcher, emitToEmployee, emitToDriver } = require('./socket');
const { recomputeRequestEstimate } = require('./routeEstimate');
const { logEvent } = require('./events');
const {
  FULL_SELECT, validate, staleThreshold, hydrateRows, getRow,
  serializeForDriver, serializeForEmployee, serializeForDispatcher, z,
} = require('./requestView');

const router = express.Router();

const createRequestSchema = z.object({
  fromAddress: z.string().trim().min(1, 'Укажите адрес подачи'),
  toAddress: z.string().trim().min(1, 'Укажите адрес назначения'),
  requestedAt: z.string().trim().min(1, 'Укажите дату и время'),
  purpose: z.string().trim().min(1, 'Укажите цель поездки'),
  passengersCount: z.coerce.number().int().min(1).max(50).default(1),
  withReturn: z.boolean().optional().default(false),
  extraStops: z.array(z.string().trim().min(1)).max(10, 'Не более 10 доп. пунктов').optional().default([]),
  comment: z.string().trim().optional().default(''),
});

const declineSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину отказа'),
});

const cancelSchema = z.object({
  reason: z.string().trim().optional().default(''),
});

// Причина обязательна — сотрудник выбирает из предложенных вариантов на
// фронте (см. EmployeeRidesPage.jsx) либо вписывает свою; бэкенду
// достаточно проверить, что строка не пустая, конкретный набор
// вариантов — это дело интерфейса, не контракта API.
const employeeCancelSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину отмены'),
});

const assignSchema = z.object({
  driverId: z.coerce.number().int().positive(),
});

const statusSchema = z.object({
  status: z.enum(['in_progress', 'completed']),
});

// Экстренная переброска машины (П.4). reason обязателен — заказчик увидит
// его в уведомлении. targetRequestId — необязательно сразу отдать
// освободившуюся машину другой (срочной) заявке из пула.
const pullSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину переброски'),
  targetRequestId: z.coerce.number().int().positive().optional(),
});

// Решение заказчика по заявке, снятой с машины: вернуть в общий пул или отменить.
const holdDecisionSchema = z.object({
  decision: z.enum(['requeue', 'cancel']),
});

// Сотрудник (и диспетчер — иногда сам себе заказывает машину) создаёт
// заявку — сразу попадает в общий пул. Строка вставляется без оценки, а
// сразу после этого recomputeRequestEstimate геокодирует точки (с кэшем),
// строит маршрут и дописывает в ту же строку расстояние/время/координаты
// и пишет событие route_recomputed в журнал — обращения к геокодеру
// асинхронные, а better-sqlite3-транзакция синхронная, поэтому это
// отдельный шаг ПОСЛЕ вставки, а не внутри неё.
router.post('/', requireRideRole('employee', 'dispatcher'), validate(createRequestSchema), async (req, res) => {
  const db = getWriteDb();
  const { fromAddress, toAddress, requestedAt, purpose, passengersCount, withReturn, extraStops, comment } = req.body;

  const created = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO requests (employee_id, from_address, to_address, requested_at, purpose, passengers_count, with_return, comment, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_assignment')`
      )
      .run(
        req.rideUser.id, fromAddress, toAddress, requestedAt, purpose, passengersCount, withReturn ? 1 : 0, comment
      );
    const insertStop = db.prepare('INSERT INTO request_stops (request_id, address, stop_order) VALUES (?, ?, ?)');
    extraStops.forEach((address, i) => insertStop.run(info.lastInsertRowid, address, i));
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
      .run(info.lastInsertRowid, req.rideUser.id);
    logEvent(db, {
      requestId: info.lastInsertRowid,
      type: 'request_created',
      actorUserId: req.rideUser.id,
      payload: { fromAddress, toAddress, extraStops, withReturn, passengersCount, purpose },
    });
    return info.lastInsertRowid;
  })();

  try {
    await recomputeRequestEstimate(created, { actorUserId: req.rideUser.id });
  } catch (err) {
    console.error('[rides] recomputeRequestEstimate on create failed:', err.message);
  }

  const result = getRow(db, created);
  emitToDrivers('request:new', serializeForDriver(result));
  emitToDispatcher('request:new', serializeForDispatcher(result, staleThreshold()));
  res.status(201).json({ request: serializeForEmployee(result) });
});

// Сотрудник (и диспетчер): свои заявки, активные и история — сортировка новые сверху.
router.get('/mine', requireRideRole('employee', 'dispatcher'), (req, res) => {
  const db = getWriteDb();
  const rows = db.prepare(`${FULL_SELECT} WHERE r.employee_id = ? ORDER BY r.created_at DESC`).all(req.rideUser.id);
  res.json({ requests: hydrateRows(db, rows).map(serializeForEmployee) });
});

// Водитель: пул свободных заявок, самые ранние сверху. Снятые с машины и
// ждущие решения заказчика (on_hold) в пул не отдаём.
router.get('/pool', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const rows = db.prepare(`${FULL_SELECT} WHERE r.status = 'pending_assignment' AND r.on_hold = 0 ORDER BY r.created_at ASC`).all();
  res.json({ requests: hydrateRows(db, rows).map(serializeForDriver) });
});

// Водитель: заказы, которые сейчас у него на руках.
router.get('/my-current', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.json({ requests: [] });
  const rows = db
    .prepare(`${FULL_SELECT} WHERE r.driver_id = ? AND r.status IN ('assigned', 'in_progress') ORDER BY r.claimed_at ASC`)
    .all(driver.id);
  res.json({ requests: hydrateRows(db, rows).map(serializeForDriver) });
});

// Водитель: история завершённых поездок за период (from/to — 'YYYY-MM-DD').
router.get('/my-history', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.json({ requests: [] });

  const { from, to } = req.query;
  let sql = `${FULL_SELECT} WHERE r.driver_id = ? AND r.status = 'completed'`;
  const params = [driver.id];
  if (from) { sql += ' AND r.created_at >= ?'; params.push(String(from)); }
  if (to) { sql += ' AND r.created_at <= ?'; params.push(String(to)); }
  sql += ' ORDER BY r.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json({ requests: hydrateRows(db, rows).map(serializeForDriver) });
});

// Диспетчер: полный список + сводка по статусам для мониторинга.
router.get('/', requireRideRole('dispatcher'), (req, res) => {
  const db = getWriteDb();
  const rows = hydrateRows(db, db.prepare(`${FULL_SELECT} ORDER BY r.created_at DESC`).all());
  const threshold = staleThreshold();
  res.json({
    requests: rows.map((r) => serializeForDispatcher(r, threshold)),
    summary: {
      pending: rows.filter((r) => r.status === 'pending_assignment' && !r.on_hold).length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      inProgress: rows.filter((r) => r.status === 'in_progress').length,
      onHold: rows.filter((r) => r.on_hold).length,
      staleThresholdMinutes: threshold,
    },
  });
});

// Взять заказ из пула — атомарно: побеждает тот, чей UPDATE первым
// затронет строку (affected rows проверяется через result.changes).
// Остальные получают 409 и убирают заказ из своего списка по сокет-событию
// request:removed, которое рассылается победителю раньше, чем он успевает
// ответить проигравшим — гонка решается на уровне БД, а не сокетов.
router.post('/:id/claim', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.status(403).json({ error: 'Вы не зарегистрированы как водитель' });
  if (driver.status !== 'available') {
    return res.status(409).json({ error: 'Вы не свободны — сначала завершите текущий заказ' });
  }

  const requestId = Number(req.params.id);
  const result = db.transaction(() => {
    const upd = db
      .prepare(`UPDATE requests SET status = 'assigned', driver_id = ?, assigned_by = 'self', claimed_at = datetime('now') WHERE id = ? AND status = 'pending_assignment'`)
      .run(driver.id, requestId);
    if (upd.changes === 0) return null;
    db.prepare(`UPDATE drivers SET status = 'busy' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'assigned', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, { requestId, type: 'driver_claimed', actorUserId: req.rideUser.id, payload: { driverId: driver.id } });
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Заказ уже взят другим водителем' });

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:assigned', serializeForEmployee(result));
  res.json({ request: serializeForDriver(result) });
});

// Водитель отказывается от уже взятого заказа — возвращается в общий пул.
router.post('/:id/decline', requireRideRole('driver'), validate(declineSchema), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.status(403).json({ error: 'Вы не зарегистрированы как водитель' });

  const requestId = Number(req.params.id);
  const result = db.transaction(() => {
    const upd = db
      .prepare(
        `UPDATE requests SET status = 'pending_assignment', driver_id = NULL, assigned_by = NULL, claimed_at = NULL, cancel_reason = ?
         WHERE id = ? AND driver_id = ? AND status IN ('assigned', 'in_progress')`
      )
      .run(req.body.reason, requestId, driver.id);
    if (upd.changes === 0) return null;
    db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, { requestId, type: 'driver_declined', actorUserId: req.rideUser.id, payload: { driverId: driver.id, reason: req.body.reason } });
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Не удалось отказаться — заказ уже не ваш или сменил статус' });

  emitToDrivers('request:new', serializeForDriver(result));
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  res.json({ ok: true });
});

// Водитель меняет статус своего текущего заказа: assigned -> in_progress -> completed.
router.post('/:id/status', requireRideRole('driver'), validate(statusSchema), async (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.status(403).json({ error: 'Вы не зарегистрированы как водитель' });

  const requestId = Number(req.params.id);
  const newStatus = req.body.status;
  const allowedFrom = newStatus === 'in_progress' ? 'assigned' : 'in_progress';

  const ok = db.transaction(() => {
    const upd = db
      .prepare(`UPDATE requests SET status = ? WHERE id = ? AND driver_id = ? AND status = ?`)
      .run(newStatus, requestId, driver.id, allowedFrom);
    if (upd.changes === 0) return false;
    if (newStatus === 'completed') db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, ?, ?)`)
      .run(requestId, newStatus, req.rideUser.id);
    logEvent(db, { requestId, type: 'status_changed', actorUserId: req.rideUser.id, payload: { from: allowedFrom, to: newStatus } });
    return true;
  })();

  if (!ok) return res.status(409).json({ error: 'Нельзя сменить статус — заказ не ваш или уже в другом статусе' });

  // При выходе в рейс пересчитываем оценку от «сейчас» (до этого
  // expected_completion_at считался от желаемого времени подачи) — иначе
  // прогноз освобождения машины в форме заказа и у диспетчера врёт.
  if (newStatus === 'in_progress') {
    try {
      await recomputeRequestEstimate(requestId, { actorUserId: req.rideUser.id });
    } catch (err) {
      console.error('[rides] recompute on in_progress failed:', err.message);
    }
  }

  const result = getRow(db, requestId);
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  res.json({ request: serializeForDriver(result) });
});

// Диспетчер: принудительное назначение — исключение, а не основной
// сценарий. Работает и для заявки в пуле, и для снятой с машины (on_hold)
// — во втором случае это и есть «предложить заказчику другую машину».
router.post('/:id/assign', requireRideRole('dispatcher'), validate(assignSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);
  const driver = db.prepare(`SELECT * FROM drivers WHERE id = ? AND status = 'available'`).get(req.body.driverId);
  if (!driver) return res.status(409).json({ error: 'Водитель не найден или сейчас не свободен' });

  const result = db.transaction(() => {
    const upd = db
      .prepare(`UPDATE requests SET status = 'assigned', driver_id = ?, assigned_by = 'dispatcher', claimed_at = datetime('now'), on_hold = 0, pull_reason = NULL WHERE id = ? AND status = 'pending_assignment'`)
      .run(driver.id, requestId);
    if (upd.changes === 0) return null;
    db.prepare(`UPDATE drivers SET status = 'busy' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'assigned', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, { requestId, type: 'dispatcher_assigned', actorUserId: req.rideUser.id, payload: { driverId: driver.id } });
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Заказ уже не в пуле — возможно, его уже взяли' });

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:assigned', serializeForEmployee(result));
  emitToDriver(driver.id, 'request:assigned', serializeForDriver(result));
  res.json({ request: serializeForDispatcher(result, staleThreshold()) });
});

// Диспетчер: экстренно снять машину с активной заявки (assigned/in_progress).
// Заявка уходит в on_hold (в пул не отдаётся), заказчик получает
// уведомление с причиной и выбирает дальше (см. /:id/hold-decision).
// targetRequestId — сразу отдать освободившуюся машину другой заявке.
router.post('/:id/pull', requireRideRole('dispatcher'), validate(pullSchema), async (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);
  const { reason, targetRequestId } = req.body;

  if (targetRequestId === requestId) {
    return res.status(400).json({ error: 'Нельзя перебросить машину на ту же заявку' });
  }

  const outcome = db.transaction(() => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!row || !['assigned', 'in_progress'].includes(row.status) || !row.driver_id) {
      return { error: 'С этой заявки нечего снимать — на ней нет машины в работе' };
    }
    const freedDriverId = row.driver_id;

    let target = null;
    if (targetRequestId) {
      target = db.prepare('SELECT * FROM requests WHERE id = ?').get(targetRequestId);
      if (!target || target.status !== 'pending_assignment' || target.on_hold) {
        return { error: 'Заявка, которой хотите отдать машину, уже не в пуле' };
      }
    }

    // Снимаем машину с исходной заявки.
    db.prepare(
      `UPDATE requests SET status = 'pending_assignment', driver_id = NULL, assigned_by = NULL,
         claimed_at = NULL, on_hold = 1, pull_reason = ? WHERE id = ?`
    ).run(reason, requestId);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, {
      requestId,
      type: 'reassigned',
      actorUserId: req.rideUser.id,
      payload: { reason, fromDriverId: freedDriverId, toRequestId: targetRequestId || null },
    });

    if (target) {
      db.prepare(
        `UPDATE requests SET status = 'assigned', driver_id = ?, assigned_by = 'dispatcher',
           claimed_at = datetime('now'), on_hold = 0, pull_reason = NULL WHERE id = ?`
      ).run(freedDriverId, targetRequestId);
      db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'assigned', ?)`)
        .run(targetRequestId, req.rideUser.id);
      logEvent(db, {
        requestId: targetRequestId,
        type: 'dispatcher_assigned',
        actorUserId: req.rideUser.id,
        payload: { driverId: freedDriverId, viaReassignFrom: requestId },
      });
      // машина остаётся busy — просто у другой заявки
    } else {
      db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(freedDriverId);
    }

    return { freedDriverId, hasTarget: !!target };
  })();

  if (outcome.error) return res.status(409).json({ error: outcome.error });

  // На заявке, снятой с машины, число точек/маршрут не менялись — но
  // база отсчёта времени сбилась (машины больше нет), да и заказчик ещё
  // будет решать. Оценку не трогаем до повторного назначения.
  const pulled = getRow(db, requestId);
  emitToDispatcher('request:updated', serializeForDispatcher(pulled, staleThreshold()));
  emitToEmployee(pulled.employee_id, 'request:reassigned', serializeForEmployee(pulled));
  emitToDriver(outcome.freedDriverId, 'request:pulled', { id: requestId, reason });

  if (outcome.hasTarget) {
    const target = getRow(db, targetRequestId);
    emitToDrivers('request:removed', { id: targetRequestId });
    emitToDispatcher('request:updated', serializeForDispatcher(target, staleThreshold()));
    emitToEmployee(target.employee_id, 'request:assigned', serializeForEmployee(target));
    emitToDriver(outcome.freedDriverId, 'request:assigned', serializeForDriver(target));
  }

  res.json({ request: serializeForDispatcher(pulled, staleThreshold()) });
});

// Заказчик: решение по своей заявке, снятой с машины — вернуть в общий
// пул («другую машину пришлёт первый свободный водитель») или отменить.
router.post('/:id/hold-decision', requireRideRole('employee', 'dispatcher'), validate(holdDecisionSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);
  const { decision } = req.body;

  const result = db.transaction(() => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!row || row.employee_id !== req.rideUser.id) return null;
    if (!(row.status === 'pending_assignment' && row.on_hold)) return null;

    if (decision === 'cancel') {
      db.prepare(`UPDATE requests SET status = 'cancelled', on_hold = 0, cancel_reason = ? WHERE id = ?`)
        .run('Заказчик отменил заявку после переброски машины', requestId);
      db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'cancelled', ?)`)
        .run(requestId, req.rideUser.id);
    } else {
      db.prepare(`UPDATE requests SET on_hold = 0, pull_reason = NULL WHERE id = ?`).run(requestId);
      db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
        .run(requestId, req.rideUser.id);
    }
    logEvent(db, {
      requestId,
      type: 'reassign_resolved',
      actorUserId: req.rideUser.id,
      payload: { decision },
    });
    return getRow(db, requestId);
  })();

  if (!result) {
    return res.status(409).json({ error: 'Решение уже не требуется — заявка не в статусе ожидания' });
  }

  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  if (decision === 'requeue') emitToDrivers('request:new', serializeForDriver(result));
  res.json({ request: serializeForEmployee(result) });
});

// Диспетчер: отмена заявки — только пока поездка не началась.
router.post('/:id/cancel', requireRideRole('dispatcher'), validate(cancelSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);

  let previousDriverId = null;
  const result = db.transaction(() => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!row || ['in_progress', 'completed', 'cancelled'].includes(row.status)) return null;
    previousDriverId = row.driver_id;
    db.prepare(`UPDATE requests SET status = 'cancelled', on_hold = 0, cancel_reason = ? WHERE id = ?`).run(req.body.reason, requestId);
    if (row.driver_id) db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(row.driver_id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'cancelled', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, { requestId, type: 'cancelled_by_dispatcher', actorUserId: req.rideUser.id, payload: { reason: req.body.reason || null, previousStatus: row.status, wasOnHold: !!row.on_hold } });
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Заказ нельзя отменить в текущем статусе' });

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  if (previousDriverId) emitToDriver(previousDriverId, 'request:removed', { id: requestId });
  res.json({ request: serializeForDispatcher(result, staleThreshold()) });
});

// Сотрудник (или диспетчер — для своей же заявки) отменяет СВОЮ заявку.
// Разрешено, пока её ещё не приняли (pending_assignment) или водитель уже
// назначен, но ещё не нажал "В пути" (assigned) — та же граница, что и у
// диспетчерской отмены выше: как только поездка реально началась
// (in_progress), отменить может только диспетчер вручную, не сам заказчик.
router.post('/:id/cancel-mine', requireRideRole('employee', 'dispatcher'), validate(employeeCancelSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);

  let previousDriverId = null;
  const result = db.transaction(() => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!row || row.employee_id !== req.rideUser.id) return null;
    if (!['pending_assignment', 'assigned'].includes(row.status)) return null;
    previousDriverId = row.driver_id;
    db.prepare(`UPDATE requests SET status = 'cancelled', on_hold = 0, cancel_reason = ? WHERE id = ?`).run(req.body.reason, requestId);
    if (row.driver_id) db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(row.driver_id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'cancelled', ?)`)
      .run(requestId, req.rideUser.id);
    logEvent(db, { requestId, type: 'cancelled_by_employee', actorUserId: req.rideUser.id, payload: { reason: req.body.reason, previousStatus: row.status } });
    return getRow(db, requestId);
  })();

  if (!result) {
    return res.status(409).json({ error: 'Заявку нельзя отменить — водитель уже в пути, поездка завершена, либо это не ваша заявка' });
  }

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  if (previousDriverId) emitToDriver(previousDriverId, 'request:removed', { id: requestId });
  res.json({ request: serializeForEmployee(result) });
});

module.exports = router;
