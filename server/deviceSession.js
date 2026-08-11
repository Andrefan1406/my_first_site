// Ограничение количества одновременных сессий на аккаунт: не более одного
// мобильного и одного десктопного устройства одновременно (см. active_sessions
// в server/db.js).
//
// ВАЖНО про архитектуру: вход в приложение идёт напрямую через Firebase Auth
// с клиента (signInWithEmailAndPassword в src/LoginPage.jsx) — у нас нет
// собственного login-эндпоинта и собственных refresh/access токенов, поэтому
// наш backend физически не может заблокировать вход СИНХРОННО, до того как
// Firebase уже аутентифицировал пользователя. Вместо этого используется
// POST-AUTH проверка: фронтенд сразу после успешного входа в Firebase дёргает
// POST /api/session/register с Firebase ID-токеном; если слот занят другим
// устройством — 409, и фронтенд предлагает пользователю самому "отключить"
// старое устройство (по образцу WhatsApp Web), а не сразу жёстко блокирует
// (см. src/deviceSession.js, src/LoginPage.jsx, src/components/PrivateRoute.jsx).
//
// Три эндпоинта на разное поведение:
//   POST /register  — используется в момент входа: создаёт запись, если слота
//     ещё нет; подтверждает, если слот уже наш (тот же device_id); отклоняет
//     (409), если слот занят другим устройством. Пишет в active_sessions.
//   POST /takeover   — вызывается только после явного подтверждения
//     пользователем в диалоге "аккаунт уже используется, отключить?" —
//     безусловно забирает слот у текущего устройства, независимо от того, кто
//     им владел. Не проверяет конфликт — сам факт вызова с валидным Firebase-
//     токеном И является подтверждением (тот же человек, что ввёл пароль).
//   GET  /check      — используется для постоянной проверки уже открытой
//     сессии (при заходе на защищённую страницу, см. PrivateRoute.jsx).
//     СТРОГО проверяет, что запись всё ещё существует и device_id совпадает —
//     если слот забрали через /takeover, администратор освободил его (DELETE
//     .../sessions/:deviceType) или слот вообще пуст, НЕ создаёт новую запись
//     сам, а отдаёт 401. Иначе устройство, у которого только что отобрали
//     слот, тут же само себе вернуло бы его на следующей проверке.
const crypto = require('crypto');
const express = require('express');
const { UAParser } = require('ua-parser-js');
const { getAuth } = require('firebase-admin/auth');
const { getWriteDb } = require('./db');

const DEVICE_ID_COOKIE = 'device_id';
const DEVICE_ID_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000; // ~10 лет, как в задаче

const DEVICE_SLOT_TAKEN_MESSAGE = 'Этот аккаунт уже используется на другом устройстве.';

// Фронтенд (Netlify) и backend (Render) — разные origin, поэтому httpOnly
// cookie с device_id может дойти только при кросс-сайтовом запросе с
// credentials:'include' И SameSite=None; Secure. Обычный "Access-Control-
// Allow-Origin: *" (см. server/index.js) с cookie несовместим — браузер не
// отдаст и не примет cookie на wildcard-происхождение, поэтому у роутов
// /api/session/* свой, более узкий CORS с конкретным origin.
const ALLOWED_ORIGINS = (
  process.env.SESSION_CORS_ORIGINS || 'https://vkdevelopment.netlify.app,http://localhost:3000'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Netlify branch/PR-превью получают URL вида
// "<ветка>--vkdevelopment.netlify.app" — отдельный origin на каждую ветку,
// который невозможно перечислить заранее через ALLOWED_ORIGINS. Разрешаем
// его отдельным regex-паттерном (тот же сайт, просто другой поддомен), не
// открывая CORS вообще всем подряд доменам.
const NETLIFY_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+--vkdevelopment\.netlify\.app$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || NETLIFY_PREVIEW_ORIGIN.test(origin);
}

function sessionCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// 'tablet' считаем мобильным (сенсорное устройство) — в задаче только два
// типа, третьей корзины под планшеты нет. Всё, что ua-parser-js не смог
// уверенно распознать как mobile/tablet (включая случай, когда device.type
// вообще не определён — так выглядит обычный десктопный браузер), считаем
// десктопом.
function detectDeviceType(userAgent) {
  const { device } = new UAParser(userAgent || '').getResult();
  if (device.type === 'mobile' || device.type === 'tablet') return 'mobile';
  return 'desktop';
}

function generateDeviceId() {
  return crypto.randomBytes(32).toString('hex');
}

function hashDeviceId(deviceId) {
  return crypto.createHash('sha256').update(deviceId).digest('hex');
}

function getClientIp(req) {
  // req.ip корректно резолвится в реальный IP клиента (не Render-прокси)
  // только при app.set('trust proxy', ...) — включено в server/index.js.
  return req.ip || req.socket?.remoteAddress || null;
}

// Достаёт device_id из cookie, если он есть, либо генерирует новый и сразу
// проставляет httpOnly cookie на ~10 лет. Не разделяет "чтение" и "запись" —
// вызывающему коду нужен только итоговый device_id.
function getOrCreateDeviceId(req, res) {
  const existing = req.cookies?.[DEVICE_ID_COOKIE];
  if (existing) return existing;

  const deviceId = generateDeviceId();
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(DEVICE_ID_COOKIE, deviceId, {
    httpOnly: true,
    secure: isProd, // SameSite=None ТРЕБУЕТ Secure — на локальной http-разработке используем Lax вместо этого
    sameSite: isProd ? 'none' : 'lax',
    maxAge: DEVICE_ID_MAX_AGE_MS,
    path: '/',
  });
  return deviceId;
}

// Верифицирует Firebase ID-токен из Authorization: Bearer — тот же принцип,
// что и requireAdmin/requireEmails в server/adminAuth.js, но без ограничения
// по email: сюда должен попадать ЛЮБОЙ авторизованный в Firebase пользователь,
// а не только администратор.
async function verifyFirebaseUser(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error('Не передан токен авторизации');
    err.status = 401;
    throw err;
  }
  try {
    return await getAuth().verifyIdToken(match[1]);
  } catch (err) {
    const wrapped = new Error('Недействительный или просроченный токен авторизации');
    wrapped.status = 401;
    throw wrapped;
  }
}

const router = express.Router();
router.use(sessionCors);

