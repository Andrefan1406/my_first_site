// /api/v1/requests — весь жизненный цикл заявки на служебный транспорт:
// создание сотрудником, пул для водителей ("Взять заказ" — атомарно, см.
// claim ниже), смена статуса водителем, принудительное назначение и
// отмена диспетчером. Каждый переход статуса пишется в
// request_status_history — источник данных для отчётности.
const express = require('express');
const { z } = require('zod');
const { getWriteDb } = require('./db');
const { requireRideRole } = require('./auth');
const { emitToDrivers, emitToDispatcher, emitToEmployee } = require('./socket');

const router = express.Router();

const FULL_SELECT = `
  SELECT
    r.*,
    emp.name  AS employee_name,
    emp.phone AS employee_phone,
    du.name   AS driver_name,
    du.phone  AS driver_phone,
    v.plate_number AS vehicle_plate,
    v.model        AS vehicle_model
  FROM requests r
  JOIN users emp ON emp.id = r.employee_id
  LEFT JOIN drivers d ON d.id = r.driver_id
  LEFT JOIN users du ON du.id = d.user_id
  LEFT JOIN vehicles v ON v.id = d.vehicle_id
`;

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0]?.message || 'Некорректные данные запроса' });
    }
    req.body = result.data;
    next();
  };
}

// Общие поля заявки, без телефона заказчика — для диспетчера и для самого
// заказчика (свой телефон ему очевиден, показывать незачем).
function baseFields(row) {
  return {
    id: row.id,
    fromAddress: row.from_address,
    toAddress: row.to_address,
    requestedAt: row.requested_at,
    purpose: row.purpose,
    passengersCount: row.passengers_count,
    comment: row.comment,
    status: row.status,
    assignedBy: row.assigned_by,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    driverName: row.driver_name || null,
    vehiclePlate: row.vehicle_plate || null,
  };
}

// Пул и "мои текущие" у водителя — тут телефон заказчика можно отдавать
// (требование: только водителю, у которого заказ в пуле либо уже назначен).
function serializeForDriver(row) {
  return {
    ...baseFields(row),
    employeeName: row.employee_name,
    employeePhone: row.employee_phone,
  };
}

function serializeForEmployee(row) {
  return baseFields(row);
}

function serializeForDispatcher(row, staleThresholdMinutes) {
  const ageMinutes = (Date.now() - new Date(row.created_at + 'Z').getTime()) / 60000;
  return {
    ...baseFields(row),
    employeeName: row.employee_name,
    driverPhone: row.driver_phone || null,
    isStale: row.status === 'pending_assignment' && ageMinutes >= staleThresholdMinutes,
  };
}

function getRow(db, id) {
  return db.prepare(`${FULL_SELECT} WHERE r.id = ?`).get(id);
}

const createRequestSchema = z.object({
  fromAddress: z.string().trim().min(1, 'Укажите адрес подачи'),
  toAddress: z.string().trim().min(1, 'Укажите адрес назначения'),
  requestedAt: z.string().trim().min(1, 'Укажите дату и время'),
  purpose: z.string().trim().optional().default(''),
  passengersCount: z.coerce.number().int().min(1).max(50).default(1),
  comment: z.string().trim().optional().default(''),
});

const declineSchema = z.object({
  reason: z.string().trim().min(1, 'Укажите причину отказа'),
});

const cancelSchema = z.object({
  reason: z.string().trim().optional().default(''),
});

const assignSchema = z.object({
  driverId: z.coerce.number().int().positive(),
});

const statusSchema = z.object({
  status: z.enum(['in_progress', 'completed']),
});

// Сотрудник: создать заявку — сразу попадает в общий пул.
router.post('/', requireRideRole('employee'), validate(createRequestSchema), (req, res) => {
  const db = getWriteDb();
  const { fromAddress, toAddress, requestedAt, purpose, passengersCount, comment } = req.body;

  const result = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO requests (employee_id, from_address, to_address, requested_at, purpose, passengers_count, comment, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_assignment')`
      )
      .run(req.rideUser.id, fromAddress, toAddress, requestedAt, purpose, passengersCount, comment);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
      .run(info.lastInsertRowid, req.rideUser.id);
    return getRow(db, info.lastInsertRowid);
  })();

  emitToDrivers('request:new', serializeForDriver(result));
  emitToDispatcher('request:new', serializeForDispatcher(result, staleThreshold()));
  res.status(201).json({ request: serializeForEmployee(result) });
});

// Сотрудник: свои заявки, активные и история — сортировка новые сверху.
router.get('/mine', requireRideRole('employee'), (req, res) => {
  const db = getWriteDb();
  const rows = db.prepare(`${FULL_SELECT} WHERE r.employee_id = ? ORDER BY r.created_at DESC`).all(req.rideUser.id);
  res.json({ requests: rows.map(serializeForEmployee) });
});

