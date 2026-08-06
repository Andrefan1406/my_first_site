// API для админ-панели «Пропуски в отчётах по людям»: показать пропуски и
// принять по ним решение (см. server/db.js — people_report_gaps/
// people_gap_decisions/people_reports_resolved, server/syncPeople.js —
// rebuildDerivedTables). Все роуты защищены requireAdmin (server/adminAuth.js) —
// доступ только у admin@vkdev.kz, проверка по Firebase ID-токену на сервере,
// а не только на фронтенде.
const express = require('express');
const { getWriteDb } = require('./db');
const { runSyncOnce, rebuildDerivedTables } = require('./syncPeople');
const { requireAdmin } = require('./adminAuth');

const router = express.Router();
router.use(requireAdmin);

// Форсирует внеплановый синк отчётов по людям из Google Таблицы (обычно раз
// в 2 часа, см. PEOPLE_SYNC_CRON в syncPeople.js) — та же runSyncOnce, что и
// на старте сервера/по крону: тянет свежий CSV и пересчитывает
// people_report_gaps по ВСЕМ участкам (не по одному, в отличие от
// server/peopleGapsCheck.js — это админ-страница, ей нужен полный список).
router.post('/resync', async (req, res) => {
  try {
    const rowCount = await runSyncOnce();
    res.json({ ok: true, rowCount });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Не удалось пересинхронизировать отчёты по людям' });
  }
});

// Список пропусков/дней с опциональными фильтрами. По умолчанию отдаёт всё,
// чтобы фронтенд сам фильтровал на клиенте (объём данных небольшой — тысячи
// строк, не миллионы), но фильтры на сервере тоже поддержаны на случай роста.
//
// site поддерживает несколько значений — фронтенд шлёт повторяющийся параметр
// (?site=A&site=B), Express сам собирает такие в массив req.query.site (при
// одном значении будет просто строка) — используем IN(...) вместо равенства,
// чтобы фильтр "Участок" в админ-панели поддерживал множественный выбор.
router.get('/', (req, res) => {
  const { status, from, to } = req.query;
  const siteParam = req.query.site;
  const siteList = Array.isArray(siteParam) ? siteParam : siteParam ? [siteParam] : [];

  const clauses = [];
  const params = {};

  if (siteList.length) {
    const siteKeys = siteList.map((_, i) => `@site${i}`);
    clauses.push(`site IN (${siteKeys.join(', ')})`);
    siteList.forEach((s, i) => { params[`site${i}`] = s; });
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

  rebuildDerivedTables({ site });

  const updatedGap = db
    .prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`)
    .get(site, reportDate);

  res.json({ gap: updatedGap });
});

// Массовое принятие ОДНОГО action сразу для нескольких пропусков — кнопки
// "Применить к выбранным" в админ-панели, чтобы не кликать "Принять решение"
// по каждой строке отдельно (например, пачка выходных подряд без отчёта).
// Для action='copy' source_date не передаётся с фронта — сервер сам находит
// его для КАЖДОГО пропуска отдельно: ближайший реальный отчёт ДО дня, а если
// такого нет — ближайший ПОСЛЕ (тот же bestGuess, что по умолчанию предлагает
// одиночная панель решения на фронтенде, см. RowActions в PeopleGapsAdminPage).
// Битые элементы (нет кандидата для копии, день уже не пропуск и т.п.) не
// прерывают всю пачку — они просто попадают в errors, остальные применяются.
router.post('/decisions/bulk', (req, res) => {
  const { items, action } = req.body || {};

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items должен быть непустым массивом' });
  }
  if (!['copy', 'confirm_no_report', 'work_completed'].includes(action)) {
    return res.status(400).json({ error: "action должен быть 'copy', 'confirm_no_report' или 'work_completed'" });
  }

  const db = getWriteDb();

  const findGap = db.prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`);
  const findBefore = db.prepare(`
    SELECT report_date FROM people_report_gaps
    WHERE site = ? AND status = 'real' AND report_date < ?
    ORDER BY report_date DESC LIMIT 1
  `);
  const findAfter = db.prepare(`
    SELECT report_date FROM people_report_gaps
    WHERE site = ? AND status = 'real' AND report_date > ?
    ORDER BY report_date ASC LIMIT 1
  `);
  const findSourceReport = db.prepare(`SELECT 1 FROM people_reports WHERE site = ? AND report_date = ? LIMIT 1`);
  const upsertDecision = db.prepare(`
    INSERT INTO people_gap_decisions (site, report_date, action, source_date, note, decided_by, decided_at)
    VALUES (@site, @report_date, @action, @source_date, @note, @decided_by, datetime('now'))
    ON CONFLICT(site, report_date) DO UPDATE SET
      action = excluded.action,
      source_date = excluded.source_date,
      note = excluded.note,
      decided_by = excluded.decided_by,
      decided_at = datetime('now')
  `);

  const applied = [];
  const errors = [];
  const touchedSites = new Set();

  const applyAll = db.transaction(() => {
    for (const item of items) {
      const site = item?.site;
      const reportDate = item?.report_date;
      if (!site || !reportDate) {
        errors.push({ site, report_date: reportDate, error: 'site и report_date обязательны' });
        continue;
      }

      const gap = findGap.get(site, reportDate);
      if (!gap) {
        errors.push({ site, report_date: reportDate, error: 'Пропуск не найден' });
        continue;
      }
      if (gap.status !== 'missing' && !gap.status.startsWith('resolved_')) {
        errors.push({ site, report_date: reportDate, error: `День не является пропуском (status=${gap.status})` });
        continue;
      }

      let sourceDate = null;
      if (action === 'copy') {
        const before = findBefore.get(site, reportDate);
        const after = before ? null : findAfter.get(site, reportDate);
        sourceDate = (before || after)?.report_date || null;
        if (!sourceDate || !findSourceReport.get(site, sourceDate)) {
          errors.push({ site, report_date: reportDate, error: 'Нет реального отчёта для копирования' });
          continue;
        }
      }

      upsertDecision.run({
        site,
        report_date: reportDate,
        action,
        source_date: sourceDate,
        note: null,
        decided_by: req.adminEmail,
      });
      touchedSites.add(site);
      applied.push({ site, report_date: reportDate });
    }
  });

  applyAll();

  for (const site of touchedSites) {
    rebuildDerivedTables({ site });
  }

  const updatedGaps = applied.map(({ site, report_date: reportDate }) => findGap.get(site, reportDate));

  res.json({ gaps: updatedGaps, errors });
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

  rebuildDerivedTables({ site });

  const updatedGap = db
    .prepare(`SELECT * FROM people_report_gaps WHERE site = ? AND report_date = ?`)
    .get(site, reportDate);

  res.json({ gap: updatedGap });
});

