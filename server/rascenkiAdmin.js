// Админ-эндпоинт принудительной переиндексации свода расценок в Qdrant.
// Плановой индексации у расценок нет (см. server/syncRascenki.js) — она
// запускается только отсюда, кнопкой в личном кабинете администратора
// (src/pages/RascenkiReindexAdminPage.jsx).
//
// Защищено requireAdmin — та же граница безопасности, что и у остальных
// /api/admin/* роутов.
//
// Переиндексация занимает ~1 минуту (батчи эмбеддингов идут с троттлингом),
// поэтому POST не ждёт её завершения: запускает в фоне и сразу отвечает 202,
// а фронтенд опрашивает GET /status, пока running=true.
const express = require('express');
const { requireAdmin } = require('./adminAuth');
const { getLastSyncedAt } = require('./db');
const { getClient } = require('./qdrantClient');
const { runSyncOnce, QDRANT_COLLECTION } = require('./syncRascenki');

const router = express.Router();
router.use(requireAdmin);

let running = false;
let startedAt = null;
let lastRun = null; // { ok, count?, error?, finishedAt }

router.post('/reindex', (req, res) => {
  if (running) {
    return res.status(409).json({ error: 'Переиндексация уже идёт', startedAt });
  }
  running = true;
  startedAt = new Date().toISOString();
  lastRun = null;
  console.log(`[rascenki-admin] переиндексация запущена вручную (${req.adminEmail})`);

  res.status(202).json({ started: true, startedAt });

  runSyncOnce()
    .then((count) => {
      lastRun = { ok: true, count, finishedAt: new Date().toISOString() };
      console.log(`[rascenki-admin] переиндексация завершена: ${count} строк`);
    })
    .catch((err) => {
      lastRun = { ok: false, error: err.message, finishedAt: new Date().toISOString() };
      console.error('[rascenki-admin] переиндексация упала:', err.message);
    })
    .finally(() => {
      running = false;
      startedAt = null;
    });
});

router.get('/status', async (req, res) => {
  let pointsCount = null;
  let vectorSize = null;
  try {
    const info = await getClient().getCollection(QDRANT_COLLECTION);
    pointsCount = info?.points_count ?? null;
    vectorSize = info?.config?.params?.vectors?.size ?? null;
  } catch (err) {
    // коллекции ещё нет — pointsCount останется null
  }

  res.json({
    running,
    startedAt,
    lastRun,
    lastSyncedAt: getLastSyncedAt('rascenki_last_synced_at'),
    collection: QDRANT_COLLECTION,
    pointsCount,
    vectorSize,
  });
});

module.exports = router;
