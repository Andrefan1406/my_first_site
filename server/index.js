// Backend-процесс: прокси для Умной заявки (Ollama Cloud) + text-to-SQL
// чат по заявкам на бетон, по объектам компании и по отчётам о людях на
// участках (SQLite, синхронизируется из Google Sheets — см.
// syncConcrete.js/syncObjects.js/syncPeople.js).
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { callOllama } = require('./ollamaClient');
const { initSchema } = require('./db');
const { startConcreteSync } = require('./syncConcrete');
const { startObjectsSync } = require('./syncObjects');
const { startPeopleSync } = require('./syncPeople');
const { startDefectActsSync } = require('./syncDefectActs');
const { handleChat } = require('./chatHandler');
const peopleGapsAdminRouter = require('./peopleGapsAdmin');
const peopleGapsCheckRouter = require('./peopleGapsCheck');
const concreteDailyReportRouter = require('./concreteDailyReport');
const concreteDashboardRouter = require('./concreteDashboard');
const concreteRequestsBoardRouter = require('./concreteRequestsBoard');
const { router: deviceSessionRouter } = require('./deviceSession');
const adminSessionsRouter = require('./adminSessions');

const app = express();
// Render (как и большинство PaaS) терминирует TLS на своём прокси и шлёт
// реальный IP клиента через X-Forwarded-For — без trust proxy req.ip был бы
// IP-адресом прокси Render, а не пользователя (используется для логирования
// в active_sessions/blocked_login_attempts, см. server/deviceSession.js).
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// /api/session/* пропускаем сюда: у него свой, более узкий CORS с
// конкретным origin + Access-Control-Allow-Credentials (см. sessionCors в
// server/deviceSession.js) — обязателен для httpOnly cookie с device_id.
// Если бы этот middleware обрабатывал OPTIONS и для /api/session/* тоже, он
// отвечал бы на preflight ДО того, как запрос вообще доходил до
// deviceSessionRouter, и browser отклонял бы credentialed-запрос из-за
// Access-Control-Allow-Origin: '*' (спецификация CORS прямо запрещает
// wildcard origin вместе с credentials).
app.use((req, res, next) => {
  if (req.path.startsWith('/api/session')) return next();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
// /api/session/* работает с httpOnly cookie, которая требует конкретный
// origin + Access-Control-Allow-Credentials, а не wildcard '*' (см. sessionCors
// в server/deviceSession.js) — глобальный ACAO:'*' выше тоже отрабатывает
// для этих путей, но deviceSessionRouter перезаписывает заголовки перед
// отправкой ответа, так что итоговые CORS-заголовки — его.
app.use('/api/session', deviceSessionRouter);
app.use('/api/admin/users', adminSessionsRouter);
// Оба роутера смонтированы на одном префиксе — их пути не пересекаются
// (daily-report у одного, options/monthly/unexecuted/chart-titles у
// другого), Express пробует их по очереди и падает в 404 только если ни
// один не совпал.
app.use('/api/concrete-dashboard', concreteDailyReportRouter);
app.use('/api/concrete-dashboard', concreteDashboardRouter);
app.use('/api/concrete-board', concreteRequestsBoardRouter);

initSchema();
startConcreteSync();
startObjectsSync();
startPeopleSync();
startDefectActsSync();

// Render передаёт порт через PORT — слушаем его в первую очередь,
// SMART_REQUEST_PROXY_PORT остаётся для локального оверрайда.
const PORT = process.env.PORT || process.env.SMART_REQUEST_PROXY_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Request proxy listening on http://localhost:${PORT}`);
});
