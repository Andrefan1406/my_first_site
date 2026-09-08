// Auth для системы поездок: переиспользуем Firebase Auth проекта (тот же,
// что и для остального сайта, см. server/adminAuth.js) — НЕ заводим
// отдельный JWT/пароли. Но, в отличие от остального сайта (там валидного
// Firebase-токена достаточно для доступа), сюда пускаем только тех, кто
// заранее добавлен админом в таблицу rides.users с ролью — обычный
// сотрудник с рабочим логином, но без такой записи, получает 403 на
// любом эндпоинте /api/v1/*.
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getWriteDb } = require('./db');
// Главный админ сайта (server/adminAuth.js) — в системе поездок у него
// осознанно нет собственной роли/записи: он только назначает роли другим
// на /rides-admin и смотрит (без права правки) справочники водителей и
// машин. requireSiteAdmin/requireRoleOrSiteAdmin ниже проверяют это по
// email из Firebase-токена, а не по rides.users — записи там может не быть.
const { ADMIN_EMAIL } = require('../adminAuth');

const FIREBASE_PROJECT_ID = 'my-first-site-16a0c';

// На случай, если этот модуль когда-нибудь загрузится раньше
// server/adminAuth.js (сейчас — не загружается, см. комментарий там же):
// то же самое решение через FIREBASE_SERVICE_ACCOUNT_JSON, чтобы
// listUsers() в usersRouter.js не зависел от порядка require() в
// server/index.js.
if (!getApps().length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    initializeApp({ credential: cert(JSON.parse(raw)), projectId: FIREBASE_PROJECT_ID });
  } else {
    initializeApp({ projectId: FIREBASE_PROJECT_ID });
  }
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

// Только главный админ сайта — для назначения ролей (/api/v1/users, кроме /me).
function requireSiteAdmin(req, res, next) {
  verifyToken(req, res).then((decoded) => {
    if (!decoded) return; // verifyToken уже отправил 401
    req.firebaseEmail = decoded.email;
    if (decoded.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: 'Доступ только для главного администратора сайта' });
    }
    next();
  });
}

// Нужная роль ИЛИ главный админ — для эндпоинтов, которые главному
// админу можно только читать (справочники водителей/машин): диспетчер
// правит их полноценно, главный админ видит то же самое, но пишущие
// роуты этим хелпером не защищают — там отдельно requireRideRole(role).
function requireRoleOrSiteAdmin(...roles) {
  return (req, res, next) => {
    loadRideUser(req, res, () => {
      const isSiteAdmin = req.firebaseEmail?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (isSiteAdmin) return next();
      if (!req.rideUser || !roles.includes(req.rideUser.role)) {
        return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
      }
      next();
    });
  };
}

module.exports = {
  loadRideUser, requireAnyRideUser, requireRideRole, requireSiteAdmin, requireRoleOrSiteAdmin,
  findRideUserByEmail, verifyToken,
};
