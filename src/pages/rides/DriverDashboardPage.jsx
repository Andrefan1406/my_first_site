// Личный кабинет водителя — ключевая страница системы поездок: пул
// свободных заказов (кто первый нажал "Взять заказ", тот и получил —
// гонка решается на бэкенде транзакцией, см. server/rides/requestsRouter.js
// POST /:id/claim), свои текущие заказы и история завершённых поездок.
// Обновление пула в реальном времени — через Socket.io, без релоада.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ridesApiFetch, ridesApiPatch, ridesApiPost } from "../../rides/api";
import { createRidesSocket } from "../../rides/socket";

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL = {
  assigned: "Назначен, ожидает выезда",
  in_progress: "В пути",
  completed: "Завершён",
};

export default function DriverDashboardPage() {
  const [driver, setDriver] = useState(null);
  const [pool, setPool] = useState([]);
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState(new Set());

  const setRowBusy = (id, val) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (val) next.add(id); else next.delete(id);
      return next;
    });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [driverRes, poolRes, currentRes] = await Promise.all([
        ridesApiFetch("/api/v1/drivers/me"),
        ridesApiFetch("/api/v1/requests/pool"),
        ridesApiFetch("/api/v1/requests/my-current"),
      ]);
      setDriver(driverRes.driver);
      setPool(poolRes.requests);
      setCurrent(currentRes.requests);
    } catch (err) {
      setError(err.message || "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Socket.io: новый заказ в пуле появляется у всех сразу, забранный —
  // сразу пропадает, а принудительное назначение диспетчером добавляет
  // заказ в "Мои текущие" даже без действия самого водителя.
  useEffect(() => {
    const socket = createRidesSocket();
    socket.on("request:new", (req) => {
      setPool((prev) => (prev.some((r) => r.id === req.id) ? prev : [...prev, req].sort((a, b) => a.id - b.id)));
    });
    socket.on("request:removed", ({ id }) => {
      setPool((prev) => prev.filter((r) => r.id !== id));
    });
    socket.on("request:assigned", (req) => {
      setCurrent((prev) => (prev.some((r) => r.id === req.id) ? prev : [...prev, req]));
      setPool((prev) => prev.filter((r) => r.id !== req.id));
    });
    socket.on("connect_error", () => {});
    return () => socket.disconnect();
  }, []);

  const claim = async (id) => {
    setRowBusy(id, true);
    setError("");
    try {
      const { request } = await ridesApiPost(`/api/v1/requests/${id}/claim`);
      setPool((prev) => prev.filter((r) => r.id !== id));
      setCurrent((prev) => [...prev, request]);
      setDriver((prev) => (prev ? { ...prev, status: "busy" } : prev));
    } catch (err) {
      setError(err.message || "Заказ уже взят другим водителем");
      setPool((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setRowBusy(id, false);
    }
  };

  const setStatus = async (id, status) => {
    setRowBusy(id, true);
    setError("");
    try {
      const { request } = await ridesApiPost(`/api/v1/requests/${id}/status`, { status });
      if (status === "completed") {
        setCurrent((prev) => prev.filter((r) => r.id !== id));
        setDriver((prev) => (prev ? { ...prev, status: "available" } : prev));
      } else {
        setCurrent((prev) => prev.map((r) => (r.id === id ? request : r)));
      }
    } catch (err) {
      setError(err.message || "Не удалось сменить статус заказа");
    } finally {
      setRowBusy(id, false);
    }
  };

  const decline = async (id) => {
    const reason = window.prompt("Причина отказа:");
    if (reason === null) return;
    if (!reason.trim()) { setError("Укажите причину отказа"); return; }
    setRowBusy(id, true);
    setError("");
    try {
      await ridesApiPost(`/api/v1/requests/${id}/decline`, { reason });
      setCurrent((prev) => prev.filter((r) => r.id !== id));
      setDriver((prev) => (prev ? { ...prev, status: "available" } : prev));
    } catch (err) {
      setError(err.message || "Не удалось отказаться от заказа");
    } finally {
      setRowBusy(id, false);
    }
  };

  const toggleOnline = async () => {
    if (!driver) return;
    const nextStatus = driver.status === "offline" ? "available" : "offline";
    try {
      const { driver: updated } = await ridesApiPatch("/api/v1/drivers/me/status", { status: nextStatus });
      setDriver(updated);
    } catch (err) {
      setError(err.message || "Не удалось сменить статус");
    }
  };

  const loadHistory = async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (historyFrom) params.set("from", historyFrom);
      if (historyTo) params.set("to", historyTo);
      const { requests } = await ridesApiFetch(`/api/v1/requests/my-history?${params.toString()}`);
      setHistory(requests);
    } catch (err) {
      setError(err.message || "Не удалось загрузить историю");
    }
  };

  const statusBadge = useMemo(() => {
    if (!driver) return null;
    const map = { available: ["На линии", "#1a7f37"], busy: ["На заказе", "#b8860b"], offline: ["Не на линии", "#888"] };
    const [label, color] = map[driver.status] || ["—", "#888"];
    return <span style={{ ...s.badge, color, borderColor: color }}>{label}</span>;
  }, [driver]);

  if (loading) return <div style={{ padding: 30 }}>Загрузка...</div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Кабинет водителя</h1>
        <div style={s.headerRight}>
          {statusBadge}
          {driver?.status !== "busy" && (
            <button style={s.secondaryButton} onClick={toggleOnline}>
              {driver?.status === "offline" ? "Выйти на линию" : "Уйти с линии"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Мои текущие заказы ({current.length})</h2>
        {current.length === 0 ? (
          <p style={s.muted}>Сейчас нет активных заказов.</p>
        ) : (
          <div style={s.cards}>
            {current.map((r) => (
              <div key={r.id} style={s.card}>
                <div style={s.cardRoute}>{r.fromAddress} → {r.toAddress}</div>
                <div style={s.cardMeta}>Подача: {formatDateTime(r.requestedAt)} · Пассажиров: {r.passengersCount}</div>
                {r.purpose && <div style={s.cardMeta}>Цель: {r.purpose}</div>}
                {r.comment && <div style={s.cardMeta}>Комментарий: {r.comment}</div>}
                <div style={s.cardMeta}>
                  Заказчик: {r.employeeName} — <a href={`tel:${r.employeePhone}`} style={s.phoneLink}>{r.employeePhone}</a>
                </div>
                <div style={s.cardStatus}>{STATUS_LABEL[r.status] || r.status}</div>
                <div style={s.cardActions}>
                  {r.status === "assigned" && (
                    <button style={s.primaryButton} disabled={busyIds.has(r.id)} onClick={() => setStatus(r.id, "in_progress")}>В пути</button>
                  )}
                  {r.status === "in_progress" && (
                    <button style={s.primaryButton} disabled={busyIds.has(r.id)} onClick={() => setStatus(r.id, "completed")}>Завершено</button>
                  )}
                  <button style={s.dangerButton} disabled={busyIds.has(r.id)} onClick={() => decline(r.id)}>Отказаться</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Пул свободных заказов ({pool.length})</h2>
        {pool.length === 0 ? (
          <p style={s.muted}>Сейчас в пуле нет заказов.</p>
        ) : (
          <div style={s.cards}>
            {pool.map((r) => (
              <div key={r.id} style={s.card}>
                <div style={s.cardRoute}>{r.fromAddress} → {r.toAddress}</div>
                <div style={s.cardMeta}>Подача: {formatDateTime(r.requestedAt)} · Пассажиров: {r.passengersCount}</div>
                {r.purpose && <div style={s.cardMeta}>Цель: {r.purpose}</div>}
                {r.comment && <div style={s.cardMeta}>Комментарий: {r.comment}</div>}
                <div style={s.cardMeta}>
                  Заказчик: {r.employeeName} — <a href={`tel:${r.employeePhone}`} style={s.phoneLink}>{r.employeePhone}</a>
                </div>
                <button style={s.primaryButton} disabled={busyIds.has(r.id) || driver?.status !== "available"} onClick={() => claim(r.id)}>
                  Взять заказ
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>История поездок</h2>
        <div style={s.historyFilters}>
          <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} style={s.dateInput} />
          <span>—</span>
          <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} style={s.dateInput} />
          <button style={s.secondaryButton} onClick={loadHistory}>Показать</button>
        </div>
        {history.length > 0 && (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Дата</th>
                <th style={s.th}>Маршрут</th>
                <th style={s.th}>Заказчик</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>{formatDateTime(r.createdAt)}</td>
                  <td style={s.td}>{r.fromAddress} → {r.toAddress}</td>
                  <td style={s.td}>{r.employeeName}</td>
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
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "900px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  title: { margin: 0, fontSize: "22px" },
  badge: { padding: "4px 10px", borderRadius: "999px", border: "1px solid", fontSize: "13px", fontWeight: 600 },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "14px" },

  section: { marginBottom: "28px" },
  sectionTitle: { fontSize: "17px", marginBottom: "12px" },

  cards: { display: "flex", flexDirection: "column", gap: "12px" },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: "10px", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  cardRoute: { fontWeight: 700, fontSize: "15px", marginBottom: "4px" },
  cardMeta: { fontSize: "13px", color: "#555", marginBottom: "2px" },
  cardStatus: { fontSize: "13px", fontWeight: 600, color: "#1976d2", marginTop: "6px" },
  cardActions: { display: "flex", gap: "8px", marginTop: "10px" },
  phoneLink: { color: "#1976d2", fontWeight: 600, textDecoration: "none" },

  primaryButton: { background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  secondaryButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },
  dangerButton: { background: "#fff0f0", color: "#c00", border: "1px solid #f5b5b5", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },

  historyFilters: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" },
  dateInput: { padding: "6px 8px", borderRadius: "6px", border: "1px solid #ccc" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "8px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "8px", borderBottom: "1px solid #eee", fontSize: "13px" },
};
