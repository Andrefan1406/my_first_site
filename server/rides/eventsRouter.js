// /api/v1/events — журнал событий по заявкам для диспетчера и главного
// админа сайта. Только чтение: сами события пишутся из
// requestsRouter/routeEstimate через logEvent (см. server/rides/events.js).
// Выгрузку в Excel фронт делает у себя (XLSX уже подключён на клиенте для
// других отчётов) — здесь отдаём только JSON.
const express = require('express');
const { getWriteDb } = require('./db');
const { requireRoleOrSiteAdmin } = require('./auth');
const { listEvents, EVENT_TYPES } = require('./events');

const router = express.Router();

// GET /api/v1/events?requestId=&type=&from=&to=&limit=&offset=
router.get('/', requireRoleOrSiteAdmin('dispatcher'), (req, res) => {
  const db = getWriteDb();
  const { requestId, type, from, to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const offset = Number(req.query.offset) || 0;
  const events = listEvents(db, { requestId, type, from, to, limit, offset });
  res.json({ events, eventTypes: EVENT_TYPES });
});

module.exports = router;
