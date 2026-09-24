// Ручная блокировка пользователя администратором (manual_user_blocks, см.
// server/db.js) — в дополнение к автоматическим блокировкам за пропуски в
// отчётах по людям (peopleGapsCheck.js) и ГПР (gprReportCheck.js). Два
// роутера: публичная проверка /check (как у тех двух — форма/главная
// вызывают её без admin-доступа) и админский CRUD под requireAdmin.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireAdmin } = require('./adminAuth');

const COMMENT_MAX_LENGTH = 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function listManualBlocks() {
  return getWriteDb()
    .prepare('SELECT email, blocked, comment, updated_by, updated_at FROM manual_user_blocks ORDER BY email')
    .all()
    .map((r) => ({ ...r, blocked: !!r.blocked }));
}

const checkRouter = express.Router();

// Для email без записи (или с blocked=0) — blocked:false, проверка прозрачна.
checkRouter.get('/check', (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ error: 'Параметр email обязателен' });
  }

  const row = getWriteDb()
    .prepare('SELECT blocked, comment FROM manual_user_blocks WHERE email = ?')
    .get(email);

  if (!row || !row.blocked) {
    return res.json({ blocked: false, comment: '' });
  }
  res.json({ blocked: true, comment: row.comment || '' });
});

const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/', (req, res) => {
  res.json({ blocks: listManualBlocks() });
});

// Upsert: и включение/выключение переключателя, и правка комментария — одним
// запросом. POST, а не PUT — CORS в index.js разрешает только GET/POST/DELETE.
adminRouter.post('/', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const blocked = !!req.body?.blocked;
  const comment = String(req.body?.comment || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Укажите корректный email' });
  }
  if (comment.length > COMMENT_MAX_LENGTH) {
    return res.status(400).json({ error: `Комментарий длиннее ${COMMENT_MAX_LENGTH} символов` });
  }
  if (blocked && !comment) {
    return res.status(400).json({ error: 'Укажите комментарий — он будет показан пользователю на главной' });
  }

  getWriteDb().prepare(`
    INSERT INTO manual_user_blocks (email, blocked, comment, updated_by, updated_at)
    VALUES (@email, @blocked, @comment, @updated_by, datetime('now'))
    ON CONFLICT(email) DO UPDATE SET
      blocked = excluded.blocked,
      comment = excluded.comment,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run({ email, blocked: blocked ? 1 : 0, comment, updated_by: req.adminEmail });

  res.json({ blocks: listManualBlocks() });
});

adminRouter.delete('/:email', (req, res) => {
  getWriteDb().prepare('DELETE FROM manual_user_blocks WHERE email = ?').run(normalizeEmail(req.params.email));
  res.json({ blocks: listManualBlocks() });
});

module.exports = { checkRouter, adminRouter, listManualBlocks };
