// Личный кабинет сотрудника (заказчика): форма подачи заявки на служебный
// транспорт + список своих заявок с статусом, который обновляется в
// реальном времени через Socket.io (комната employee:{id}) — без
// перезагрузки страницы видно, кто именно принял заказ.
import React, { useCallback, useEffect, useState } from "react";
import { ridesApiFetch, ridesApiPost } from "../../rides/api";
import { createRidesSocket } from "../../rides/socket";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(r) {
  switch (r.status) {
    case "pending_assignment": return "Ищем водителя...";
    case "assigned": return `Заказ принял ${r.driverName || "водитель"}${r.vehiclePlate ? ` (${r.vehiclePlate})` : ""}`;
    case "in_progress": return `В пути — ${r.driverName || "водитель"}${r.vehiclePlate ? ` (${r.vehiclePlate})` : ""}`;
    case "completed": return "Завершено";
    case "cancelled": return `Отменено${r.cancelReason ? `: ${r.cancelReason}` : ""}`;
    default: return r.status;
  }
}

function statusColor(status) {
  switch (status) {
    case "pending_assignment": return "#b8860b";
    case "assigned":
    case "in_progress": return "#1976d2";
    case "completed": return "#1a7f37";
    case "cancelled": return "#c00";
    default: return "#888";
  }
}

const emptyForm = { fromAddress: "", toAddress: "", requestedAt: "", purpose: "", passengersCount: 1, comment: "" };

export default function EmployeeRidesPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { requests: rows } = await ridesApiFetch("/api/v1/requests/mine");
      setRequests(rows);
    } catch (err) {
      setError(err.message || "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = createRidesSocket();
    const onUpdate = (req) => {
      setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
    };
    socket.on("request:assigned", onUpdate);
    socket.on("request:status", onUpdate);
    socket.on("connect_error", () => {});
    return () => socket.disconnect();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fromAddress.trim() || !form.toAddress.trim() || !form.requestedAt) {
      setError("Заполните адрес подачи, адрес назначения и время");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { request } = await ridesApiPost("/api/v1/requests", form);
      setRequests((prev) => [request, ...prev]);
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  const active = requests.filter((r) => !["completed", "cancelled"].includes(r.status));
  const history = requests.filter((r) => ["completed", "cancelled"].includes(r.status));

  return (
    <div style={s.page}>
      <h1 style={s.title}>Заказ служебного транспорта</h1>
      {error && <div style={s.error}>{error}</div>}

      <form onSubmit={submit} style={s.form}>
        <div style={s.formRow}>
          <label style={s.label}>Откуда
            <input style={s.input} value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} />
          </label>
          <label style={s.label}>Куда
            <input style={s.input} value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} />
          </label>
        </div>
        <div style={s.formRow}>
          <label style={s.label}>Дата и время подачи
            <input type="datetime-local" style={s.input} value={form.requestedAt} onChange={(e) => setForm({ ...form, requestedAt: e.target.value })} />
          </label>
          <label style={s.label}>Кол-во пассажиров
            <input type="number" min={1} max={50} style={s.input} value={form.passengersCount} onChange={(e) => setForm({ ...form, passengersCount: e.target.value })} />
          </label>
        </div>
        <label style={s.label}>Цель поездки
          <input style={s.input} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </label>
        <label style={s.label}>Комментарий
          <textarea style={{ ...s.input, minHeight: "60px" }} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </label>
        <button type="submit" style={s.primaryButton} disabled={submitting}>Подать заявку</button>
      </form>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Мои активные заявки</h2>
        {loading ? <p style={s.muted}>Загрузка...</p> : active.length === 0 ? (
          <p style={s.muted}>Активных заявок нет.</p>
        ) : (
          <div style={s.cards}>
            {active.map((r) => (
              <div key={r.id} style={s.card}>
                <div style={s.cardRoute}>{r.fromAddress} → {r.toAddress}</div>
                <div style={s.cardMeta}>Подача: {formatDateTime(r.requestedAt)} · Пассажиров: {r.passengersCount}</div>
                {r.comment && <div style={s.cardMeta}>Комментарий: {r.comment}</div>}
                <div style={{ ...s.cardStatus, color: statusColor(r.status) }}>{statusLabel(r)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>История поездок</h2>
        {history.length === 0 ? (
          <p style={s.muted}>Пока ничего нет.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Дата</th>
                <th style={s.th}>Маршрут</th>
                <th style={s.th}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>{formatDateTime(r.createdAt)}</td>
                  <td style={s.td}>{r.fromAddress} → {r.toAddress}</td>
                  <td style={{ ...s.td, color: statusColor(r.status) }}>{statusLabel(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "700px", margin: "0 auto" },
  title: { fontSize: "22px", marginBottom: "16px" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "14px" },

  form: { background: "#fff", border: "1px solid #eee", borderRadius: "10px", padding: "18px", marginBottom: "28px", display: "flex", flexDirection: "column", gap: "12px" },
  formRow: { display: "flex", gap: "12px", flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#444", flex: "1 1 200px" },
  input: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px" },
  primaryButton: { alignSelf: "flex-start", background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "10px 20px", cursor: "pointer", fontSize: "14px", fontWeight: 600 },

  section: { marginBottom: "28px" },
  sectionTitle: { fontSize: "17px", marginBottom: "12px" },

  cards: { display: "flex", flexDirection: "column", gap: "12px" },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: "10px", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  cardRoute: { fontWeight: 700, fontSize: "15px", marginBottom: "4px" },
  cardMeta: { fontSize: "13px", color: "#555", marginBottom: "2px" },
  cardStatus: { fontSize: "13px", fontWeight: 600, marginTop: "6px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "8px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "8px", borderBottom: "1px solid #eee", fontSize: "13px" },
};
