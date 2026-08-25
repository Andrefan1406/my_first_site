// Backend-процесс: прокси для Умной заявки (Ollama Cloud) + text-to-SQL
// чат по заявкам на бетон, по объектам компании и по отчётам о людях на
// участках (SQLite, синхронизируется из Google Sheets — см.
// syncConcrete.js/syncObjects.js/syncPeople.js).
require('dotenv').config();
const express = require('express');
const http = require('http');
const { callOllama } = require('./ollamaClient');
const { initSchema } = require('./db');
const { startConcreteSync } = require('./syncConcrete');
const { startObjectsSync } = require('./syncObjects');
const { startPeopleSync } = require('./syncPeople');
const { startDefectActsSync } = require('./syncDefectActs');
const { startGprReportSync } = require('./syncGprReport');
const { handleChat } = require('./chatHandler');
const peopleGapsAdminRouter = require('./peopleGapsAdmin');
const peopleGapsCheckRouter = require('./peopleGapsCheck');
const gprReportAdminRouter = require('./gprReportAdmin');
const gprReportCheckRouter = require('./gprReportCheck');
const blockedUsersAdminRouter = require('./blockedUsersAdmin');
const concreteDailyReportRouter = require('./concreteDailyReport');
const concreteDashboardRouter = require('./concreteDashboard');
const concreteRequestsBoardRouter = require('./concreteRequestsBoard');
// Система служебного транспорта (заявки на поездки) — см. server/rides/.
// Отдельный SQLite-файл и своё Socket.io поверх того же HTTP-сервера
// (нужен http.createServer вместо app.listen, чтобы Socket.io и Express
// слушали один и тот же порт).
const { initSchema: initRidesSchema } = require('./rides/db');
const ridesUsersRouter = require('./rides/usersRouter');
const ridesVehiclesRouter = require('./rides/vehiclesRouter');
const ridesDriversRouter = require('./rides/driversRouter');
const ridesRequestsRouter = require('./rides/requestsRouter');
const { initSocket } = require('./rides/socket');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // PATCH/PUT добавлены для server/rides/* (смена статуса водителя,
  // CRUD машин/водителей, назначение ролей) — раньше в списке их не было,
  // из-за чего браузер резал такие запросы ещё на CORS-preflight, до
  // отправки на сервер ("Failed to fetch" на клиенте).
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => res.status(200).send('ok'));

app.post('/api/smart-request', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Ожидается тело { messages: [...] }' });
  }

  try {
    const { status, bodyText } = await callOllama(messages);
    res.status(status).setHeader('Content-Type', 'application/json').send(bodyText);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Не удалось связаться с Ollama Cloud' });
  }
});

app.post('/api/chat', handleChat);
app.use('/api/admin/people-gaps', peopleGapsAdminRouter);
app.use('/api/people-gaps', peopleGapsCheckRouter);
app.use('/api/admin/gpr-report', gprReportAdminRouter);
app.use('/api/gpr-report', gprReportCheckRouter);
app.use('/api/admin/blocked-users', blockedUsersAdminRouter);
// Оба роутера смонтированы на одном префиксе — их пути не пересекаются
// (daily-report у одного, options/monthly/unexecuted/chart-titles у
// другого), Express пробует их по очереди и падает в 404 только если ни
// один не совпал.
app.use('/api/concrete-dashboard', concreteDailyReportRouter);
app.use('/api/concrete-dashboard', concreteDashboardRouter);
app.use('/api/concrete-board', concreteRequestsBoardRouter);
app.use('/api/v1/users', ridesUsersRouter);
app.use('/api/v1/vehicles', ridesVehiclesRouter);
app.use('/api/v1/drivers', ridesDriversRouter);
app.use('/api/v1/requests', ridesRequestsRouter);

initSchema();
initRidesSchema();
startConcreteSync();
startObjectsSync();
startPeopleSync();
startDefectActsSync();
startGprReportSync();

const server = http.createServer(app);
initSocket(server);

// Render передаёт порт через PORT — слушаем его в первую очередь,
// SMART_REQUEST_PROXY_PORT остаётся для локального оверрайда.
const PORT = process.env.PORT || process.env.SMART_REQUEST_PROXY_PORT || 4000;
server.listen(PORT, () => {
  console.log(`Smart Request proxy listening on http://localhost:${PORT}`);
});
