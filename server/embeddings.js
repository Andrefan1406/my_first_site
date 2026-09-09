// Эмбеддинги через Google Gemini API (модель gemini-embedding-001).
//
// Раньше эмбеддинги считались локально в этом же процессе через
// @xenova/transformers (ONNX-модель multilingual-e5-small, ~113МБ весов + WASM-
// рантайм). На Render Starter (512МБ / ~256МБ heap у Node) загрузка модели
// поверх стартовой пакетной загрузки всех синков (people ~131k строк, gpr
// ~150k, concrete ~11k) валила процесс по OOM. Вынос расчёта во внешний сервис
// эту нагрузку с инстанса снимает полностью.
//
// Требуется переменная окружения GEMINI_API_KEY (тот же ключ Google AI Studio,
// что уже используется в проекте).
//
// Особенности gemini-embedding-001:
//   - при outputDimensionality != 3072 векторы НЕ нормированы — нормируем сами
//     (L2), т.к. коллекции Qdrant используют косинусную метрику;
//   - taskType RETRIEVAL_QUERY / RETRIEVAL_DOCUMENT — прямой аналог префиксов
//     "query: " / "passage: " у E5: для индексируемого текста и для текста
//     запроса нужны РАЗНЫЕ режимы, иначе релевантность заметно хуже.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
// 768 — компромисс размер/качество (по умолчанию модель отдаёт 3072). Значение
// зашито в схему коллекций Qdrant (server/qdrantClient.js использует
// EMBEDDING_DIM при создании коллекции) — менять только вместе с переиндексацией.
const EMBEDDING_DIM = 768;

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// batchEmbedContents допускает до 100 запросов за вызов.
const MAX_BATCH = 100;
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS = 4000;

// Бесплатный тариф Gemini для gemini-embedding-001 — порядка 5 запросов/мин.
// Переиндексация свода/актов шлёт десятки батчей подряд и без паузы мгновенно
// ловит 429. Держим минимальный интервал между ЛЮБЫМИ вызовами API (общий на
// весь процесс — и переиндексация, и эмбеддинг запросов в поиске идут через
// одну очередь). На платном тарифе лимит поднять через EMBEDDING_MAX_RPM.
const MAX_RPM = Number(process.env.EMBEDDING_MAX_RPM || 5);
const MIN_GAP_MS = Math.ceil(60000 / Math.max(1, MAX_RPM)) + 300;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let rateGate = Promise.resolve();
let lastCallAt = 0;
// Последовательная очередь: каждый вызов ждёт, пока с момента предыдущего
// пройдёт MIN_GAP_MS.
function throttle() {
  rateGate = rateGate.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  return rateGate;
}

function l2normalize(vec) {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((x) => x / norm);
}

function assertKey() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY не задан на сервере (.env) — нужен для расчёта эмбеддингов');
  }
}

// Ретраи только на 429 (rate limit) и 5xx — при индексации свода/актов за раз
// уходят десятки батчей, в бесплатном тарифе Gemini можно упереться в лимит.
async function callGemini(path, body) {
  assertKey();
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(`${API_BASE}/${path}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt);
        continue;
      }
      throw err;
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_MS * attempt * 2);
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }
  throw lastErr;
}

const taskTypeFor = (isQuery) => (isQuery ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT');

async function embed(text, { isQuery = false } = {}) {
  const json = await callGemini(`models/${MODEL_NAME}:embedContent`, {
    content: { parts: [{ text: String(text) }] },
    taskType: taskTypeFor(isQuery),
    outputDimensionality: EMBEDDING_DIM,
  });
  return l2normalize(json.embedding.values);
}

// Батч — один HTTP-вызов на несколько текстов (см. MAX_BATCH). Используется при
// переиндексации после синка (server/syncDefectActs.js, server/syncRascenki.js).
async function embedBatch(texts, { isQuery = false } = {}) {
  if (!texts.length) return [];
  const taskType = taskTypeFor(isQuery);
  const vectors = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const chunk = texts.slice(i, i + MAX_BATCH);
    const json = await callGemini(`models/${MODEL_NAME}:batchEmbedContents`, {
      requests: chunk.map((t) => ({
        model: `models/${MODEL_NAME}`,
        content: { parts: [{ text: String(t) }] },
        taskType,
        outputDimensionality: EMBEDDING_DIM,
      })),
    });
    for (const e of json.embeddings) vectors.push(l2normalize(e.values));
  }
  return vectors;
}

module.exports = { embed, embedBatch, EMBEDDING_DIM, MODEL_NAME };
