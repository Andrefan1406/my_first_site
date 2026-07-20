// Прокси-сервер для Умной заявки: браузер не может дёргать https://ollama.com/api/chat
// напрямую (Ollama Cloud не отдаёт CORS-заголовки), поэтому запрос идёт через этот backend.
// Ключ OLLAMA_API_KEY хранится только здесь и никогда не попадает в клиентский бандл.
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = 'gpt-oss:120b-cloud';

app.post('/api/smart-request', async (req, res) => {
  if (!OLLAMA_API_KEY) {
    return res.status(500).json({ error: 'OLLAMA_API_KEY не задан на сервере (.env)' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Ожидается тело { messages: [...] }' });
  }

  try {
    const ollamaRes = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        think: false,
        format: 'json',
        options: { temperature: 0 },
      }),
    });

    const bodyText = await ollamaRes.text();
    res.status(ollamaRes.status).setHeader('Content-Type', 'application/json').send(bodyText);
  } catch (err) {
    res.status(502).json({ error: 'Не удалось связаться с Ollama Cloud: ' + err.message });
  }
});

const PORT = process.env.SMART_REQUEST_PROXY_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Smart Request proxy listening on http://localhost:${PORT}`);
});
