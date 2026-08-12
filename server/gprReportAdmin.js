// Админ-эндпоинт для пропусков в еженедельном % готовности ГПР (см.
// syncGprReport.js). Защищено requireAdmin — та же граница безопасности,
// что и у остальных /api/admin/* роутов этого проекта.
const express = require('express');
const { requireAdmin } = require('./adminAuth');
const { computeGprReportGaps, runSyncOnce } = require('./syncGprReport');
const { getWriteDb } = require('./db');

const router = express.Router();
router.use(requireAdmin);

const lastSyncedAt = () =>
  getWriteDb().prepare(`SELECT value FROM sync_meta WHERE key = 'gpr_report_last_synced_at'`).get()?.value || null;

// Текущие пропуски по позиции 64 — конструктивы, у которых после последней
// заполненной недели и вплоть до контрольной пятницы (последняя пятница на
// сегодня или раньше) остались пустые ячейки "Процент".
router.get('/gaps', (req, res) => {
  const result = computeGprReportGaps();
  res.json({ ...result, last_synced_at: lastSyncedAt() });
});

// Внеплановый синк из Google Таблицы, не дожидаясь планового крона (раз в
// 6 часов, см. GPR_REPORT_SYNC_CRON) — та же runSyncOnce, что и на старте
// сервера/по крону.
router.post('/resync', async (req, res) => {
  try {
    const rowCount = await runSyncOnce();
    res.json({ ok: true, rowCount });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Не удалось пересинхронизировать ГПР' });
  }
});

// CRUD для gpr_report_check_rules — email'ы, для которых подача заявок
// блокируется, пока в ГПР (позиция 64) есть незакрытый пропуск (см.
// server/gprReportCheck.js — публичная проверка без requireAdmin,
// используемая самой формой заявки/главной страницей). Управляется из
// src/pages/PeopleGapsUsersAdminPage.jsx, тем же экраном, что и правила
// для людей — это один и тот же концептуально раздел "кого проверять".
router.get('/check-rules', (req, res) => {
  const rules = getWriteDb()
    .prepare('SELECT * FROM gpr_report_check_rules ORDER BY email ASC')
    .all();
  res.json({ rules });
});

router.post('/check-rules', (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'email обязателен' });
  }

  const db = getWriteDb();
  try {
    db.prepare(`
      INSERT INTO gpr_report_check_rules (email, created_by)
      VALUES (@email, @created_by)
    `).run({
      email: email.trim().toLowerCase(),
      created_by: req.adminEmail,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Такое правило (email) уже есть' });
    }
    throw err;
  }

  const rules = db.prepare('SELECT * FROM gpr_report_check_rules ORDER BY email ASC').all();
  res.json({ rules });
});

router.delete('/check-rules/:id', (req, res) => {
  const db = getWriteDb();
  const result = db.prepare('DELETE FROM gpr_report_check_rules WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Правило не найдено' });
  }
  res.json({ ok: true });
});

module.exports = router;
