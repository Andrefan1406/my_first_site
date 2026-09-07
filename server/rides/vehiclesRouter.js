// /api/v1/vehicles — справочник машин. Полноценно (CRUD) им распоряжается
// диспетчер — по факту тот же человек, что ведёт и карточки водителей
// (см. driversRouter.js). Главный админ сайта может только смотреть
// (requireRoleOrSiteAdmin на GET), сам он ничего не создаёт/не правит —
// см. server/rides/usersRouter.js про то, чем он занимается.
const express = require('express');
const { z } = require('zod');
const { getWriteDb } = require('./db');
const { requireRideRole, requireRoleOrSiteAdmin } = require('./auth');

const router = express.Router();

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

const vehicleSchema = z.object({
  plateNumber: z.string().trim().min(1, 'Укажите гос. номер'),
  model: z.string().trim().optional().default(''),
  status: z.enum(['available', 'busy', 'maintenance']).default('available'),
});

const vehicleUpdateSchema = vehicleSchema.partial();

function serialize(row) {
  return { id: row.id, plateNumber: row.plate_number, model: row.model, status: row.status };
}

router.get('/', requireRoleOrSiteAdmin('dispatcher'), (req, res) => {
  const rows = getWriteDb().prepare('SELECT * FROM vehicles ORDER BY plate_number').all();
  res.json({ vehicles: rows.map(serialize) });
});

router.post('/', requireRideRole('dispatcher'), validate(vehicleSchema), (req, res) => {
  const db = getWriteDb();
  try {
    const info = db
      .prepare('INSERT INTO vehicles (plate_number, model, status) VALUES (?, ?, ?)')
      .run(req.body.plateNumber, req.body.model, req.body.status);
    res.status(201).json({ vehicle: serialize(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid)) });
  } catch (err) {
    res.status(409).json({ error: 'Машина с таким гос. номером уже есть' });
  }
});

router.patch('/:id', requireRideRole('dispatcher'), validate(vehicleUpdateSchema), (req, res) => {
  const db = getWriteDb();
  const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Машина не найдена' });

  const next = {
    plate_number: req.body.plateNumber ?? existing.plate_number,
    model: req.body.model ?? existing.model,
    status: req.body.status ?? existing.status,
  };
  try {
    db.prepare('UPDATE vehicles SET plate_number = ?, model = ?, status = ? WHERE id = ?')
      .run(next.plate_number, next.model, next.status, req.params.id);
    res.json({ vehicle: serialize(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id)) });
  } catch (err) {
    res.status(409).json({ error: 'Машина с таким гос. номером уже есть' });
  }
});

router.delete('/:id', requireRideRole('dispatcher'), (req, res) => {
  const db = getWriteDb();
  const inUse = db.prepare('SELECT 1 FROM drivers WHERE vehicle_id = ?').get(req.params.id);
  if (inUse) return res.status(409).json({ error: 'Машина закреплена за водителем — сначала отвяжите её' });
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
