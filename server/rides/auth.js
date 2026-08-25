// Auth для системы поездок: переиспользуем Firebase Auth проекта (тот же,
// что и для остального сайта, см. server/adminAuth.js) — НЕ заводим
// отдельный JWT/пароли. Но, в отличие от остального сайта (там валидного
// Firebase-токена достаточно для доступа), сюда пускаем только тех, кто
// заранее добавлен админом в таблицу rides.users с ролью — обычный
// сотрудник с рабочим логином, но без такой записи, получает 403 на
// любом эндпоинте /api/v1/*.
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getWriteDb } = require('./db');

const FIREBASE_PROJECT_ID = 'my-first-site-16a0c';

if (!getApps().length) {
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

async function verifyToken(req, res) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Не передан токен авторизации' });
    return null;
  }
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch (err) {
    res.status(401).json({ error: 'Недействительный или просроченный токен авторизации' });
    return null;
  }
}

function findRideUserByEmail(email) {
  return getWriteDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase());
}

// Верифицирует токен и подгружает запись из rides.users в req.rideUser
// (null, если человек не добавлен в систему поездок) — общий первый шаг
// для requireRideRole/requireAnyRideUser и для GET /users/me.
async function loadRideUser(req, res, next) {
  const decoded = await verifyToken(req, res);
  if (!decoded || !decoded.email) return;
  req.firebaseEmail = decoded.email;
  req.rideUser = findRideUserByEmail(decoded.email) || null;
  next();
}

// Требует, чтобы пользователь был добавлен в систему поездок (любая роль).
function requireAnyRideUser(req, res, next) {
  loadRideUser(req, res, () => {
    if (!req.rideUser) {
      return res.status(403).json({ error: 'Вы не добавлены как пользователь системы служебного транспорта' });
    }
    next();
  });
}

// Требует конкретную роль (или одну из нескольких).
function requireRideRole(...roles) {
  return (req, res, next) => {
    loadRideUser(req, res, () => {
      if (!req.rideUser) {
        return res.status(403).json({ error: 'Вы не добавлены как пользователь системы служебного транспорта' });
      }
      if (!roles.includes(req.rideUser.role)) {
        return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
      }
      next();
    });
  };
}

module.exports = { loadRideUser, requireAnyRideUser, requireRideRole, findRideUserByEmail, verifyToken };
