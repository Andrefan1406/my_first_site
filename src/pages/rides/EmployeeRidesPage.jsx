// Личный кабинет сотрудника (заказчика): форма подачи заявки на служебный
// транспорт + список своих заявок с статусом, который обновляется в
// реальном времени через Socket.io (комната employee:{id}) — без
// перезагрузки страницы видно, кто именно принял заказ.
import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ridesApiFetch, ridesApiPost } from "../../rides/api";
import { createRidesSocket } from "../../rides/socket";
import LogoutButton from "../../rides/LogoutButton";
import { formatRoute, formatEstimate, formatClock } from "../../rides/format";
import MapPicker from "../../rides/MapPicker";
import CancelRequestModal from "../../rides/CancelRequestModal";

const CAN_EDIT_ROUTE = ["pending_assignment", "assigned", "in_progress"];

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

const emptyForm = { fromAddress: "", toAddress: "", extraStops: [], requestedAt: "", purpose: "", passengersCount: 1, withReturn: false, comment: "" };

export default function EmployeeRidesPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [mapPickerTarget, setMapPickerTarget] = useState(null); // "fromAddress" | "toAddress" | { stopIndex } | null
  const [role, setRole] = useState(null); // диспетчер, зашедший сюда сам себе заказать машину, видит ссылку назад на /dispatcher
  const [cancelTargetId, setCancelTargetId] = useState(null); // id заявки, для которой открыта модалка отмены
  const [proposeFor, setProposeFor] = useState(null); // id заявки, для которой добавляем точку через карту
  const [notice, setNotice] = useState("");
  const [fleet, setFleet] = useState(null); // { hasFree, freeCount, nextFreeAt } — занятость парка

  useEffect(() => {
    ridesApiFetch("/api/v1/users/me").then(({ user }) => setRole(user?.role || null)).catch(() => {});
  }, []);

  const loadFleet = useCallback(() => {
    ridesApiFetch("/api/v1/fleet-status").then(setFleet).catch(() => {});
  }, []);

  useEffect(() => {
    loadFleet();
    const t = setInterval(loadFleet, 60000);
    return () => clearInterval(t);
  }, [loadFleet]);

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
    const onUpdateAndFleet = (req) => { onUpdate(req); loadFleet(); };
    socket.on("request:assigned", onUpdateAndFleet);
    socket.on("request:status", onUpdateAndFleet);
    socket.on("proposal:updated", (p) => {
      if (p.status === "approved") setNotice(`Точка «${p.address}» добавлена в маршрут заявки #${p.requestId}.`);
      else if (p.status === "rejected") setNotice(`Диспетчер отклонил точку «${p.address}»${p.decisionReason ? `: ${p.decisionReason}` : ""}.`);
      else if (p.status === "auto_rejected") setNotice(`Точка «${p.address}» отклонена автоматически — диспетчер не успел рассмотреть.`);
      setRequests((prev) => prev.map((r) => (
        r.id === p.requestId ? { ...r, stopProposals: (r.stopProposals || []).filter((sp) => sp.id !== p.id) } : r
      )));
    });
    socket.on("connect_error", () => {});
    return () => socket.disconnect();
  }, [loadFleet]);

  const proposeStop = async (requestId, address) => {
    setProposeFor(null);
    setError("");
    try {
      const { proposal } = await ridesApiPost(`/api/v1/requests/${requestId}/stop-changes`, { action: "add", address });
      setNotice(
        proposal.status === "approved"
          ? `Точка «${address}» добавлена в маршрут.`
          : `Точка «${address}» отправлена диспетчеру на согласование.`
      );
      load();
    } catch (err) {
      setError(err.message || "Не удалось добавить точку");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fromAddress.trim() || !form.toAddress.trim() || !form.requestedAt || !form.purpose.trim()) {
      setError("Заполните адрес подачи, адрес назначения, время и цель поездки");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = { ...form, extraStops: form.extraStops.map((s) => s.trim()).filter(Boolean) };
      const { request } = await ridesApiPost("/api/v1/requests", payload);
      setRequests((prev) => [request, ...prev]);
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (reason) => {
    try {
      const { request } = await ridesApiPost(`/api/v1/requests/${cancelTargetId}/cancel-mine`, { reason });
      setRequests((prev) => prev.map((r) => (r.id === request.id ? request : r)));
      setCancelTargetId(null);
    } catch (err) {
      setError(err.message || "Не удалось отменить заявку");
    }
  };

  const active = requests.filter((r) => !["completed", "cancelled"].includes(r.status));
  const history = requests.filter((r) => ["completed", "cancelled"].includes(r.status));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Заказ служебного транспорта</h1>
        <div style={s.headerRight}>
          {role === "dispatcher" && <Link to="/dispatcher" style={s.link}>← Панель диспетчера</Link>}
          <LogoutButton />
        </div>
      </div>
      {error && <div style={s.error}>{error}</div>}
      {notice && <div style={s.notice} onClick={() => setNotice("")}>{notice}</div>}

      {fleet && (
        fleet.hasFree ? (
          <div style={s.fleetOk}>
            🚗 Свободные машины есть{fleet.freeCount > 1 ? ` — ${fleet.freeCount}` : ""}. Заявку возьмёт первый освободившийся водитель.
          </div>
        ) : (
          <div style={s.fleetBusy}>
            <b>Все машины сейчас заняты.</b>{" "}
            {fleet.nextFreeAt
              ? `Ближайшая освободится ${formatClock(fleet.nextFreeAt)}.`
              : "Время освобождения пока не определено."}
            <div style={s.fleetHint}>Заявку можно подать — она встанет в очередь и её возьмёт первый освободившийся водитель.</div>
          </div>
        )
      )}

      <form onSubmit={submit} style={s.form}>
        <div style={s.formRow}>
          <label style={s.label}>Откуда
            <div style={s.addressRow}>
              <input style={{ ...s.input, flex: 1 }} value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} />
              <button type="button" style={s.mapButton} onClick={() => setMapPickerTarget("fromAddress")}>На карте</button>
            </div>
          </label>
          <label style={s.label}>Куда
            <div style={s.addressRow}>
              <input style={{ ...s.input, flex: 1 }} value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} />
              <button type="button" style={s.mapButton} onClick={() => setMapPickerTarget("toAddress")}>На карте</button>
            </div>
          </label>
        </div>

        {form.extraStops.map((stop, i) => (
          <div key={i} style={s.stopRow}>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder={`Ещё пункт назначения ${i + 1}`}
              value={stop}
              onChange={(e) => {
                const next = [...form.extraStops];
                next[i] = e.target.value;
                setForm({ ...form, extraStops: next });
              }}
            />
            <button type="button" style={s.mapButton} onClick={() => setMapPickerTarget({ stopIndex: i })}>На карте</button>
            <button
              type="button"
              style={s.removeStopButton}
              onClick={() => setForm({ ...form, extraStops: form.extraStops.filter((_, j) => j !== i) })}
            >
              Удалить
            </button>
          </div>
        ))}
        <button
          type="button"
          style={s.addStopButton}
          onClick={() => setForm({ ...form, extraStops: [...form.extraStops, ""] })}
        >
          + Добавить пункт назначения
        </button>

        <div style={s.formRow}>
          <label style={s.label}>Дата и время подачи
            <input type="datetime-local" style={s.input} value={form.requestedAt} onChange={(e) => setForm({ ...form, requestedAt: e.target.value })} />
          </label>
          <label style={s.label}>Кол-во пассажиров
            <input type="number" min={1} max={50} style={s.input} value={form.passengersCount} onChange={(e) => setForm({ ...form, passengersCount: e.target.value })} />
          </label>
        </div>
        <label style={s.label}>Цель поездки *
          <input style={s.input} required value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </label>
        <label style={s.checkboxLabel}>
          <input type="checkbox" checked={form.withReturn} onChange={(e) => setForm({ ...form, withReturn: e.target.checked })} />
          С ожиданием и возвратом (водитель ждёт на месте и везёт обратно)
        </label>
        <label style={s.label}>Комментарий
          <textarea style={{ ...s.input, minHeight: "60px" }} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
        </label>
        <button type="submit" style={s.primaryButton} disabled={submitting}>Подать заявку</button>
      </form>

      {mapPickerTarget && (
        <MapPicker
          onClose={() => setMapPickerTarget(null)}
          onSelect={(address) => {
            if (mapPickerTarget === "fromAddress") setForm((f) => ({ ...f, fromAddress: address }));
            else if (mapPickerTarget === "toAddress") setForm((f) => ({ ...f, toAddress: address }));
            else {
              setForm((f) => {
                const next = [...f.extraStops];
                next[mapPickerTarget.stopIndex] = address;
                return { ...f, extraStops: next };
              });
            }
            setMapPickerTarget(null);
          }}
        />
      )}

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Мои активные заявки</h2>
        {loading ? <p style={s.muted}>Загрузка...</p> : active.length === 0 ? (
          <p style={s.muted}>Активных заявок нет.</p>
        ) : (
          <div style={s.cards}>
            {active.map((r) => (
              <div key={r.id} style={s.card}>
                <div style={s.cardRoute}>{formatRoute(r)}{r.withReturn && <span style={s.returnBadge}> (туда-обратно)</span>}</div>
                <div style={s.cardMeta}>Подача: {formatDateTime(r.requestedAt)} · Пассажиров: {r.passengersCount}</div>
                {formatEstimate(r) && <div style={s.cardMeta}>{formatEstimate(r)}</div>}
                {r.comment && <div style={s.cardMeta}>Комментарий: {r.comment}</div>}
                <div style={{ ...s.cardStatus, color: statusColor(r.status) }}>{statusLabel(r)}</div>
                {r.stopProposals?.length > 0 && (
                  <div style={s.pendingBox}>
                    {r.stopProposals.map((sp) => (
                      <div key={sp.id}>🕓 точка «{sp.address}» — ждёт решения диспетчера</div>
                    ))}
                  </div>
                )}
                <div style={s.cardActions}>
                  {CAN_EDIT_ROUTE.includes(r.status) && (
                    <button type="button" style={s.addPointButton} onClick={() => setProposeFor(r.id)}>+ Добавить точку</button>
                  )}
                  {["pending_assignment", "assigned"].includes(r.status) && (
                    <button type="button" style={s.cancelButton} onClick={() => setCancelTargetId(r.id)}>Отменить заявку</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {cancelTargetId && (
          <CancelRequestModal onClose={() => setCancelTargetId(null)} onConfirm={cancelRequest} />
        )}
        {proposeFor && (
          <MapPicker onClose={() => setProposeFor(null)} onSelect={(address) => proposeStop(proposeFor, address)} />
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>История поездок</h2>
        {history.length === 0 ? (
          <p style={s.muted}>Пока ничего нет.</p>
        ) : (
          <div style={s.tableWrap}>
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
                    <td style={s.td}>{formatRoute(r)}</td>
                    <td style={{ ...s.td, color: statusColor(r.status) }}>{statusLabel(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const s = {
  page: { padding: "16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "700px", margin: "0 auto", boxSizing: "border-box" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" },
  headerRight: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" },
  link: { color: "#1976d2", fontSize: "13px", textDecoration: "none" },
  title: { fontSize: "clamp(18px, 5vw, 22px)", margin: 0 },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  notice: { background: "#eef6ff", color: "#0b5cad", border: "1px solid #b8d9f7", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", cursor: "pointer" },
  fleetOk: { background: "#eaf7ec", color: "#1a7f37", border: "1px solid #b6e0bf", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  fleetBusy: { background: "#fff7e6", color: "#8a5a00", border: "1px solid #f0d19a", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  fleetHint: { marginTop: "4px", fontSize: "12px", color: "#a07840" },
  muted: { color: "#888", fontSize: "14px" },
  cardActions: { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" },
  pendingBox: { marginTop: "8px", background: "#fffdf6", border: "1px solid #f0d9a8", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", color: "#8a6d2f" },
  addPointButton: { background: "none", border: "1px dashed #1976d2", color: "#1976d2", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontSize: "13px" },

  form: { background: "#fff", border: "1px solid #eee", borderRadius: "10px", padding: "16px", marginBottom: "28px", display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box" },
  formRow: { display: "flex", gap: "12px", flexWrap: "wrap" },
  label: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#444", flex: "1 1 200px", minWidth: 0 },
  checkboxLabel: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#444" },
  input: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", width: "100%", boxSizing: "border-box", minWidth: 0 },
  primaryButton: { alignSelf: "flex-start", background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "10px 20px", cursor: "pointer", fontSize: "14px", fontWeight: 600 },
  stopRow: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  addStopButton: { alignSelf: "flex-start", background: "none", border: "1px dashed #1976d2", color: "#1976d2", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
  removeStopButton: { background: "#fff0f0", color: "#c00", border: "1px solid #f5b5b5", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontSize: "13px" },
  addressRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  mapButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "8px 12px", cursor: "pointer", fontSize: "13px", whiteSpace: "nowrap" },

  section: { marginBottom: "28px" },
  sectionTitle: { fontSize: "16px", marginBottom: "12px" },

  cards: { display: "flex", flexDirection: "column", gap: "12px" },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: "10px", padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", boxSizing: "border-box" },
  cardRoute: { fontWeight: 700, fontSize: "14px", marginBottom: "4px", wordBreak: "break-word" },
  cardMeta: { fontSize: "13px", color: "#555", marginBottom: "2px", wordBreak: "break-word" },
  cardStatus: { fontSize: "13px", fontWeight: 600, marginTop: "6px" },
  cancelButton: { marginTop: "10px", background: "#fff0f0", color: "#c00", border: "1px solid #f5b5b5", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },
  returnBadge: { fontWeight: 400, fontSize: "13px", color: "#888" },

  tableWrap: { overflowX: "auto", WebkitOverflowScrolling: "touch" },
  table: { width: "100%", minWidth: "420px", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "8px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px", whiteSpace: "nowrap" },
  td: { padding: "8px", borderBottom: "1px solid #eee", fontSize: "13px" },
};
