// Модалка выбора адреса кликом по карте — OpenStreetMap-тайлы (бесплатно,
// без API-ключа) + обратное геокодирование через Nominatim (тоже
// бесплатный сервис OSM). Клик ставит маркер и подтягивает человекочитаемый
// адрес в поле; поле остаётся редактируемым вручную — геокодер иногда
// путает/переводит название, и водителю важнее ясный адрес, чем точный
// официальный.
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Стандартный фикс для CRA/webpack: без него иконка маркера ищет
// картинки по относительному пути от CSS и не находит их через бандлер.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const DEFAULT_CENTER = [43.238949, 76.889709]; // Алматы — стартовая точка карты по умолчанию

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru`
  );
  if (!res.ok) throw new Error("geocoding failed");
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function MapPicker({ onSelect, onClose }) {
  const mapDivRef = useRef(null);
  const markerRef = useRef(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const map = L.map(mapDivRef.current).setView(DEFAULT_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", async (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else markerRef.current = L.marker(e.latlng).addTo(map);

      setLoading(true);
      setError("");
      try {
        setAddress(await reverseGeocode(lat, lng));
      } catch (err) {
        setError("Не удалось определить адрес по точке — впишите вручную");
      } finally {
        setLoading(false);
      }
    });

    // Модалка может открыться в контейнере с ещё не финализированной
    // раскладкой (0 высоты в момент монтирования) — без этого карта иногда
    // рендерится обрезанной/серой, пока пользователь не подвигает окно.
    setTimeout(() => map.invalidateSize(), 100);

    return () => map.remove();
  }, []);

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Выберите точку на карте</h3>
        <div ref={mapDivRef} style={s.map} />
        {error && <div style={s.error}>{error}</div>}
        <label style={s.label}>
          Адрес
          <input
            style={s.input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={loading ? "Определяем адрес..." : "Кликните на карту или впишите вручную"}
          />
        </label>
        <div style={s.actions}>
          <button type="button" style={s.secondaryButton} onClick={onClose}>Отмена</button>
          <button
            type="button"
            style={s.primaryButton}
            disabled={!address.trim()}
            onClick={() => onSelect(address.trim())}
          >
            Использовать этот адрес
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modal: { background: "#fff", borderRadius: "10px", padding: "16px", width: "560px", maxWidth: "90vw" },
  map: { height: "320px", borderRadius: "8px", marginBottom: "10px" },
  label: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#444" },
  input: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", width: "100%", boxSizing: "border-box" },
  error: { background: "#fff0f0", color: "#c00", borderRadius: "6px", padding: "6px 10px", marginBottom: "8px", fontSize: "12px" },
  actions: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" },
  primaryButton: { background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  secondaryButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },
};
