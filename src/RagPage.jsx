import React, { useMemo, useState } from "react";

const BASE_URL =
  process.env.REACT_APP_RAG_API_URL || "https://rag-agent-v0ap.onrender.com";
const API_URL = `${BASE_URL}/chat`;

const RagPage = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [ms, setMs] = useState(null);
  const [error, setError] = useState("");

  const canAsk = useMemo(() => question.trim().length > 0 && !loading, [question, loading]);

  const ask = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setMs(null);

    const t0 = performance.now();

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = await res.json();

      const t1 = performance.now();
      setMs(Math.round(t1 - t0));

      setAnswer(data.answer || "Нет ответа");
    } catch (e) {
      setError(e?.message || "Ошибка запроса к серверу");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setQuestion("");
    setAnswer("");
    setError("");
    setMs(null);
  };

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer);
    } catch {
      // если браузер запретил — просто игнор
    }
  };

  const onKeyDown = (e) => {
    // Ctrl/Cmd + Enter — отправить
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      ask();
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>RAG-агент</h1>
            <p style={styles.subtitle}>
              Вопрос → поиск по базе → ответ. Подсказка: <b>Ctrl/Cmd + Enter</b> — отправить.
            </p>
          </div>

          <div style={{ ...styles.badge, ...(loading ? styles.badgeLoading : null) }}>
            {loading ? "Ищу…" : "Готов"}
          </div>
        </header>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.left}>
              <label style={styles.label}>Вопрос</label>
              <textarea
                rows={4}
                style={styles.textarea}
                placeholder="Например: расценки на паркет / порядок передачи ПСД / сроки согласования…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyDown}
              />

              <div style={styles.hintRow}>
                <span style={styles.hint}>
                  API: <span style={styles.mono}>{API_URL}</span>
                </span>
                {ms !== null && !error && (
                  <span style={styles.pill}>{ms} ms</span>
                )}
              </div>
            </div>

            <div style={styles.right}>
              <button
                onClick={ask}
                disabled={!canAsk}
                style={{ ...styles.button, ...(canAsk ? null : styles.buttonDisabled) }}
              >
                {loading ? "Ищем…" : "Найти"}
              </button>

              <button onClick={clearAll} style={styles.buttonGhost} disabled={loading}>
                Очистить
              </button>

              <button
                onClick={copyAnswer}
                style={{ ...styles.buttonGhost, ...(answer ? null : styles.buttonGhostDisabled) }}
                disabled={!answer}
                title={answer ? "Скопировать ответ" : "Нет ответа для копирования"}
              >
                Копировать
              </button>

              <div style={styles.tipBox}>
                <div style={styles.tipTitle}>Как получать точнее</div>
                <ul style={styles.tipList}>
                  <li>Указывай вид работ и материал</li>
                  <li>Добавляй “для бригад/для фирм”, если нужно</li>
                  <li>Если регламентов несколько — уточняй название</li>
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.answerHeader}>
            <div style={styles.answerTitle}>Ответ</div>
            {answer && !error && (
              <span style={styles.pill}>готово</span>
            )}
            {error && (
              <span style={{ ...styles.pill, ...styles.pillError }}>ошибка</span>
            )}
          </div>

          <div
            style={{
              ...styles.answerBox,
              ...(error ? styles.answerBoxError : null),
            }}
          >
            {error ? (
              <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
            ) : answer ? (
              <div style={{ whiteSpace: "pre-wrap" }}>{answer}</div>
            ) : (
              <div style={styles.placeholder}>Здесь появится ответ…</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background:
      "radial-gradient(900px 420px at 20% 10%, rgba(167,139,250,0.22), transparent 60%)," +
      "radial-gradient(900px 420px at 80% 0%, rgba(110,231,255,0.18), transparent 55%)," +
      "#0b1020",
    color: "rgba(255,255,255,0.92)",
  },
  wrap: {
    maxWidth: 980,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 34,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.68)",
    fontSize: 14,
    lineHeight: 1.4,
  },
  badge: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    padding: "8px 12px",
    borderRadius: 999,
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  badgeLoading: {
    borderColor: "rgba(110,231,255,0.35)",
  },
  card: {
    border: "1px solid rgba(255,255,255,0.14)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.06))",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gap: 14,
  },
  left: {},
  right: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "rgba(255,255,255,0.68)",
    marginBottom: 8,
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    resize: "vertical",
    padding: "14px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    outline: "none",
    background: "rgba(0,0,0,0.25)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    lineHeight: 1.4,
  },
  hintRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap",
  },
  hint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
  },
  mono: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  pill: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.68)",
  },
  pillError: {
    borderColor: "rgba(251,113,133,0.45)",
    background: "rgba(251,113,133,0.10)",
    color: "rgba(255,255,255,0.85)",
  },
  button: {
    border: 0,
    cursor: "pointer",
    padding: "9px 12px",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    color: "#06101a",
    background: "linear-gradient(90deg, #6ee7ff, #a78bfa)",
    boxShadow: "0 10px 20px rgba(110,231,255,0.15)",
    transition: "transform .08s ease, filter .08s ease",
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  buttonGhost: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    padding: "12px 14px",
    borderRadius: 12,
    cursor: "pointer",
  },
  buttonGhostDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
  },
  tipBox: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(255,255,255,0.78)",
    marginBottom: 8,
  },
  tipList: {
    margin: 0,
    paddingLeft: 18,
    color: "rgba(255,255,255,0.66)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.12)",
    margin: "16px 0",
  },
  answerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  answerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(255,255,255,0.68)",
  },
  answerBox: {
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    minHeight: 140,
    fontSize: 15,
    lineHeight: 1.5,
  },
  answerBoxError: {
    borderColor: "rgba(251,113,133,0.45)",
    background: "rgba(251,113,133,0.08)",
  },
  placeholder: {
    color: "rgba(255,255,255,0.55)",
  },
};

export default RagPage;
