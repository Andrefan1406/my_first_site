// Проверка доступа к админ-эндпоинтам (например, решения по пропускам в
// отчётах по людям, см. peopleGapsAdmin.js).
//
// Клиент присылает Firebase ID-токен в заголовке Authorization: Bearer <token>.
// Проверка email на фронтенде (см. src/components/AdminRoute.jsx) — это только
// UX: скрыть ссылку/показать "доступ запрещён". Настоящая граница безопасности —
// здесь, потому что бэкенд-эндпоинты открыты по сети (CORS: *) и без этой
// проверки любой, кто узнает URL, мог бы дёргать их напрямую, минуя фронтенд.
//
// verifyIdToken проверяет подпись токена по публичным ключам Google и claim'ы
// (aud/iss = наш Firebase-проект) — для этого сервисный аккаунт не нужен,
// поэтому initializeApp() вызывается только с projectId.
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const FIREBASE_PROJECT_ID = 'my-first-site-16a0c';
const ADMIN_EMAIL = 'admin@vkdev.kz';

if (!getApps().length) {
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Не передан токен авторизации' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    if (decoded.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Доступ только для администратора' });
    }
    req.adminEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный или просроченный токен авторизации' });
  }
}

module.exports = { requireAdmin, ADMIN_EMAIL };
