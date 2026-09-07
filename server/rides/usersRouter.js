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
// Главный админ сайта (тот же email, что проверяет server/adminAuth.js) —
// его строку в этой таблице и чекбокс full_site_access (кому включать
// доступ ко всему сайту, а не только к системе поездок) видит и меняет
// только он сам. Остальные admin'ы системы поездок (их может быть
// несколько, назначаются именно здесь) управляют ролями всех прочих, но
// не имеют этих двух рычагов.
const { ADMIN_EMAIL } = require('../adminAuth');

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
    // Реальная причина (обычно — нет/неверный service account: см.
    // server/rides/README.md про GOOGLE_APPLICATION_CREDENTIALS) видна
    // только здесь, в логе бэкенда — клиенту отдаём общее сообщение,
    // чтобы не светить детали инфраструктуры наружу.
    console.error('listUsers() не сработал — вероятно, не задан валидный GOOGLE_APPLICATION_CREDENTIALS:', err);
    return res.status(502).json({ error: 'Не удалось получить список пользователей Firebase' });
  }

  const merged = [];
  for (const fu of firebaseUsers) {
    if (!fu.email) continue;
    const key = fu.email.toLowerCase();
    const local = localByEmail.get(key);
    localByEmail.delete(key);
    merged.push({
      id: local?.id || null,
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
      id: leftover.id,
      email: leftover.email,
      displayName: null,
      name: leftover.name,
      phone: leftover.phone,
      role: leftover.role,
      fullSiteAccess: !!leftover.full_site_access,
    });
  }
  merged.sort((a, b) => a.email.localeCompare(b.email));

  const isSiteAdmin = req.firebaseEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const result = isSiteAdmin
    ? merged
    : merged
        .filter((u) => u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase())
        .map(({ fullSiteAccess, ...rest }) => rest);

  res.json({ users: result });
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
  const isSiteAdmin = req.firebaseEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (email === ADMIN_EMAIL.toLowerCase() && !isSiteAdmin) {
    return res.status(403).json({ error: 'Эту запись может менять только сам главный администратор сайта' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // full_site_access решает только главный админ — остальные admin'ы
  // системы поездок эту ручку не видят на фронте (см. RidesAdminPage.jsx),
  // но раз поле всё равно приходит в теле запроса (zod-схема общая),
  // подстраховываемся и здесь: не даём его поменять напрямую через API.
  const fullSiteAccess = isSiteAdmin ? (req.body.fullSiteAccess ? 1 : 0) : existing?.full_site_access ?? 0;

  if (existing) {
    db.prepare('UPDATE users SET name = ?, phone = ?, role = ?, full_site_access = ? WHERE id = ?')
      .run(req.body.name, req.body.phone, req.body.role, fullSiteAccess, existing.id);
  } else {
    db.prepare('INSERT INTO users (email, name, phone, role, full_site_access) VALUES (?, ?, ?, ?, ?)')
      .run(email, req.body.name, req.body.phone, req.body.role, fullSiteAccess);
  }

  res.json({ user: serializeUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email)) });
});

router.delete('/:email', requireRideRole('admin'), (req, res) => {
  const db = getWriteDb();
  const email = req.params.email.toLowerCase();
  const isSiteAdmin = req.firebaseEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (email === ADMIN_EMAIL.toLowerCase() && !isSiteAdmin) {
    return res.status(403).json({ error: 'Эту запись может удалить только сам главный администратор сайта' });
  }

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
