// Эмбеддинги через Voyage AI (модель voyage-3.5-lite).
//
// История: сначала считалось локально через @xenova/transformers (ONNX
// multilingual-e5-small) — на Render Starter (512МБ) загрузка модели поверх
// стартовой загрузки всех синков валила процесс по OOM. Перешли на внешний
// сервис. Google Gemini (gemini-embedding-001) не подошёл: бесплатный тариф
// жёстко ограничен ~100 эмбеддингами в сутки, а нам нужно ~3000. У Voyage
// бесплатно 200 млн токенов — для этих данных это фактически бессрочно.
//
// Требуется переменная окружения VOYAGE_API_KEY.
//
// Особенности voyage-3.5-lite:
//   - размерность по умолчанию 1024 (поддерживает 256/512/1024/2048 через
//     output_dimension); векторы уже нормированы, но нормируем ещё раз на
//     всякий случай — коллекции Qdrant на косинусной метрике;
//   - input_type: "query" / "document" — прямой аналог префиксов "query: " /
//     "passage: " у E5: для индексируемого текста и для текста запроса нужны
//     РАЗНЫЕ режимы, иначе релевантность заметно хуже;
//   - до 1000 текстов и ~1 млн токенов на один запрос.
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const MODEL_NAME = process.env.EMBEDDING_MODEL || 'voyage-3.5-lite';
// Значение зашито в схему коллекций Qdrant (server/qdrantClient.js использует
// EMBEDDING_DIM при создании коллекции) — менять только вместе с переиндексацией
// обеих коллекций (rascenki_2026, defect_acts).
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 1024);

const API_URL = 'https://api.voyageai.com/v1/embeddings';
// Сколько текстов шлём в одном HTTP-запросе. Voyage допускает до 1000, но
// держим умеренно — это же размер батча upsert'а в Qdrant.
const MAX_BATCH = Number(process.env.EMBEDDING_MAX_BATCH || 128);
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_MS = 3000;

// Общий на весь процесс троттлинг (переиндексация и эмбеддинг запросов в поиске
// идут через одну очередь). Бесплатный аккаунт Voyage без привязанной карты —
// 3 запроса/мин; с картой (но всё ещё в рамках бесплатных 200 млн токенов) —
// 2000/мин, тогда EMBEDDING_MAX_RPM можно поднять переменной окружения.
const MAX_RPM = Number(process.env.EMBEDDING_MAX_RPM || 3);
const MIN_GAP_MS = Math.ceil(60000 / Math.max(1, MAX_RPM)) + 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let rateGate = Promise.resolve();
let lastCallAt = 0;
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
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY не задан на сервере (.env) — нужен для расчёта эмбеддингов');
  }
}

// Один вызов Voyage на массив текстов. Ретраи на 429 (rate limit) и 5xx —
// при переиндексации за раз уходит несколько батчей подряд.
async function callVoyage(inputs, inputType) {
  assertKey();
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          input: inputs,
          model: MODEL_NAME,
          input_type: inputType, // 'query' | 'document'
          output_dimension: EMBEDDING_DIM,
        }),
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
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      lastErr = new Error(`Voyage API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (attempt < RETRY_ATTEMPTS) {
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : RETRY_BASE_MS * attempt * 2);
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      throw new Error(`Voyage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const json = await res.json();
    // data приходит с полем index — сортируем по нему, чтобы порядок совпал с inputs.
    return json.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => l2normalize(d.embedding));
  }
  throw lastErr;
}

async function embed(text, { isQuery = false } = {}) {
  const [vector] = await callVoyage([String(text)], isQuery ? 'query' : 'document');
  return vector;
}

// Батч — минимум HTTP-вызовов на большой список текстов (см. MAX_BATCH).
// Используется при переиндексации после синка (server/syncDefectActs.js,
// server/syncRascenki.js).
async function embedBatch(texts, { isQuery = false } = {}) {
  if (!texts.length) return [];
  const inputType = isQuery ? 'query' : 'document';
  const vectors = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const chunk = texts.slice(i, i + MAX_BATCH).map((t) => String(t));
    const part = await callVoyage(chunk, inputType);
    vectors.push(...part);
  }
  return vectors;
}

module.exports = { embed, embedBatch, EMBEDDING_DIM, MODEL_NAME };
