// Админ-панель управления пользователями (первая часть — пока только
// правила проверки пропусков в отчётах по людям, см.
// server/peopleGapsCheck.js/peopleGapsGate.js: для email из списка
// people_gap_check_rules подача заявок блокируется, пока по закреплённому
// за ним участку есть незакрытый пропуск). В дальнейшем сюда добавится
// управление пользователями и ролями шире этой одной проверки — CRUD ниже
// уже вынесен в свой сегмент /check-rules на сервере (см.
// server/peopleGapsAdmin.js), чтобы не переплетаться с остальными фичами.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { peopleSiteOptions } from "../data/peopleSites";

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
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ошибка сервера (${res.status})`);
  }
  return data;
}

const PeopleGapsUsersAdminPage = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newSite, setNewSite] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/people-gaps/check-rules");
      setRules(data.rules || []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить правила");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !newSite) {
      setError("Заполните email и участок.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const data = await apiFetch("/api/admin/people-gaps/check-rules", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim(), site: newSite }),
      });
      setRules(data.rules || []);
      setNewEmail("");
      setNewSite("");
    } catch (err) {
      setError(err.message || "Не удалось добавить правило");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Удалить это правило?")) return;
    setError("");
    try {
      await apiFetch(`/api/admin/people-gaps/check-rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || "Не удалось удалить правило");
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Управление пользователями</h1>
        <button onClick={() => navigate("/admin/people-gaps")} style={s.gapsLink}>
          Пропуски в отчётах →
        </button>
      </div>

      <section style={s.section}>
        <h2 style={s.sectionTitle}>Проверка пропусков в отчётах по людям</h2>
        <p style={s.hint}>
          Для email из списка ниже подача любых заявок блокируется, пока по закреплённому
          за ним участку есть незакрытый пропуск отчётности (кроме сегодняшнего дня).
        </p>

        <form onSubmit={handleAdd} style={s.form}>
          <input
            type="email"
            placeholder="email пользователя"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={s.input}
          />
          <select value={newSite} onChange={(e) => setNewSite(e.target.value)} style={s.select}>
            <option value="">Выберите участок</option>
            {peopleSiteOptions.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
          <button type="submit" disabled={saving} style={s.addBtn}>
            {saving ? "Добавляю..." : "Добавить"}
          </button>
        </form>

        {error && <div style={s.error}>{error}</div>}

        {loading ? (
          <p>Загрузка...</p>
        ) : rules.length === 0 ? (
          <p style={s.muted}>Правил пока нет — проверка ни на кого не распространяется.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Email</th>
                <th style={s.th}>Участок</th>
                <th style={s.th}>Добавил</th>
                <th style={s.th}>Когда</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={s.td}>{rule.email}</td>
                  <td style={s.td}>{rule.site}</td>
                  <td style={s.td}>{rule.created_by || "—"}</td>
                  <td style={s.td}>{(rule.created_at || "").replace("T", " ").slice(0, 16)}</td>
                  <td style={s.td}>
                    <button onClick={() => handleDelete(rule.id)} style={s.deleteBtn}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "900px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" },
  back: { background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },
  title: { margin: 0, fontSize: "22px" },
  gapsLink: { marginLeft: "auto", background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "13px", fontWeight: 500 },

  section: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  sectionTitle: { margin: "0 0 6px", fontSize: "17px" },
  hint: { color: "#666", fontSize: "13px", margin: "0 0 16px", lineHeight: 1.5 },

  form: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" },
  input: { padding: "8px 10px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "13px", minWidth: "220px" },
  select: { padding: "8px 10px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "13px", minWidth: "200px" },
  addBtn: { background: "#007bff", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "13px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "10px", borderBottom: "1px solid #eee", fontSize: "13px" },
  deleteBtn: { background: "none", border: "1px solid #f0b0b0", color: "#c00", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "12px" },
};

export default PeopleGapsUsersAdminPage;
