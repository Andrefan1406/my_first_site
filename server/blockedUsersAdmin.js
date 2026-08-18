// Сводная админ-панель: кто из пользователей ПРЯМО СЕЙЧАС заблокирован от
// подачи заявок и по какой причине — объединяет оба независимых механизма
// блокировки (пропуски в отчётах по людям и пропуски в ГПР, см.
// server/peopleGapsCheck.js и server/gprReportCheck.js — те же проверки,
// что реально применяются к форме заявки/главной странице), чтобы не искать
// это руками по двум разным админ-разделам. Защищено requireAdmin — та же
// граница безопасности, что и у остальных /api/admin/* роутов.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireAdmin } = require('./adminAuth');
const { computeGprReportGaps } = require('./syncGprReport');

const router = express.Router();
router.use(requireAdmin);

function getTodayInAlmaty() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date());
}

// Читаем persisted people_report_gaps (пересчитывается синком/админ-панелью
// /admin/people-gaps), а не пересчитываем "на лету" построчно, как делает
// server/peopleGapsCheck.js для одного email за раз — тот форс-пересинк
// нужен там, чтобы не блокировать реальную подачу заявки устаревшими
// данными, а здесь это обзорная сводка сразу по всем пользователям, для неё
// достаточно той же свежести, что уже видна на /admin/people-gaps.
// report_date < today исключает сегодняшний день — он ещё не закончился,
// отчёт может быть просто пока не подан (та же логика, что в
// computeMissingDates в peopleGapsCheck.js).
router.get('/', (req, res) => {
  const db = getWriteDb();
  const today = getTodayInAlmaty();

  const peopleRules = db.prepare('SELECT DISTINCT email, site FROM people_gap_check_rules').all();
  const gprRules = db.prepare('SELECT DISTINCT email, source_key FROM gpr_report_check_rules').all();
  const emails = [...new Set([...peopleRules.map((r) => r.email), ...gprRules.map((r) => r.email)])];

  const missingDatesForSite = db.prepare(`
    SELECT report_date FROM people_report_gaps
    WHERE site = ? AND status = 'missing' AND report_date < ?
    ORDER BY report_date ASC
  `);

  const { gaps: allGprGaps } = computeGprReportGaps();

  const blockedUsers = [];
  for (const email of emails) {
    const sites = [...new Set(peopleRules.filter((r) => r.email === email).map((r) => r.site))];
    const sourceKeys = [...new Set(gprRules.filter((r) => r.email === email).map((r) => r.source_key))];

    const peopleGaps = sites
      .map((site) => {
        const missingDates = missingDatesForSite.all(site, today).map((r) => r.report_date);
        return missingDates.length ? { site, missingDates } : null;
      })
      .filter(Boolean);

    const gprGaps = allGprGaps.filter((g) => sourceKeys.includes(g.source_key));

    if (peopleGaps.length || gprGaps.length) {
      blockedUsers.push({ email, peopleGaps, gprGaps });
    }
  }

  blockedUsers.sort((a, b) => a.email.localeCompare(b.email));

  res.json({ blockedUsers, today });
});

module.exports = router;
