// Маршрут заявки — from, to и произвольное число доп. пунктов (r.stops) —
// собирается в одну строку одинаково на всех трёх страницах (сотрудник/
// водитель/диспетчер), поэтому вынесен сюда, а не продублирован трижды.
export function formatRoute(r) {
  return [r.fromAddress, r.toAddress, ...(r.stops || [])].join(" → ");
}

// distanceKm/durationMin — null, если геокодер/роутер не смогли определить
// хотя бы одну из точек (см. server/rides/routeEstimate.js) — в этом
// случае просто не показываем оценку, а не "0 км, 0 мин".
export function formatEstimate(r) {
  if (r.distanceKm == null || r.durationMin == null) return null;
  const hours = Math.floor(r.durationMin / 60);
  const minutes = r.durationMin % 60;
  const time = hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  return `≈ ${r.distanceKm} км, ${time}`;
}
