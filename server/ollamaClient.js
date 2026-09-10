// Общий клиент для Ollama Cloud. Вынесен из index.js, чтобы не дублировать
// fetch+Bearer-ключ между /api/smart-request и новым text-to-SQL чатом.
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = 'gpt-oss:120b-cloud';
// Ollama Cloud (ollama.com) периодически подвисает или обрывает соединение
// без ответа. У fetch в Node таймаута нет — без него запрос к /api/chat
// висит бесконечно, а вместе с ним и вкладка чата. Жёсткий потолок на один
// вызов; подстроить через OLLAMA_TIMEOUT_MS.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 60000);

// Низкоуровневый вызов: отдаёт статус и сырое тело ответа как есть —
// используется /api/smart-request, который просто проксирует ответ клиенту.
async function callOllama(messages, { format = 'json', temperature = 0, think = false, model = OLLAMA_MODEL } = {}) {
  if (!OLLAMA_API_KEY) {
    const err = new Error('OLLAMA_API_KEY не задан на сервере (.env)');
    err.status = 500;
    throw err;
  }

  let ollamaRes;
  try {
    ollamaRes = await fetch('https://ollama.com/api/chat', {
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
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (err) {
    const e = new Error(
      err.name === 'TimeoutError'
        ? `Ollama Cloud не ответил за ${Math.round(OLLAMA_TIMEOUT_MS / 1000)} с`
        : `Не удалось связаться с Ollama Cloud: ${err.message}`
    );
    e.status = 504;
    throw e;
  }

  const bodyText = await ollamaRes.text();
  return { status: ollamaRes.status, bodyText };
}

// Убирает ```json ... ``` обвязку, если модель всё же её добавила.
function extractJson(content) {
  if (!content) return content;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : content).trim();
}

const LOAD_RETRY_ATTEMPTS = 3;
const LOAD_RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Высокоуровневый вызов для серверной логики (text-to-SQL): бросает
// исключение на сетевую/HTTP ошибку и возвращает уже распарсенный
// объект из содержимого ответа модели.
//
// Ollama Cloud иногда отвечает 200 с пустым content и done_reason "load" —
// модель ещё прогревается и не сгенерировала ничего, вместо того чтобы
// дождаться и отдать реальный ответ. Ретраим несколько раз с паузой, прежде
// чем сдаться.
async function callOllamaJson(messages, opts) {
  let lastLoadError;

  for (let attempt = 1; attempt <= LOAD_RETRY_ATTEMPTS; attempt++) {
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

    if (!content && envelope?.done_reason === 'load') {
      lastLoadError = new Error('Ollama Cloud: модель ещё прогревается (done_reason=load), пустой ответ');
      if (attempt < LOAD_RETRY_ATTEMPTS) {
        await sleep(LOAD_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw lastLoadError;
    }

    try {
      return JSON.parse(extractJson(content));
    } catch (e) {
      throw new Error(`Ответ модели не является валидным JSON: ${e.message}`);
    }
  }

  throw lastLoadError;
}

module.exports = { callOllama, callOllamaJson, extractJson, OLLAMA_MODEL };
