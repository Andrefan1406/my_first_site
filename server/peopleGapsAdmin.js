// API для админ-панели «Пропуски в отчётах по людям»: показать пропуски и
// принять по ним решение (см. server/db.js — people_report_gaps/
// people_gap_decisions/people_reports_resolved, server/syncPeople.js —
// rebuildDerivedTables). Все роуты защищены requireAdmin (server/adminAuth.js) —
// доступ только у admin@vkdev.kz, проверка по Firebase ID-токену на сервере,
// а не только на фронтенде.
const express = require('express');
const { getWriteDb } = require('./db');
const { rebuildDerivedTables } = require('./syncPeople');
const { requireAdmin } = require('./adminAuth');

const router = express.Router();
router.use(requireAdmin);

// Список пропусков/дней с опциональными фильтрами. По умолчанию отдаёт всё,
// чтобы фронтенд сам фильтровал на клиенте (объём данных небольшой — тысячи
// строк, не миллионы), но фильтры на сервере тоже поддержаны на случай роста.
router.get('/', (req, res) => {
  const { site, status, from, to } = req.query;
  const clauses = [];
  const params = {};

  if (site) {
    clauses.push('site = @site');
    params.site = site;
  }
  if (status) {
    clauses.push('status = @status');
    params.status = status;
  }
  if (from) {
    clauses.push('report_date >= @from');
    params.from = from;
  }
  if (to) {
    clauses.push('report_date <= @to');
    params.to = to;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getWriteDb()
    .prepare(`SELECT * FROM people_report_gaps ${where} ORDER BY report_date DESC, site ASC`)
    .all(params);

  const sites = getWriteDb()
    .prepare('SELECT DISTINCT site FROM people_report_gaps ORDER BY site ASC')
    .all()
    .map((r) => r.site);

  const summary = {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'missing').length,
    resolvedCopy: rows.filter((r) => r.status === 'resolved_copy').length,
    resolvedNoReport: rows.filter((r) => r.status === 'resolved_no_report').length,
    resolvedCompleted: rows.filter((r) => r.status === 'resolved_completed').length,
  };

  res.json({ gaps: rows, sites, summary });
});

// Варианты для "скопировать с...": только ближайший реальный отчёт ДО
// пропуска и ближайший реальный отчёт ПОСЛЕ него (по одному с каждой
// стороны) — а не вся история участка, которая может уходить на годы назад
// и не иметь отношения к конкретному пропущенному дню.
router.get('/candidates', (req, res) => {
  const { site, report_date: reportDate } = req.query;
  if (!site || !reportDate) {
    return res.status(400).json({ error: 'Параметры site и report_date обязательны' });
  }

  const db = getWriteDb();

  const before = db
    .prepare(`
      SELECT report_date, total_headcount, entries_count
      FROM people_report_gaps
      WHERE site = ? AND status = 'real' AND report_date < ?
      ORDER BY report_date DESC
      LIMIT 1
    `)
    .get(site, reportDate);

  const after = db
    .prepare(`
      SELECT report_date, total_headcount, entries_count
      FROM people_report_gaps
      WHERE site = ? AND status = 'real' AND report_date > ?
      ORDER BY report_date ASC
      LIMIT 1
    `)
    .get(site, reportDate);

  res.json({ candidates: [before, after].filter(Boolean) });
});

// Принять решение по пропуску: скопировать данные с source_date, подтвердить,
// что участок в этот день не работал, либо отметить "работы завершены" —
// последнее закрывает участок на все последующие дни (см.
// peopleGapDetection.js) до нового реального отчёта или следующего такого
// же решения. Дни со status='inactive' (уже закрытые более ранним
// 'work_completed') сюда не попадают — их нельзя решить напрямую, нужно
// отменить исходное решение 'work_completed' на более ранней дате.
router.post('/decisions', (req, res) => {
  const { site, report_date: reportDate, action, source_date: sourceDate, note } = req.body || {};

  if (!site || !reportDate || !action) {
    return res.status(400).json({ error: 'site, report_date и action обязательны' });
  }
  if (!['copy', 'confirm_no_report', 'work_completed'].includes(action)) {
    return res.status(400).json({ error: "action должен быть 'copy', 'confirm_no_report' или 'work_completed'" });
  }
  if (action === 'copy' && !sourceDate) {
    return res.status(400).json({ error: "Для action='copy' обязателен source_date" });
  }

  const db = getWriteDb();

  const gap = db
    .prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`)
    .get(site, reportDate);
  if (!gap) {
    return res.status(404).json({ error: 'Пропуск не найден для указанных site/report_date' });
  }
  if (gap.status !== 'missing' && !gap.status.startsWith('resolved_')) {
    return res.status(409).json({ error: `Этот день не является пропуском (status=${gap.status})` });
  }

  if (action === 'copy') {
    const sourceHasData = db
      .prepare(`SELECT 1 FROM people_reports WHERE site = ? AND report_date = ? LIMIT 1`)
      .get(site, sourceDate);
    if (!sourceHasData) {
      return res.status(400).json({ error: `За ${sourceDate} по участку "${site}" нет реального отчёта` });
    }
  }

  db.prepare(`
    INSERT INTO people_gap_decisions (site, report_date, action, source_date, note, decided_by, decided_at)
    VALUES (@site, @report_date, @action, @source_date, @note, @decided_by, datetime('now'))
    ON CONFLICT(site, report_date) DO UPDATE SET
      action = excluded.action,
      source_date = excluded.source_date,
      note = excluded.note,
      decided_by = excluded.decided_by,
      decided_at = datetime('now')
  `).run({
    site,
    report_date: reportDate,
    action,
    source_date: action === 'copy' ? sourceDate : null,
    note: note || null,
    decided_by: req.adminEmail,
  });

  rebuildDerivedTables();

  const updatedGap = db
    .prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`)
    .get(site, reportDate);

  res.json({ gap: updatedGap });
});

// Отменить ранее принятое решение — пропуск возвращается в 'missing'
// (если за день по-прежнему нет реального отчёта).
router.delete('/decisions', (req, res) => {
  const { site, report_date: reportDate } = req.body || {};
  if (!site || !reportDate) {
    return res.status(400).json({ error: 'site и report_date обязательны' });
  }

  const db = getWriteDb();
  const result = db
    .prepare('DELETE FROM people_gap_decisions WHERE site = ? AND report_date = ?')
    .run(site, reportDate);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Решение не найдено' });
  }

  rebuildDerivedTables();

  const updatedGap = db
    .prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`)
    .get(site, reportDate);

  res.json({ gap: updatedGap });
});

module.exports = router;
