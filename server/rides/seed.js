// Простой seed для системы поездок: тестовые водители, машины и пара
// заявок. Идемпотентен — повторный запуск не плодит дубликаты (email/
// гос.номер уникальны, заявки создаются только если таблица requests
// ещё пуста).
//
// ВАЖНО: email здесь — вымышленные. Чтобы реально войти под сотрудником/
// водителем из сева, под этим же email должен существовать аккаунт в
// Firebase Authentication проекта (создаётся отдельно, например через
// Firebase Console) — сам seed заводит только записи в SQLite. Проще
// всего для локальной проверки: завести себе в Firebase тестовый аккаунт
// и назначить ему роль через /rides-admin (страница управления
// пользователями), а не полагаться на email из этого скрипта.
const { initSchema, getWriteDb } = require('./db');

initSchema();
const db = getWriteDb();

function upsertUser({ email, name, phone, role, fullSiteAccess = 0 }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const info = db
    .prepare('INSERT INTO users (email, name, phone, role, full_site_access) VALUES (?, ?, ?, ?, ?)')
    .run(email, name, phone, role, fullSiteAccess ? 1 : 0);
  return info.lastInsertRowid;
}

function upsertVehicle({ plateNumber, model }) {
  const existing = db.prepare('SELECT id FROM vehicles WHERE plate_number = ?').get(plateNumber);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO vehicles (plate_number, model) VALUES (?, ?)').run(plateNumber, model);
  return info.lastInsertRowid;
}

function upsertDriver({ userId, vehicleId }) {
  const existing = db.prepare('SELECT id FROM drivers WHERE user_id = ?').get(userId);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO drivers (user_id, vehicle_id) VALUES (?, ?)').run(userId, vehicleId);
  return info.lastInsertRowid;
}

const dispatcherId = upsertUser({ email: 'dispatcher@example.com', name: 'Айгуль Диспетчерова', phone: '+77010000001', role: 'dispatcher' });
const adminId = upsertUser({ email: 'rides-admin@example.com', name: 'Админ Поездок', phone: '+77010000002', role: 'admin' });

const driver1UserId = upsertUser({ email: 'driver1@example.com', name: 'Ерлан Водителев', phone: '+77010000003', role: 'driver' });
const driver2UserId = upsertUser({ email: 'driver2@example.com', name: 'Данияр Шофёров', phone: '+77010000004', role: 'driver' });

const employee1Id = upsertUser({ email: 'employee1@example.com', name: 'Сауле Сотрудникова', phone: '+77010000005', role: 'employee' });
const employee2Id = upsertUser({ email: 'employee2@example.com', name: 'Марат Заказчиков', phone: '+77010000006', role: 'employee' });

const vehicle1Id = upsertVehicle({ plateNumber: '123ABC02', model: 'Toyota Camry' });
const vehicle2Id = upsertVehicle({ plateNumber: '456DEF02', model: 'Hyundai Sonata' });

const driver1Id = upsertDriver({ userId: driver1UserId, vehicleId: vehicle1Id });
const driver2Id = upsertDriver({ userId: driver2UserId, vehicleId: vehicle2Id });

const requestsCount = db.prepare('SELECT COUNT(*) AS n FROM requests').get().n;
if (requestsCount === 0) {
  const insertRequest = db.prepare(
    `INSERT INTO requests (employee_id, from_address, to_address, requested_at, purpose, passengers_count, comment, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_assignment')`
  );
  const insertHistory = db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`);

  const r1 = insertRequest.run(employee1Id, 'Офис, ул. Абая 10', 'Объект «Экополис», позиция 103', '2026-08-26 09:00', 'Осмотр объекта', 1, '');
  insertHistory.run(r1.lastInsertRowid, employee1Id);

  const r2 = insertRequest.run(employee2Id, 'Офис, ул. Абая 10', 'Аэропорт', '2026-08-26 14:30', 'Встреча делегации', 3, 'Нужен минивэн, если есть');
  insertHistory.run(r2.lastInsertRowid, employee2Id);

  console.log('Добавлено 2 тестовые заявки.');
} else {
  console.log('В requests уже есть данные — заявки не добавлялись.');
}

console.log('Готово:', { dispatcherId, adminId, driver1Id, driver2Id, employee1Id, employee2Id });
