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

module.exports = router;
