// Сводная админ-панель: кто из пользователей ПРЯМО СЕЙЧАС заблокирован от
// подачи заявок и по какой причине — объединяет оба независимых источника
// блокировки (пропуски в отчётах по людям и пропуски в ГПР, см.
// server/blockedUsersAdmin.js). Причины показываем ТЕМИ ЖЕ формулировками,
// что видит сам заблокированный пользователь (gapWarningMessage/
// gprBlockMessage — те же функции, что используются в самой форме заявки),
// чтобы администратор читал ровно то сообщение, из-за которого человеку
// недоступна подача, а не отдельный пересказ той же логики.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { gapWarningMessage } from "../peopleGapsGate";
import { gprBlockMessage } from "../gprReportGate";

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

// Группирует gpr-пропуски пользователя по источнику (poz64_72/nz3/...) — у
// gprBlockMessage нет понятия источника, ему на вход нужны gap-объекты
// ОДНОГО источника за раз, иначе сообщение будет смешивать позиции из
// разных, не связанных друг с другом источников.
function groupGprGapsBySource(gprGaps) {
  const bySource = new Map();
  for (const g of gprGaps) {
    if (!bySource.has(g.source_key)) bySource.set(g.source_key, { label: g.source_label, gaps: [] });
    bySource.get(g.source_key).gaps.push(g);
  }
  return [...bySource.values()];
}

function buildReasons(user) {
  const reasons = [];
  for (const pg of user.peopleGaps) {
    reasons.push({ kind: "people", text: `Люди, участок «${pg.site}»: ${gapWarningMessage(pg.missingDates)}` });
  }
  for (const { label, gaps } of groupGprGapsBySource(user.gprGaps)) {
    reasons.push({ kind: "gpr", text: `${label}: ${gprBlockMessage(gaps)}` });
  }
  return reasons;
}

const BlockedUsersAdminPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch("/api/admin/blocked-users");
      setData(result);
    } catch (err) {
      setError(err.message || "Не удалось загрузить список заблокированных пользователей");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const blockedUsers = data?.blockedUsers || [];

  const summary = useMemo(
    () => ({
      total: blockedUsers.length,
      byPeople: blockedUsers.filter((u) => u.peopleGaps.length).length,
      byGpr: blockedUsers.filter((u) => u.gprGaps.length).length,
    }),
    [blockedUsers]
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/admin")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Заблокированные пользователи</h1>
      </div>

      <div style={s.cards}>
        <div style={s.card}>
          <div style={s.cardLabel}>Заблокировано сейчас</div>
          <div style={{ ...s.cardValue, color: summary.total ? "#c0392b" : "#1a7f37" }}>{summary.total}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Из-за пропусков по людям</div>
          <div style={s.cardValue}>{summary.byPeople}</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Из-за пропусков в ГПР</div>
          <div style={s.cardValue}>{summary.byGpr}</div>
        </div>
      </div>

      <div style={s.actions}>
        <button onClick={load} disabled={loading}>Обновить</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <p>Загрузка...</p>
      ) : blockedUsers.length === 0 ? (
        <p style={s.muted}>Сейчас никто не заблокирован.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Email</th>
              <th style={s.th}>Причина блокировки</th>
            </tr>
          </thead>
          <tbody>
            {blockedUsers.map((user) => (
              <tr key={user.email}>
                <td style={{ ...s.td, ...s.tdEmail }}>{user.email}</td>
                <td style={s.td}>
                  <ul style={s.reasonList}>
                    {buildReasons(user).map((r, i) => (
                      <li key={i} style={s.reasonItem}>{r.text}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "1100px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" },
  back: { background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },
  title: { margin: 0, fontSize: "22px" },

  cards: { display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" },
  card: { background: "#fff", borderRadius: "10px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  cardLabel: { fontSize: "12px", color: "#888", marginBottom: "6px" },
  cardValue: { fontSize: "24px", fontWeight: 700 },

  actions: { display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "14px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa" },
  td: { padding: "10px", borderBottom: "1px solid #eee", verticalAlign: "top" },
  tdEmail: { fontWeight: 600, whiteSpace: "nowrap" },

  reasonList: { margin: 0, paddingLeft: "18px" },
  reasonItem: { marginBottom: "4px", fontSize: "13px", color: "#444" },
};

export default BlockedUsersAdminPage;
