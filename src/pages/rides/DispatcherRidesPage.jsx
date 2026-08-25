// Панель диспетчера — минимальное участие: диспетчер только наблюдает за
// пулом (заявки, которые водители разбирают сами, не требуют от него
// никаких действий), подсвечивает "зависшие" заявки и может либо назначить
// конкретного водителя вручную (исключение, не основной сценарий), либо
// отменить заявку.
import React, { useCallback, useEffect, useState } from "react";
import { ridesApiFetch, ridesApiPost } from "../../rides/api";
import { createRidesSocket } from "../../rides/socket";
import LogoutButton from "../../rides/LogoutButton";
import { formatRoute, formatEstimate } from "../../rides/format";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL = {
  pending_assignment: "В пуле",
  assigned: "Назначен",
  in_progress: "В пути",
  completed: "Завершён",
  cancelled: "Отменён",
};

export default function DispatcherRidesPage() {
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignTarget, setAssignTarget] = useState(null); // requestId, открытая форма назначения
  const [selectedDriverId, setSelectedDriverId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { requests: rows, summary: sum } = await ridesApiFetch("/api/v1/requests");
      setRequests(rows);
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = createRidesSocket();
    const upsert = (req) => setRequests((prev) => {
      const exists = prev.some((r) => r.id === req.id);
      return exists ? prev.map((r) => (r.id === req.id ? req : r)) : [req, ...prev];
    });
    socket.on("request:new", upsert);
    socket.on("request:updated", upsert);
    socket.on("connect_error", () => {});
    return () => socket.disconnect();
  }, []);

  // Пересчёт сводки на клиенте при любом изменении списка — не ждём
  // отдельного запроса, значения и так уже есть в requests.
  useEffect(() => {
    setSummary((prev) => ({
      ...prev,
      pending: requests.filter((r) => r.status === "pending_assignment").length,
      assigned: requests.filter((r) => r.status === "assigned").length,
      inProgress: requests.filter((r) => r.status === "in_progress").length,
    }));
  }, [requests]);

  const openAssign = async (requestId) => {
    setError("");
    setAssignTarget(requestId);
    setSelectedDriverId("");
    try {
      const { drivers } = await ridesApiFetch("/api/v1/drivers/available");
      setAvailableDrivers(drivers);
    } catch (err) {
      setError(err.message || "Не удалось загрузить список свободных водителей");
    }
  };

  const confirmAssign = async () => {
    if (!selectedDriverId) return;
    try {
      const { request } = await ridesApiPost(`/api/v1/requests/${assignTarget}/assign`, { driverId: Number(selectedDriverId) });
      setRequests((prev) => prev.map((r) => (r.id === request.id ? request : r)));
      setAssignTarget(null);
    } catch (err) {
      setError(err.message || "Не удалось назначить водителя");
    }
  };

  const cancelRequest = async (id) => {
    const reason = window.prompt("Причина отмены (необязательно):") || "";
    try {
      const { request } = await ridesApiPost(`/api/v1/requests/${id}/cancel`, { reason });
      setRequests((prev) => prev.map((r) => (r.id === request.id ? request : r)));
    } catch (err) {
      setError(err.message || "Не удалось отменить заявку");
    }
  };

  if (loading) return <div style={{ padding: 30 }}>Загрузка...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Мониторинг заявок</h1>
        <LogoutButton />
      </div>
      {error && <div style={s.error}>{error}</div>}

      <div style={s.cards}>
        <div style={s.card}><div style={s.cardLabel}>В пуле без водителя</div><div style={s.cardValue}>{summary?.pending ?? 0}</div></div>
        <div style={s.card}><div style={s.cardLabel}>Назначено</div><div style={s.cardValue}>{summary?.assigned ?? 0}</div></div>
        <div style={s.card}><div style={s.cardLabel}>В пути</div><div style={s.cardValue}>{summary?.inProgress ?? 0}</div></div>
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Время</th>
            <th style={s.th}>Маршрут</th>
            <th style={s.th}>≈ км / мин</th>
            <th style={s.th}>Заказчик</th>
            <th style={s.th}>Статус</th>
            <th style={s.th}>Водитель</th>
            <th style={s.th}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} style={r.isStale ? s.staleRow : undefined}>
              <td style={s.td}>{formatDateTime(r.requestedAt)}</td>
              <td style={s.td}>{formatRoute(r)}{r.withReturn && <span style={s.returnBadge}> (туда-обратно)</span>}</td>
              <td style={s.td}>{formatEstimate(r) || "—"}</td>
              <td style={s.td}>{r.employeeName}</td>
              <td style={s.td}>
                {STATUS_LABEL[r.status] || r.status}
                {r.isStale && <span style={s.staleBadge}>висит &gt; {summary?.staleThresholdMinutes ?? 15} мин</span>}
              </td>
              <td style={s.td}>{r.driverName ? `${r.driverName}${r.vehiclePlate ? ` (${r.vehiclePlate})` : ""}` : "—"}</td>
              <td style={s.td}>
                {r.status === "pending_assignment" && (
                  <button style={s.secondaryButton} onClick={() => openAssign(r.id)}>Назначить</button>
                )}
                {["pending_assignment", "assigned"].includes(r.status) && (
                  <button style={s.dangerButton} onClick={() => cancelRequest(r.id)}>Отменить</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {assignTarget && (
        <div style={s.modalOverlay} onClick={() => setAssignTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Назначить водителя на заявку #{assignTarget}</h3>
            {availableDrivers.length === 0 ? (
              <p style={s.muted}>Свободных водителей сейчас нет.</p>
            ) : (
              <select style={s.input} value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
                <option value="">Выберите водителя</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.vehiclePlate ? ` — ${d.vehiclePlate}` : ""}</option>
                ))}
              </select>
            )}
            <div style={s.modalActions}>
              <button style={s.secondaryButton} onClick={() => setAssignTarget(null)}>Отмена</button>
              <button style={s.primaryButton} disabled={!selectedDriverId} onClick={confirmAssign}>Назначить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "1100px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
  title: { fontSize: "22px", margin: 0 },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "14px" },

  cards: { display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: "16px", marginBottom: "20px" },
  card: { background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  cardLabel: { fontSize: "12px", color: "#888", marginBottom: "6px" },
  cardValue: { fontSize: "24px", fontWeight: 700 },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "10px", borderBottom: "1px solid #eee", fontSize: "13px" },
  staleRow: { background: "#fff8e1" },
  staleBadge: { marginLeft: "8px", fontSize: "11px", color: "#b8860b", fontWeight: 700 },
  returnBadge: { fontSize: "12px", color: "#888" },

  primaryButton: { background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  secondaryButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px", marginRight: "6px" },
  dangerButton: { background: "#fff0f0", color: "#c00", border: "1px solid #f5b5b5", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modal: { background: "#fff", borderRadius: "10px", padding: "20px", width: "360px" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" },
  input: { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px" },
};
