// Backend-процесс: прокси для Умной заявки (Ollama Cloud) + text-to-SQL
// чат по заявкам на бетон (SQLite, синхронизируется из Google Sheets).
require('dotenv').config();
const express = require('express');
const { callOllama } = require('./ollamaClient');
const { initSchema } = require('./db');
const { startConcreteSync } = require('./syncConcrete');
const { handleChat } = require('./chatHandler');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

initSchema();
startConcreteSync();

const PORT = process.env.SMART_REQUEST_PROXY_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Request proxy listening on http://localhost:${PORT}`);
});