// Водитель: пул свободных заявок, самые ранние сверху.
router.get('/pool', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const rows = db.prepare(`${FULL_SELECT} WHERE r.status = 'pending_assignment' ORDER BY r.created_at ASC`).all();
  res.json({ requests: rows.map(serializeForDriver) });
});

// Водитель: заказы, которые сейчас у него на руках.
router.get('/my-current', requireRideRole('driver'), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.json({ requests: [] });
  const rows = db
    .prepare(`${FULL_SELECT} WHERE r.driver_id = ? AND r.status IN ('assigned', 'in_progress') ORDER BY r.claimed_at ASC`)
    .all(driver.id);
  res.json({ requests: rows.map(serializeForDriver) });
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
  res.json({ requests: rows.map(serializeForDriver) });
});

// Диспетчер: полный список + сводка по статусам для мониторинга.
router.get('/', requireRideRole('dispatcher', 'admin'), (req, res) => {
  const db = getWriteDb();
  const rows = db.prepare(`${FULL_SELECT} ORDER BY r.created_at DESC`).all();
  const threshold = staleThreshold();
  res.json({
    requests: rows.map((r) => serializeForDispatcher(r, threshold)),
    summary: {
      pending: rows.filter((r) => r.status === 'pending_assignment').length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      inProgress: rows.filter((r) => r.status === 'in_progress').length,
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
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Не удалось отказаться — заказ уже не ваш или сменил статус' });

  emitToDrivers('request:new', serializeForDriver(result));
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  res.json({ ok: true });
});

// Водитель меняет статус своего текущего заказа: assigned -> in_progress -> completed.
router.post('/:id/status', requireRideRole('driver'), validate(statusSchema), (req, res) => {
  const db = getWriteDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(req.rideUser.id);
  if (!driver) return res.status(403).json({ error: 'Вы не зарегистрированы как водитель' });

  const requestId = Number(req.params.id);
  const newStatus = req.body.status;
  const allowedFrom = newStatus === 'in_progress' ? 'assigned' : 'in_progress';

  const result = db.transaction(() => {
    const upd = db
      .prepare(`UPDATE requests SET status = ? WHERE id = ? AND driver_id = ? AND status = ?`)
      .run(newStatus, requestId, driver.id, allowedFrom);
    if (upd.changes === 0) return null;
    if (newStatus === 'completed') db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, ?, ?)`)
      .run(requestId, newStatus, req.rideUser.id);
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Нельзя сменить статус — заказ не ваш или уже в другом статусе' });

  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  res.json({ request: serializeForDriver(result) });
});

// Диспетчер: принудительное назначение — исключение, а не основной сценарий.
router.post('/:id/assign', requireRideRole('dispatcher', 'admin'), validate(assignSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);
  const driver = db.prepare(`SELECT * FROM drivers WHERE id = ? AND status = 'available'`).get(req.body.driverId);
  if (!driver) return res.status(409).json({ error: 'Водитель не найден или сейчас не свободен' });

  const result = db.transaction(() => {
    const upd = db
      .prepare(`UPDATE requests SET status = 'assigned', driver_id = ?, assigned_by = 'dispatcher', claimed_at = datetime('now') WHERE id = ? AND status = 'pending_assignment'`)
      .run(driver.id, requestId);
    if (upd.changes === 0) return null;
    db.prepare(`UPDATE drivers SET status = 'busy' WHERE id = ?`).run(driver.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'assigned', ?)`)
      .run(requestId, req.rideUser.id);
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Заказ уже не в пуле — возможно, его уже взяли' });

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:assigned', serializeForEmployee(result));
  res.json({ request: serializeForDispatcher(result, staleThreshold()) });
});

// Диспетчер: отмена заявки — только пока поездка не началась.
router.post('/:id/cancel', requireRideRole('dispatcher', 'admin'), validate(cancelSchema), (req, res) => {
  const db = getWriteDb();
  const requestId = Number(req.params.id);

  const result = db.transaction(() => {
    const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!row || ['in_progress', 'completed', 'cancelled'].includes(row.status)) return null;
    db.prepare(`UPDATE requests SET status = 'cancelled', cancel_reason = ? WHERE id = ?`).run(req.body.reason, requestId);
    if (row.driver_id) db.prepare(`UPDATE drivers SET status = 'available' WHERE id = ?`).run(row.driver_id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'cancelled', ?)`)
      .run(requestId, req.rideUser.id);
    return getRow(db, requestId);
  })();

  if (!result) return res.status(409).json({ error: 'Заказ нельзя отменить в текущем статусе' });

  emitToDrivers('request:removed', { id: requestId });
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  res.json({ request: serializeForDispatcher(result, staleThreshold()) });
});

function staleThreshold() {
  return Number(process.env.RIDE_STALE_THRESHOLD_MINUTES || 15);
}

module.exports = router;
