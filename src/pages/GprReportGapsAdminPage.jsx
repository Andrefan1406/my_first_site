// Админ-страница пропусков в еженедельном % готовности ГПР (позиция 64) —
// упрощённый аналог /admin/people-gaps: здесь только ОБНАРУЖЕНИЕ пропусков
// (нет workflow "принять решение", как у людей — это чисто отчёт для
// администратора, кто забыл занести % за прошлую пятницу или раньше).
// Пропуск = конструктив, у которого была хотя бы одна заполненная неделя
// раньше (значит работа реально идёт), но после последней заполненной
// недели и вплоть до контрольной пятницы остались пустые ячейки — см.
// server/syncGprReport.js:computeGprReportGaps.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";

async function getIdToken() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Не авторизован");
  return user.getIdToken();
}

async function apiFetch(path, options = {}) {
  const token = await getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);
  return data;
}

const formatDate = (isoDate) => {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
};

const formatPercent = (value) =>
  value === null || value === undefined ? "—" : `${Math.round(value * 10) / 10}%`;

const GprReportGapsAdminPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resyncLoading, setResyncLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch("/api/admin/gpr-report/gaps");
      setData(result);
    } catch (err) {
      setError(err.message || "Не удалось загрузить пропуски ГПР");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResync = async () => {
    setResyncLoading(true);
    setError("");
    try {
      await apiFetch("/api/admin/gpr-report/resync", { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message || "Не удалось пересинхронизировать ГПР");
    } finally {
      setResyncLoading(false);
    }
  };

  const gaps = data?.gaps || [];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/admin")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Пропуски в отчётах ГПР — позиция 64</h1>
      </div>

      <div style={s.cards}>
        <div style={s.card}>
          <div style={s.cardLabel}>Конструктивов с пропуском</div>
          <div style={{ ...s.cardValue, color: gaps.length ? "#c0392b" : "#1a7f37" }}>{gaps.length}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Контрольная дата (последняя пятница)</div>
          <div style={s.cardValue}>{data ? formatDate(data.cutoff) : "—"}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Последний синк</div>
          <div style={s.cardValueSmall}>
            {data?.last_synced_at ? data.last_synced_at.replace("T", " ").slice(0, 16) : "—"}
          </div>
        </div>
      </div>

      <div style={s.actions}>
        <button onClick={load} disabled={loading}>Обновить</button>
        <button
          onClick={handleResync}
          disabled={resyncLoading}
          title="Заново скачать ГПР из Google Таблицы, не дожидаясь планового синка (раз в 6 часов)"
          style={s.resyncBtn}
        >
          {resyncLoading ? "Синхронизирую..." : "⟳ Пересинхронизировать"}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <p>Загрузка...</p>
      ) : gaps.length === 0 ? (
        <p style={s.muted}>
          Пропусков нет — все конструктивы позиции 64 заполнены по {data ? formatDate(data.cutoff) : "…"} включительно.
        </p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Конструктив</th>
              <th style={s.th}>Последнее заполнение</th>
              <th style={s.th}>Пропущено недель</th>
              <th style={s.th}>Пропущенные даты</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={g.work_name}>
                <td style={s.td}>{g.work_name}</td>
                <td style={s.td}>
                  {formatDate(g.last_filled_date)} ({formatPercent(g.last_filled_percent)})
                </td>
                <td style={{ ...s.td, ...s.tdCenter, color: "#c0392b", fontWeight: 600 }}>
                  {g.missing_dates.length}
                </td>
                <td style={s.td}>{g.missing_dates.map(formatDate).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "1000px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" },
  back: { background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },
  title: { margin: 0, fontSize: "22px" },

  cards: { display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" },
  card: { background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  cardLabel: { fontSize: "12px", color: "#888", marginBottom: "6px" },
  cardValue: { fontSize: "24px", fontWeight: 700 },
  cardValueSmall: { fontSize: "14px", fontWeight: 600, color: "#444" },

  actions: { display: "flex", gap: "10px", marginBottom: "16px" },
  resyncBtn: { background: "#17a2b8", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "14px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa" },
  td: { padding: "10px", borderBottom: "1px solid #eee", verticalAlign: "top" },
  tdCenter: { textAlign: "center" },
};

export default GprReportGapsAdminPage;
