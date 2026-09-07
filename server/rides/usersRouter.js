// /api/v1/users — управление допуском к системе поездок.
// GET /me — для любого залогиненного (Firebase) — есть ли у него запись
// здесь и какая роль; на это опирается фронтовый гейт (см.
// src/components/RideAccessGate.jsx), который прячет остальной сайт от
// тех, у кого full_site_access = 0.
//
// Роли (кто именно становится пассажиром/водителем/диспетчером) и
// full_site_access назначает ИСКЛЮЧИТЕЛЬНО главный админ сайта
// (ADMIN_EMAIL, тот же email, что и в server/adminAuth.js) — только он
// видит полный список всех пользователей Firebase-проекта. Остальные
// admin'ы системы поездок (их может быть несколько — сама роль 'admin'
// назначается тем же способом) видят уже готовый список тех, кому роль
// назначена, и могут поправить только имя/телефон ("карточку") — не
// роль и не доступ ко всему сайту. Это осознанно: если бы рядовой
// ride-admin мог сам создавать новые записи, он бы либо не глядя выдавал
// full_site_access, либо (что и обнаружилось на практике) молча ОТБИРАЛ
// его у уже работающего в остальном сайте сотрудника, просто не имея
// возможности поставить галочку. Раз решение принимает только один
// человек с полной картиной — такой ошибки просто не может возникнуть.
const express = require('express');
const { z } = require('zod');
const { getAuth } = require('firebase-admin/auth');
const { getWriteDb } = require('./db');
const { loadRideUser, requireRideRole } = require('./auth');
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

function isSiteAdmin(req) {
  return req.firebaseEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
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
  // всё равно показываем, чтобы главный админ мог их убрать вручную.
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

  if (isSiteAdmin(req)) {
    return res.json({ users: merged });
  }

  // Обычный admin поездок: только те, кому роль уже назначена главным
  // админом (сам факт присутствия в списке — не право что-то создавать),
  // без его собственной строки и без full_site_access.
  const result = merged
    .filter((u) => u.role && u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase())
    .map(({ fullSiteAccess, ...rest }) => rest);
  res.json({ users: result });
});

const upsertSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя'),
  phone: z.string().trim().min(1, 'Укажите телефон'),
  role: z.enum(['employee', 'dispatcher', 'driver', 'admin']).optional(),
  fullSiteAccess: z.boolean().optional(),
});

router.put('/:email', requireRideRole('admin'), validate(upsertSchema), (req, res) => {
  const db = getWriteDb();
  const email = req.params.email.toLowerCase();
  const admin = isSiteAdmin(req);

  if (email === ADMIN_EMAIL.toLowerCase() && !admin) {
    return res.status(403).json({ error: 'Эту запись может менять только сам главный администратор сайта' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!existing) {
    // Назначение новой роли — только главный админ. Рядовой ride-admin
    // видит лишь уже назначенных людей (см. GET выше) и до сюда дойти не
    // должен, но проверяем и на бэкенде, а не полагаемся на то, что
    // фронт не покажет форму создания.
    if (!admin) {
      return res.status(403).json({ error: 'Назначать роль новому пользователю может только главный администратор сайта' });
    }
    if (!req.body.role) {
      return res.status(400).json({ error: 'Укажите роль' });
    }
    db.prepare('INSERT INTO users (email, name, phone, role, full_site_access) VALUES (?, ?, ?, ?, ?)')
      .run(email, req.body.name, req.body.phone, req.body.role, req.body.fullSiteAccess ? 1 : 0);
  } else {
    // Роль и full_site_access у уже существующей записи тоже правит
    // только главный админ — рядовой ride-admin отсюда может изменить
    // только имя/телефон ("заполнить карточку"), даже если бы прислал
    // role/fullSiteAccess в теле запроса.
    const role = admin && req.body.role ? req.body.role : existing.role;
    const fullSiteAccess = admin ? (req.body.fullSiteAccess ? 1 : 0) : existing.full_site_access;
    db.prepare('UPDATE users SET name = ?, phone = ?, role = ?, full_site_access = ? WHERE id = ?')
      .run(req.body.name, req.body.phone, role, fullSiteAccess, existing.id);
  }

  res.json({ user: serializeUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email)) });
});

router.delete('/:email', requireRideRole('admin'), (req, res) => {
  if (!isSiteAdmin(req)) {
    return res.status(403).json({ error: 'Убрать роль у пользователя может только главный администратор сайта' });
  }

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
