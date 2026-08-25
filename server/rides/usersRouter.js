// /api/v1/users — управление допуском к системе поездок.
// GET /me — для любого залогиненного (Firebase) — есть ли у него запись
// здесь и какая роль; на это опирается фронтовый гейт (см.
// src/components/RideAccessGate.jsx), который прячет остальной сайт от
// тех, у кого full_site_access = 0.
// Остальные эндпоинты — только admin: список объединяет ВСЕХ пользователей
// Firebase-проекта (через listUsers) с локальными ролями, чтобы админ мог
// назначить роль любому по чекбоксу/выпадающему списку, не заводя нового
// пользователя вручную.
const express = require('express');
const { z } = require('zod');
const { getAuth } = require('firebase-admin/auth');
const { getWriteDb } = require('./db');
const { loadRideUser, requireRideRole } = require('./auth');

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

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    fullSiteAccess: !!row.full_site_access,
  };
}

router.get('/me', loadRideUser, (req, res) => {
  res.json({ user: req.rideUser ? serializeUser(req.rideUser) : null });
});

router.get('/', requireRideRole('admin'), async (req, res) => {
  const db = getWriteDb();
  const localByEmail = new Map(db.prepare('SELECT * FROM users').all().map((r) => [r.email.toLowerCase(), r]));

  let firebaseUsers;
  try {
    firebaseUsers = (await getAuth().listUsers(1000)).users;
  } catch (err) {
    return res.status(502).json({ error: 'Не удалось получить список пользователей Firebase' });
  }

  const merged = [];
  for (const fu of firebaseUsers) {
    if (!fu.email) continue;
    const key = fu.email.toLowerCase();
    const local = localByEmail.get(key);
    localByEmail.delete(key);
    merged.push({
      email: fu.email,
      displayName: fu.displayName || null,
      name: local?.name || '',
      phone: local?.phone || '',
      role: local?.role || null,
      fullSiteAccess: local ? !!local.full_site_access : false,
    });
  }
  // Локальные записи без соответствующего Firebase-аккаунта (удалён/переименован)
  // всё равно показываем, чтобы админ мог их убрать вручную.
  for (const leftover of localByEmail.values()) {
    merged.push({
      email: leftover.email,
      displayName: null,
      name: leftover.name,
      phone: leftover.phone,
      role: leftover.role,
      fullSiteAccess: !!leftover.full_site_access,
    });
  }
  merged.sort((a, b) => a.email.localeCompare(b.email));
  res.json({ users: merged });
});

const upsertSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя'),
  phone: z.string().trim().min(1, 'Укажите телефон'),
  role: z.enum(['employee', 'dispatcher', 'driver', 'admin']),
  fullSiteAccess: z.boolean().default(false),
});

router.put('/:email', requireRideRole('admin'), validate(upsertSchema), (req, res) => {
  const db = getWriteDb();
  const email = req.params.email.toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (existing) {
    db.prepare('UPDATE users SET name = ?, phone = ?, role = ?, full_site_access = ? WHERE id = ?')
      .run(req.body.name, req.body.phone, req.body.role, req.body.fullSiteAccess ? 1 : 0, existing.id);
  } else {
    db.prepare('INSERT INTO users (email, name, phone, role, full_site_access) VALUES (?, ?, ?, ?, ?)')
      .run(email, req.body.name, req.body.phone, req.body.role, req.body.fullSiteAccess ? 1 : 0);
  }

  res.json({ user: serializeUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email)) });
});

router.delete('/:email', requireRideRole('admin'), (req, res) => {
  const db = getWriteDb();
  const email = req.params.email.toLowerCase();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден в системе поездок' });

  const hasDriverProfile = db.prepare('SELECT 1 FROM drivers WHERE user_id = ?').get(existing.id);
  if (hasDriverProfile) {
    return res.status(409).json({ error: 'У пользователя есть карточка водителя — сначала удалите её в разделе "Водители"' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

module.exports = router;
