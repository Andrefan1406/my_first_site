// Публичная (без requireAdmin) проверка: заблокирован ли email из-за
// незакрытого пропуска в ГПР — тот же принцип, что и
// server/peopleGapsCheck.js, но список проверяемых email тут без привязки к
// участку (gpr_report_check_rules вместо people_gap_check_rules, см.
// server/db.js). Правило привязано к КОНКРЕТНОМУ источнику (source_key —
// 'poz64_72' | 'nz3', см. SOURCES в syncGprReport.js), потому что за разные
// листы ГПР отвечают разные люди — email проверяется только по тем
// источникам, на которые у него есть правило, а не по всем сразу. Для email
// без правил просто возвращает blocked:false — проверка прозрачна для всех
// остальных пользователей.
const express = require('express');
const { getWriteDb } = require('./db');
const { computeGprReportGaps } = require('./syncGprReport');

const router = express.Router();

router.get('/check', (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Параметр email обязателен' });
  }

  const sourceKeys = getWriteDb()
    .prepare('SELECT source_key FROM gpr_report_check_rules WHERE email = ?')
    .all(email.trim().toLowerCase())
    .map((r) => r.source_key);

  // Нет ни одного правила для этого email — проверка на него не распространяется.
  if (!sourceKeys.length) {
    return res.json({ blocked: false, gaps: [] });
  }

  const { gaps: allGaps } = computeGprReportGaps();
  const gaps = allGaps.filter((g) => sourceKeys.includes(g.source_key));
  res.json({ blocked: gaps.length > 0, gaps });
});

module.exports = router;
