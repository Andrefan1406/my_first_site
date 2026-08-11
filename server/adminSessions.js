// Админ-эндпоинты для управления сессиями устройств (см. server/deviceSession.js,
// active_sessions/blocked_login_attempts в server/db.js) — просмотр активных
// сессий и заблокированных попыток входа конкретного пользователя, а также
// принудительный сброс сессии (освобождение слота устройства). Тот же
// принцип защиты, что и в server/peopleGapsAdmin.js: requireAdmin проверяет
// Firebase ID-токен и email на бэкенде, а не только на фронтенде.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireAdmin } = require('./adminAuth');

const router = express.Router();
router.use(requireAdmin);

router.get('/:userId/sessions', (req, res) => {
  const userId = req.params.userId.toLowerCase();
  const sessions = getWriteDb()
    .prepare(`
      SELECT device_type, user_agent, ip_address, created_at, last_active_at
      FROM active_sessions
      WHERE user_id = ?
      ORDER BY device_type ASC
    `)
    .all(userId);
  res.json({ sessions });
});

router.get('/:userId/blocked-attempts', (req, res) => {
  const userId = req.params.userId.toLowerCase();
  const attempts = getWriteDb()
    .prepare(`
      SELECT device_type, attempted_device_id, user_agent, ip_address, created_at
      FROM blocked_login_attempts
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `)
    .all(userId);
  res.json({ attempts });
});

// Освобождает слот конкретного типа устройства — например, если сотрудник
// поменял телефон и старый недоступен, чтобы подтвердить пароль/токен для
// снятия сессии. После этого следующий вход с ЛЮБОГО устройства этого типа
// снова создаст новую запись в active_sessions (см. POST /api/session/register).
router.delete('/:userId/sessions/:deviceType', (req, res) => {
  const userId = req.params.userId.toLowerCase();
  const { deviceType } = req.params;
  if (!['mobile', 'desktop'].includes(deviceType)) {
    return res.status(400).json({ error: "deviceType должен быть 'mobile' или 'desktop'" });
  }

  const result = getWriteDb()
    .prepare('DELETE FROM active_sessions WHERE user_id = ? AND device_type = ?')
    .run(userId, deviceType);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Активная сессия этого типа не найдена' });
  }

  res.json({ ok: true });
});

module.exports = router;
