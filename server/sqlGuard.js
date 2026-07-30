// Валидация SQL, сгенерированного LLM, перед выполнением.
// Это первый (регулярочный) слой защиты; второй, структурный —
// выполнение только на readonly-соединении (см. db.js getReadDb()),
// он срабатывает даже если этот guard пропустит что-то из-за бага.
class SqlGuardError extends Error {}

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|EXEC|GRANT|REVOKE|TRIGGER)\b/i;

const ALLOWED_TABLES = new Set(['concrete_orders']);
const DEFAULT_LIMIT = 500;

function ensureLimit(sql) {
  if (/\bLIMIT\s+\d+\s*$/i.test(sql)) return sql;
  return `${sql} LIMIT ${DEFAULT_LIMIT}`;
}

// allowedTables — Set с именами таблиц, разрешённых для конкретного домена
// чата (у каждого домена своя SQLite-таблица, см. chatHandler.js).
function assertSafeSelect(sql, allowedTables = ALLOWED_TABLES) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new SqlGuardError('Пустой SQL-запрос');
  }

  const cleaned = sql.trim().replace(/;+\s*$/, '');

  if (/--|\/\*/.test(cleaned)) {
    throw new SqlGuardError('SQL-комментарии запрещены');
  }
  if (cleaned.includes(';')) {
    throw new SqlGuardError('Множественные запросы запрещены');
  }
  if (!/^\s*(WITH|SELECT)\b/i.test(cleaned)) {
    throw new SqlGuardError('Разрешён только SELECT-запрос');
  }
  if (FORBIDDEN_KEYWORDS.test(cleaned)) {
    throw new SqlGuardError('Запрещённое ключевое слово в SQL');
  }

  const tableRefs = [...cleaned.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z_][\w]*)/gi)].map((m) =>
    m[1].toLowerCase()
  );
  if (tableRefs.length === 0) {
    throw new SqlGuardError('Не удалось определить таблицу запроса');
  }
  if (tableRefs.some((t) => !allowedTables.has(t))) {
    throw new SqlGuardError('Запрос ссылается на недопустимую таблицу');
  }

  return ensureLimit(cleaned);
}

module.exports = { assertSafeSelect, ensureLimit, SqlGuardError };
