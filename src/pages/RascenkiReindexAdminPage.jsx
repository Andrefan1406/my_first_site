// Личный кабинет админа → «Индексация расценок». У свода расценок нет
// планового синка (см. server/syncRascenki.js) — переиндексация в Qdrant
// запускается только отсюда, вручную, после того как обновили опубликованную
// Google-таблицу свода. Бэкенд: server/rascenkiAdmin.js.
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  if (!res.ok && res.status !== 202) {
    throw new Error(data.error || `Ошибка сервера (${res.status})`);
  }
  return data;
}

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
  } catch {
    return iso;
  }
};

const RascenkiReindexAdminPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/rascenki/status");
      setStatus(data);
      setError("");
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => clearInterval(pollRef.current);
  }, [loadStatus]);

  // Пока идёт переиндексация — опрашиваем статус раз в 3 сек.
  useEffect(() => {
    clearInterval(pollRef.current);
    if (status?.running) {
      pollRef.current = setInterval(loadStatus, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [status?.running, loadStatus]);

  const handleReindex = async () => {
    if (starting || status?.running) return;
    if (!window.confirm("Запустить переиндексацию свода расценок? Займёт около минуты.")) return;
    setStarting(true);
    setError("");
    try {
      await apiFetch("/api/admin/rascenki/reindex", { method: "POST" });
      await loadStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const running = status?.running;
  const lastRun = status?.lastRun;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/admin")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Индексация расценок</h1>
      </div>

      <p style={s.intro}>
        Свод расценок не синхронизируется автоматически. После того как вы обновили
        опубликованную Google-таблицу свода, нажмите кнопку ниже — сервер перечитает
        CSV и заново построит поисковый индекс (коллекция{" "}
        <code>{status?.collection || "rascenki_2026"}</code> в Qdrant).
      </p>

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.card}>
        <div style={s.row}>
          <span style={s.label}>Последняя индексация</span>
          <span style={s.value}>{fmtDateTime(status?.lastSyncedAt)}</span>
        </div>
        <div style={s.row}>
          <span style={s.label}>Позиций в индексе</span>
          <span style={s.value}>{status?.pointsCount ?? "—"}</span>
        </div>
        {status?.vectorSize != null && (
          <div style={s.row}>
            <span style={s.label}>Размерность вектора</span>
            <span style={s.value}>{status.vectorSize}</span>
          </div>
        )}

        {running && (
          <div style={s.runningBox}>
            <span style={s.spinner} /> Идёт переиндексация… (запущена {fmtDateTime(status.startedAt)})
          </div>
        )}

        {!running && lastRun && lastRun.ok && (
          <div style={s.okBox}>
            Готово: проиндексировано {lastRun.count} позиций ({fmtDateTime(lastRun.finishedAt)})
          </div>
        )}
        {!running && lastRun && !lastRun.ok && (
          <div style={s.errorBox}>
            Переиндексация не удалась: {lastRun.error} ({fmtDateTime(lastRun.finishedAt)})
          </div>
        )}

        <button
          onClick={handleReindex}
          disabled={starting || running}
          style={{ ...s.btn, ...(starting || running ? s.btnDisabled : null) }}
        >
          {running ? "Идёт индексация…" : starting ? "Запуск…" : "Переиндексировать свод расценок"}
        </button>
      </div>

      <style>{`
        @keyframes rascenkiSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "640px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" },
  back: { background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },
  title: { margin: 0, fontSize: "22px" },
  intro: { fontSize: "14px", color: "#555", lineHeight: 1.5, marginBottom: "16px" },

  card: { background: "#fff", borderRadius: "12px", padding: "18px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "10px" },
  row: { display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid #f0f0f0", paddingBottom: "8px" },
  label: { color: "#888" },
  value: { fontWeight: 600, color: "#222" },

  runningBox: { display: "flex", alignItems: "center", gap: "10px", background: "#eef5ff", color: "#1a5fb4", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" },
  okBox: { background: "#e7f6ec", color: "#1a7f37", borderRadius: "8px", padding: "10px 12px", fontSize: "13px" },
  errorBox: { background: "#fdecec", color: "#c0392b", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", marginTop: "8px" },

  spinner: { width: "14px", height: "14px", border: "2px solid #b3d1ff", borderTopColor: "#1a5fb4", borderRadius: "50%", display: "inline-block", animation: "rascenkiSpin 0.8s linear infinite" },

  btn: { marginTop: "6px", background: "#1a5fb4", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
  btnDisabled: { background: "#c8c8c8", cursor: "default" },
};

export default RascenkiReindexAdminPage;
