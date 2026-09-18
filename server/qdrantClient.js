// Обёртка над Qdrant Cloud для семантического (RAG) поиска по свободному
// тексту дефектных актов (описание/заключение/причина/примечание — см.
// server/embeddings.js для самих векторов). Один кластер — несколько
// коллекций, по одной на домен (сейчас только defect_acts), тот же принцип,
// что и одна SQLite-база на несколько таблиц.
const { QdrantClient } = require('@qdrant/js-client-rest');
const { EMBEDDING_DIM } = require('./embeddings');

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

let client = null;
function getClient() {
  if (!client) {
    if (!QDRANT_URL || !QDRANT_API_KEY) {
      throw new Error('QDRANT_URL/QDRANT_API_KEY не заданы на сервере (.env)');
    }
    // port: 443 — без этого клиент по умолчанию подставляет 6333 (порт
    // self-hosted Qdrant), а не парсит его из URL, если он явно не указан
    // в самом URL. Qdrant Cloud слушает REST API на стандартном HTTPS 443.
    // timeout — чтобы недоступный/уснувший кластер отдавал ошибку, а не
    // держал запрос чата бесконечно (подстроить через QDRANT_TIMEOUT_MS).
    client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
      port: 443,
      timeout: Number(process.env.QDRANT_TIMEOUT_MS || 20000),
    });
  }
  return client;
}

const ensuredCollections = new Set();

// Есть ли коллекция и сколько в ней точек — для доменов поиска, чтобы
// отвечать «нужна переиндексация» вместо падения/зависания, когда индекс
// пуст или ещё не создан (см. server/rascenkiSearch.js).
async function collectionStats(name) {
  try {
    const info = await getClient().getCollection(name);
    return { exists: true, pointsCount: info.points_count ?? 0 };
  } catch (err) {
    return { exists: false, pointsCount: 0 };
  }
}

// Идемпотентно — создаёт коллекцию, только если её ещё нет. Вызывается
// перед upsert/search, поэтому не нужен отдельный шаг миграции/деплоя.
async function ensureCollection(name) {
  if (ensuredCollections.has(name)) return;
  const qdrant = getClient();
  const exists = await qdrant.collectionExists(name);
  if (!exists.exists) {
    await qdrant.createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });
  }
  ensuredCollections.add(name);
}

// points: [{ id, vector, payload }, ...] — id должен быть числом или UUID
// (используем числовой id строки из SQLite, он и так стабилен между синками
// в рамках одного набора данных).
async function upsertPoints(collection, points) {
  if (!points.length) return;
  await ensureCollection(collection);
  await getClient().upsert(collection, { wait: true, points });
}

// Возвращает top-K точек (payload + score) по вектору запроса.
async function searchSimilar(collection, vector, { limit = 8, filter } = {}) {
  await ensureCollection(collection);
  const result = await getClient().query(collection, {
    query: vector,
    limit,
    filter,
    with_payload: true,
  });
  return result.points || [];
}

async function deletePoints(collection, ids) {
  if (!ids.length) return;
  await ensureCollection(collection);
  await getClient().delete(collection, { wait: true, points: ids });
}

module.exports = { getClient, ensureCollection, collectionStats, upsertPoints, searchSimilar, deletePoints };
