// Публичная (без requireAdmin) проверка: заблокирован ли email из-за
// незакрытого пропуска в ГПР (позиция 64, см. computeGprReportGaps в
// syncGprReport.js) — тот же принцип, что и server/peopleGapsCheck.js, но
// список проверяемых email тут без привязки к участку (gpr_report_check_rules
// вместо people_gap_check_rules, см. server/db.js), поскольку отслеживаемая
// позиция сейчас всегда одна. Для email без правил просто возвращает
// blocked:false — проверка прозрачна для всех остальных пользователей.
const express = require('express');
const { getWriteDb } = require('./db');
const { computeGprReportGaps } = require('./syncGprReport');

const router = express.Router();

router.get('/check', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Параметр email обязателен' });
  }

  const rule = getWriteDb()
    .prepare('SELECT 1 FROM gpr_report_check_rules WHERE email = ?')
    .get(email.trim().toLowerCase());

  // Нет правила для этого email — проверка на него не распространяется.
  if (!rule) {
    return res.json({ blocked: false, gaps: [] });
  }

  const { gaps } = computeGprReportGaps();
  res.json({ blocked: gaps.length > 0, gaps });
});

module.exports = router;
