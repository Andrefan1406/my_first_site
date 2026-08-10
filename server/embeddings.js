// Локальные эмбеддинги через Transformers.js (@xenova/transformers) — модель
// исполняется прямо в этом Node-процессе (ONNX + WASM), без отдельного
// сервиса/Python и без внешнего API — бесплатно и без сетевой зависимости
// в рантайме (сами веса модели, ~113МБ, скачиваются один раз при первом
// использовании и кешируются в node_modules/@xenova/transformers/.cache).
//
// Модель: Xenova/multilingual-e5-small — мультиязычная (в т.ч. русский),
// 384-мерные векторы, легковесная (подходит под скромные ресурсы Render).
// У E5-моделей ОБЯЗАТЕЛЬНО разные префиксы для того, что индексируем
// ("passage: "), и для того, чем ищем ("query: ") — без них релевантность
// заметно хуже, это особенность самой архитектуры/обучения E5, а не опечатка.
const MODEL_NAME = 'Xenova/multilingual-e5-small';
const EMBEDDING_DIM = 384;

let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    // Динамический import(): @xenova/transformers — чистый ESM-пакет,
    // require() в этом иначе целиком CommonJS бэкенде для него не работает.
    extractorPromise = import('@xenova/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', MODEL_NAME)
    );
  }
  return extractorPromise;
}

async function embed(text, { isQuery = false } = {}) {
  const extractor = await getExtractor();
  const prefixed = `${isQuery ? 'query' : 'passage'}: ${text}`;
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Батч эффективнее по времени модели (один forward-pass на несколько
// текстов), чем embed() в цикле — используем при переиндексации после синка
// (см. server/syncDefectActs.js), где за раз может понадобиться посчитать
// сотни строк.
async function embedBatch(texts, { isQuery = false } = {}) {
  if (!texts.length) return [];
  const extractor = await getExtractor();
  const prefixed = texts.map((t) => `${isQuery ? 'query' : 'passage'}: ${t}`);
  const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
  // output.dims = [n, EMBEDDING_DIM] — разрезаем плоский Float32Array на n векторов.
  const [n, dim] = output.dims;
  const vectors = [];
  for (let i = 0; i < n; i++) {
    vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}

module.exports = { embed, embedBatch, EMBEDDING_DIM, MODEL_NAME };
