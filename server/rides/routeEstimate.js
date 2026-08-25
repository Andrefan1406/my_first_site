// Оценка расстояния/времени в пути: сначала геокодируем каждый
// адрес (Nominatim), затем строим маршрут через публичный демо-сервер
// OSRM. Оба — бесплатные OSM-сервисы без API-ключа, но по их же политике
// использования расcчитаны на некоммерческую/невысокую нагрузку (см.
// https://operations.osmfoundation.org/policies/nominatim/,
// https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server) — для
// внутреннего корпоративного инструмента с редкими запросами (одна заявка
// = один расчёт при подаче) этого достаточно; при росте трафика нужен свой
// инстанс или платный провайдер (см. про 2ГИС в server/rides/README.md).
// Ошибка на любом шаге (адрес не нашёлся, сервис недоступен) не должна
// ронять создание заявки — просто возвращаем null, расстояние/время
// останутся неизвестны.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

async function geocode(address) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=jsonv2&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'my-first-site-rides/1.0' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// addresses — от точки подачи до последнего пункта назначения, по
// порядку. withReturn достраивает маршрут обратно к первой точке тем же
// путём в обратном порядке — грубая оценка "туда и обратно", не
// оптимальный отдельный обратный маршрут.
async function estimateRoute(addresses, withReturn) {
  try {
    const geocoded = {};
    for (const addr of new Set(addresses)) {
      geocoded[addr] = await geocode(addr);
    }
    const points = addresses.map((a) => geocoded[a]).filter(Boolean);
    if (points.length < 2) return null;

    const routePoints = withReturn ? points.concat([...points].reverse().slice(1)) : points;
    const coordsParam = routePoints.map((p) => `${p.lon},${p.lat}`).join(';');
    const res = await fetch(`${OSRM_URL}/${coordsParam}?overview=false`);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes && data.routes[0];
    if (!route) return null;

    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
    };
  } catch (err) {
    return null;
  }
}

module.exports = { estimateRoute };