// CRUD для people_gap_check_rules — какому email какой участок проверять на
// пропуски при подаче заявок (см. server/peopleGapsCheck.js, зачитывает эту
// же таблицу). Управляется из src/pages/PeopleGapsUsersAdminPage.jsx —
// первая часть будущей общей админ-панели управления пользователями/ролями,
// поэтому роуты уже под своим сегментом /check-rules, а не смешаны с
// пропусками.
router.get('/check-rules', (req, res) => {
  const rules = getWriteDb()
    .prepare('SELECT * FROM people_gap_check_rules ORDER BY email ASC, site ASC')
    .all();
  res.json({ rules });
});

router.post('/check-rules', (req, res) => {
  const { email, site } = req.body || {};
  if (!email || !email.trim() || !site || !site.trim()) {
    return res.status(400).json({ error: 'email и site обязательны' });
  }

  const db = getWriteDb();
  try {
    db.prepare(`
      INSERT INTO people_gap_check_rules (email, site, created_by)
      VALUES (@email, @site, @created_by)
    `).run({
      email: email.trim().toLowerCase(),
      site: site.trim(),
      created_by: req.adminEmail,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Такое правило (email + участок) уже есть' });
    }
    throw err;
  }

  const rules = db.prepare('SELECT * FROM people_gap_check_rules ORDER BY email ASC, site ASC').all();
  res.json({ rules });
});

router.delete('/check-rules/:id', (req, res) => {
  const db = getWriteDb();
  const result = db.prepare('DELETE FROM people_gap_check_rules WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Правило не найдено' });
  }
  res.json({ ok: true });
});

module.exports = router;