router.post('/register', async (req, res) => {
  let decoded;
  try {
    decoded = await verifyFirebaseUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
  if (!decoded.email) {
    return res.status(400).json({ error: 'У пользователя не задан email' });
  }

  const userId = decoded.email.toLowerCase();
  const userAgent = req.headers['user-agent'] || '';
  const deviceType = detectDeviceType(userAgent);
  const deviceId = getOrCreateDeviceId(req, res);
  const deviceIdHash = hashDeviceId(deviceId);
  const ipAddress = getClientIp(req);

  const db = getWriteDb();
  const existing = db
    .prepare('SELECT * FROM active_sessions WHERE user_id = ? AND device_type = ?')
    .get(userId, deviceType);

  if (existing && existing.refresh_token_hash !== deviceIdHash) {
    db.prepare(`
      INSERT INTO blocked_login_attempts (user_id, device_type, attempted_device_id, user_agent, ip_address)
      VALUES (@user_id, @device_type, @attempted_device_id, @user_agent, @ip_address)
    `).run({
      user_id: userId,
      device_type: deviceType,
      attempted_device_id: deviceId,
      user_agent: userAgent,
      ip_address: ipAddress,
    });
    return res.status(409).json({ code: 'DEVICE_SLOT_TAKEN', error: DEVICE_SLOT_TAKEN_MESSAGE });
  }

  if (existing) {
    db.prepare(`
      UPDATE active_sessions
      SET user_agent = @user_agent, ip_address = @ip_address, last_active_at = datetime('now')
      WHERE user_id = @user_id AND device_type = @device_type
    `).run({ user_id: userId, device_type: deviceType, user_agent: userAgent, ip_address: ipAddress });
  } else {
    db.prepare(`
      INSERT INTO active_sessions (user_id, device_type, device_id, refresh_token_hash, user_agent, ip_address)
      VALUES (@user_id, @device_type, @device_id, @refresh_token_hash, @user_agent, @ip_address)
    `).run({
      user_id: userId,
      device_type: deviceType,
      device_id: deviceId,
      refresh_token_hash: deviceIdHash,
      user_agent: userAgent,
      ip_address: ipAddress,
    });
  }

  res.json({ ok: true, deviceType });
});

// Вызывается ТОЛЬКО после того, как пользователь сам подтвердил в диалоге
// "аккаунт уже используется на другом устройстве — отключить его?" (см.
// src/LoginPage.jsx). Валидный Firebase ID-токен здесь и есть подтверждение —
// значит человек только что ввёл правильный пароль от ЭТОГО аккаунта, а
// значит имеет право сам решить, какое из своих устройств оставить активным.
// Безусловно перезаписывает слот (ON CONFLICT DO UPDATE), не проверяя,
// совпадает ли текущий device_id — в этом и весь смысл эндпоинта.
router.post('/takeover', async (req, res) => {
  let decoded;
  try {
    decoded = await verifyFirebaseUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
  if (!decoded.email) {
    return res.status(400).json({ error: 'У пользователя не задан email' });
  }

  const userId = decoded.email.toLowerCase();
  const userAgent = req.headers['user-agent'] || '';
  const deviceType = detectDeviceType(userAgent);
  const deviceId = getOrCreateDeviceId(req, res);
  const deviceIdHash = hashDeviceId(deviceId);
  const ipAddress = getClientIp(req);

  getWriteDb().prepare(`
    INSERT INTO active_sessions (user_id, device_type, device_id, refresh_token_hash, user_agent, ip_address)
    VALUES (@user_id, @device_type, @device_id, @refresh_token_hash, @user_agent, @ip_address)
    ON CONFLICT(user_id, device_type) DO UPDATE SET
      device_id = excluded.device_id,
      refresh_token_hash = excluded.refresh_token_hash,
      user_agent = excluded.user_agent,
      ip_address = excluded.ip_address,
      last_active_at = datetime('now')
  `).run({
    user_id: userId,
    device_type: deviceType,
    device_id: deviceId,
    refresh_token_hash: deviceIdHash,
    user_agent: userAgent,
    ip_address: ipAddress,
  });

  res.json({ ok: true, deviceType });
});

router.get('/check', async (req, res) => {
  let decoded;
  try {
    decoded = await verifyFirebaseUser(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }
  if (!decoded.email) {
    return res.status(401).json({ error: 'У пользователя не задан email' });
  }

  const userId = decoded.email.toLowerCase();
  const userAgent = req.headers['user-agent'] || '';
  const deviceType = detectDeviceType(userAgent);
  const deviceId = req.cookies?.[DEVICE_ID_COOKIE];

  if (!deviceId) {
    return res.status(401).json({ error: 'Сессия не найдена — войдите заново' });
  }

  const db = getWriteDb();
  const existing = db
    .prepare('SELECT * FROM active_sessions WHERE user_id = ? AND device_type = ?')
    .get(userId, deviceType);

  if (!existing || existing.refresh_token_hash !== hashDeviceId(deviceId)) {
    return res.status(401).json({ error: 'Сессия завершена администратором или с этого устройства уже выполнен вход в другой аккаунт' });
  }

  db.prepare(`UPDATE active_sessions SET last_active_at = datetime('now') WHERE id = ?`).run(existing.id);
  res.json({ ok: true, deviceType });
});

module.exports = { router, detectDeviceType, hashDeviceId, DEVICE_ID_COOKIE };
