// Одноразовый фикс: до этого коммита геокодер (routeEstimate.js) искал
// адреса по всему миру без привязки к городу. Одинаковые названия улиц
// встречаются в разных городах Казахстана (например, "Крылова" есть и в
// Усть-Каменогорске, и в Алматы) — Nominatim иногда выбирал не тот город,
// и уже посчитанный маршрут "разъезжался" на сотни-тысячи км вместо пары
// километров внутри города (видно было как "≈ 2154.9 км, 54 ч" на обычной
// внутригородской заявке). Геокодер теперь ограничен окрестностями
// Усть-Каменогорска — но старый geocode_cache и уже сохранённые в заявках
// координаты/оценки этим фиксом сами не исправляются. Чистим и
// пересчитываем один раз при первом запуске после фикса.
//
// Гейт — PRAGMA user_version на БД (rides/data/db.sqlite): 0 = ещё не
// чинили, 1 = почищено. Безопасно вызывать на каждом старте — при
// user_version >= 1 функция ничего не делает.
const { getWriteDb } = require('./db');
const { recomputeRequestEstimate } = require('./routeEstimate');

const FIX_VERSION = 1;

async function runGeocodeRegionBugFix() {
  const db = getWriteDb();
  const current = db.pragma('user_version', { simple: true });
  if (current >= FIX_VERSION) return;

  console.log('[rides] одноразовая чистка: старый гео-кэш мог резолвить улицы не в тот город');
  db.exec('DELETE FROM geocode_cache');

  // merged_into IS NULL — заявки, влитые в чужой маршрут при объединении
  // (П.6), пересчитывать смысла нет: их точки уже часть маршрута "несущей"
  // заявки, а свою собственную оценку они не используют.
  const rows = db
    .prepare(
      `SELECT id FROM requests
        WHERE status IN ('pending_assignment', 'assigned', 'in_progress') AND merged_into IS NULL`
    )
    .all();

  let fixed = 0;
  for (const { id } of rows) {
    try {
      await recomputeRequestEstimate(id, { actorUserId: null });
      fixed++;
    } catch (err) {
      console.error(`[rides] не удалось пересчитать заявку #${id} при чистке гео-кэша:`, err.message);
    }
  }

  db.pragma(`user_version = ${FIX_VERSION}`);
  console.log(`[rides] чистка гео-кэша завершена: пересчитано заявок ${fixed}/${rows.length}`);
}

module.exports = { runGeocodeRegionBugFix };
