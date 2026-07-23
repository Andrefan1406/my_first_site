// Общий клиент для Ollama Cloud. Вынесен из index.js, чтобы не дублировать
// fetch+Bearer-ключ между /api/smart-request и новым text-to-SQL чатом.
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = 'gpt-oss:120b-cloud';

// Низкоуровневый вызов: отдаёт статус и сырое тело ответа как есть —
// используется /api/smart-request, который просто проксирует ответ клиенту.
async function callOllama(messages, { format = 'json', temperature = 0, think = false, model = OLLAMA_MODEL } = {}) {
  if (!OLLAMA_API_KEY) {
    const err = new Error('OLLAMA_API_KEY не задан на сервере (.env)');
    err.status = 500;
    throw err;
  }

  const ollamaRes = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OLLAMA_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think,
      format,
      options: { temperature },
    }),
  });

  const bodyText = await ollamaRes.text();
  return { status: ollamaRes.status, bodyText };
}

// Убирает ```json ... ``` обвязку, если модель всё же её добавила.
function extractJson(content) {
  if (!content) return content;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : content).trim();
}

// Высокоуровневый вызов для серверной логики (text-to-SQL): бросает
// исключение на сетевую/HTTP ошибку и возвращает уже распарсенный
// объект из содержимого ответа модели.
async function callOllamaJson(messages, opts) {
  const { status, bodyText } = await callOllama(messages, opts);
  if (status < 200 || status >= 300) {
    const err = new Error(`Ollama Cloud вернул ошибку ${status}: ${bodyText}`);
    err.status = 502;
    throw err;
  }

  let envelope;
  try {
    envelope = JSON.parse(bodyText);
  } catch (e) {
    throw new Error(`Не удалось распарсить ответ Ollama как JSON: ${e.message}`);
  }

  const content = envelope?.message?.content;
  try {
    return JSON.parse(extractJson(content));
  } catch (e) {
    throw new Error(`Ответ модели не является валидным JSON: ${e.message}`);
  }
}

module.exports = { callOllama, callOllamaJson, extractJson, OLLAMA_MODEL };
