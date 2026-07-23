import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from "recharts";
import { TbCrane, TbFileTypePdf, TbCopy, TbCheck } from "react-icons/tb";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Отдельный бэкенд от Умной заявки: та работает через сторонний Python-сервис
// (rag_agent на Render), а /api/chat реализован в server/index.js этого репозитория
// и задеплоен как отдельный Render-сервис.
const CHAT_API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";
const MAX_HISTORY = 10;
const MAX_TEXTAREA_HEIGHT = 200;

const SUGGESTIONS = [
  "Сколько бетона отгружено в этом месяце?",
  "Покажи по объектам сколько отгружено за последнюю неделю",
  "Сколько всего заявок на раствор за всё время?",
];

const logConcreteChatUsage = (question) => {
  const user = getAuth().currentUser;
  addDoc(collection(db, "concrete_chat_usage"), {
    email: user?.email || null,
    uid: user?.uid || null,
    question,
    timestamp: serverTimestamp(),
  }).catch((err) => console.error("Не удалось залогировать использование чата по бетону:", err));
};

const SERIES_COLORS = ["#10a37f", "#378ADD", "#EF9F27", "#D4537E", "#7F77DD", "#E24B4A"];

// Большие числа — целыми и с разделителем разрядов, чтобы подписи не превращались в простыню цифр.
const formatValue = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return Math.abs(value) >= 1000
    ? Math.round(value).toLocaleString("ru-RU")
    : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
};

// Подписи над столбиками: разворачиваем вертикально, если числа слишком длинные,
// чтобы не наезжали друг на друга и оставались читаемыми.
const makeBarLabel = (rotate) => (props) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null) return null;
  const label = formatValue(value);
  if (!label) return null;
  const cx = x + width / 2;

  if (rotate) {
    return (
      <text x={cx} y={y - 6} fontSize={10} fill="#6e6e80" textAnchor="start" transform={`rotate(-90 ${cx} ${y - 6})`}>
        {label}
      </text>
    );
  }
  return (
    <text x={cx} y={y - 6} fontSize={11} fill="#6e6e80" textAnchor="middle">
      {label}
    </text>
  );
};

const ChartAnswer = ({ chart }) => {
  if (!chart?.data?.length) return null;
  const isBar = chart.chartType !== "line";
  const Chart = isBar ? BarChart : LineChart;
  const SeriesEl = isBar ? Bar : Line;

  const maxValue = Math.max(
    0,
    ...chart.data.flatMap((row) => (chart.series || []).map((s) => Math.abs(Number(row[s.key]) || 0)))
  );
  const rotateLabels = maxValue >= 10000;

  return (
    <ResponsiveContainer width="100%" height={rotateLabels ? 300 : 260}>
      <Chart data={chart.data} margin={{ top: rotateLabels ? 36 : 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey={chart.xKey} fontSize={12} stroke="#8e8ea0" />
        <YAxis fontSize={12} stroke="#8e8ea0" tickFormatter={formatValue} />
        <Tooltip formatter={(value) => formatValue(value)} />
        <Legend />
        {(chart.series || []).map((series, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          return (
            <SeriesEl key={series.key} dataKey={series.key} name={series.name || series.key} fill={color} stroke={color}>
              {isBar && <LabelList dataKey={series.key} content={makeBarLabel(rotateLabels)} />}
            </SeriesEl>
          );
        })}
      </Chart>
    </ResponsiveContainer>
  );
};

const TableAnswer = ({ table }) => {
  if (!table?.rows?.length) return null;
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            {table.columns.map((col) => (
              <th key={col} style={s.th}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={s.td}>{cell ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Avatar = ({ role }) =>
  role === "user" ? (
    <div style={s.avatarUser}>Вы</div>
  ) : (
    <div style={s.avatarAssistant}><TbCrane size={14} /></div>
  );

const pdfFileName = (text) => {
  const slug = (text || "аналитика-по-бетону")
    .slice(0, 60)
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "аналитика-по-бетону"}.pdf`;
};

const nodeToCanvas = (node) => html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });

const exportNodeToPdf = async (node, filename) => {
  const canvas = await nodeToCanvas(node);
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 10;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
  pdf.save(filename);
};

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось создать изображение"))), "image/png");
  });

const copyNodeAsImage = async (node) => {
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
    throw new Error("Браузер не поддерживает копирование изображений в буфер обмена");
  }
  const canvas = await nodeToCanvas(node);
  const blob = await canvasToBlob(canvas);
  await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// HTML-таблица + TSV-текст одновременно: Excel/Word подхватывают text/html и вставляют
// как настоящую редактируемую таблицу, остальные приложения — как текст с табуляцией.
const buildTableHtml = (table) => {
  const head = `<tr>${table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const body = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table border="1" cellspacing="0" cellpadding="4">${head}${body}</table>`;
};

const buildTableTsv = (table) => {
  const rows = [table.columns, ...table.rows];
  return rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");
};

const copyTableAsData = async (table) => {
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
    throw new Error("Браузер не поддерживает копирование таблиц в буфер обмена");
  }
  const item = new window.ClipboardItem({
    "text/html": new Blob([buildTableHtml(table)], { type: "text/html" }),
    "text/plain": new Blob([buildTableTsv(table)], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
};

const MessageRow = ({ message }) => {
  const exportRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [copyState, setCopyState] = useState("idle"); // idle | copying | done | error
  const isExportable = message.type === "table" || message.type === "chart";

  const handleExportPdf = async () => {
    if (!exportRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportNodeToPdf(exportRef.current, pdfFileName(message.title || message.text));
    } catch (err) {
      console.error("Не удалось сформировать PDF:", err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCopy = async () => {
    if (!exportRef.current || copyState === "copying") return;
    setCopyState("copying");
    try {
      if (message.type === "table") {
        await copyTableAsData(message.table);
      } else {
        await copyNodeAsImage(exportRef.current);
      }
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch (err) {
      console.error("Не удалось скопировать в буфер обмена:", err);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  const copyLabel = message.type === "table" ? "Копировать таблицу" : "Копировать картинку";

  return (
    <div style={s.row}>
      <Avatar role={message.role} />
      <div style={s.rowBody}>
        {message.role === "user" ? (
          <p style={s.userText}>{message.text}</p>
        ) : (
          <>
            {isExportable ? (
              <div ref={exportRef} style={s.exportArea}>
                {message.title ? (
                  <>
                    <h3 style={s.chartTitle}>{message.title}</h3>
                    {message.subtitle && <p style={s.chartSubtitle}>* {message.subtitle}</p>}
                  </>
                ) : (
                  message.text && <p style={s.assistantText}>{message.text}</p>
                )}
                {message.type === "table" && <TableAnswer table={message.table} />}
                {message.type === "chart" && <ChartAnswer chart={message.chart} />}
              </div>
            ) : (
              message.text && <p style={s.assistantText}>{message.text}</p>
            )}
            {isExportable && (
              <div style={s.actionsRow}>
                <button style={s.pdfBtn} onClick={handleExportPdf} disabled={exportingPdf}>
                  <TbFileTypePdf size={15} />
                  {exportingPdf ? "Формирую PDF..." : "Скачать PDF"}
                </button>
                <button style={s.pdfBtn} onClick={handleCopy} disabled={copyState === "copying"}>
                  {copyState === "done" ? <TbCheck size={15} /> : <TbCopy size={15} />}
                  {copyState === "copying" && "Копирую..."}
                  {copyState === "done" && "Скопировано"}
                  {copyState === "error" && "Не удалось скопировать"}
                  {copyState === "idle" && copyLabel}
                </button>
              </div>
            )}
            {message.sql && (
              <details style={s.sqlDetails}>
                <summary style={s.sqlSummary}>Показать SQL-запрос</summary>
                <code style={s.sqlCode}>{message.sql}</code>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const TypingRow = () => (
  <div style={s.row}>
    <Avatar role="assistant" />
    <div style={s.rowBody}>
      <div style={s.typingDots}>
        <span style={{ ...s.typingDot, animationDelay: "0ms" }} />
        <span style={{ ...s.typingDot, animationDelay: "150ms" }} />
        <span style={{ ...s.typingDot, animationDelay: "300ms" }} />
      </div>
    </div>
  </div>
);

const EmptyState = ({ onPick }) => (
  <div style={s.empty}>
    <div style={s.emptyAvatar}><TbCrane size={24} /></div>
    <h1 style={s.emptyTitle}>Аналитика по бетону</h1>
    <p style={s.emptyHint}>
      Спросите про заявки на бетон и раствор на естественном языке — например:
    </p>
    <div style={s.suggestions}>
      {SUGGESTIONS.map((q) => (
        <button key={q} style={s.suggestionChip} onClick={() => onPick(q)}>
          {q}
        </button>
      ))}
    </div>
  </div>
);

const ConcreteChatPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  const sendQuestion = async (question) => {
    if (!question || loading) return;

    const userMessage = { role: "user", text: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    requestAnimationFrame(resizeTextarea);
    setError("");
    setLoading(true);
    logConcreteChatUsage(question);

    try {
      const history = nextMessages.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const res = await fetch(`${CHAT_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Ошибка сервера (${res.status})`);
      }

      const answer = data.answer || {};
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: answer.text || "",
          title: answer.title || "",
          subtitle: answer.subtitle || "",
          type: answer.type || "text",
          table: answer.table,
          chart: answer.chart,
          sql: data.sql,
        },
      ]);
    } catch (err) {
      setError(err.message || "Не удалось получить ответ. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendQuestion(input.trim());

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={s.page}>
      <style>{`
        @keyframes concreteChatBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <header style={s.header}>
        <button onClick={() => navigate("/")} style={s.back}>←</button>
        <span style={s.headerTitle}>Аналитика по бетону</span>
      </header>

      <div style={s.scrollArea}>
        <div style={s.column}>
          {messages.length === 0 ? (
            <EmptyState onPick={sendQuestion} />
          ) : (
            messages.map((m, i) => <MessageRow key={i} message={m} />)
          )}
          {loading && <TypingRow />}
          <div ref={listEndRef} />
        </div>
      </div>

      <div style={s.composerWrap}>
        <div style={s.column}>
          {error && <div style={s.error}>{error}</div>}
          <div style={s.composer}>
            <textarea
              ref={textareaRef}
              style={s.textarea}
              rows={1}
              placeholder="Спросите про заявки на бетон..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              style={{
                ...s.sendBtn,
                ...((loading || !input.trim()) ? s.sendBtnDisabled : null),
              }}
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Отправить"
            >
              ↑
            </button>
          </div>
          <p style={s.disclaimer}>Ответы формирует ИИ — сверяйтесь по SQL-запросу под ответом.</p>
        </div>
      </div>
    </div>
  );
};

const s = {
  page: { display: "flex", flexDirection: "column", height: "100vh", background: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },

  header: { flexShrink: 0, display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", borderBottom: "1px solid #eceef0" },
  back: { background: "none", border: "none", color: "#6e6e80", cursor: "pointer", fontSize: "20px", padding: "4px 8px", lineHeight: 1, borderRadius: "6px" },
  headerTitle: { fontSize: "15px", fontWeight: 600, color: "#0d0d0d" },

  scrollArea: { flex: 1, overflowY: "auto" },
  column: { maxWidth: "720px", margin: "0 auto", padding: "0 20px" },

  empty: { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "18vh 0 40px" },
  emptyAvatar: { width: "48px", height: "48px", borderRadius: "50%", background: "#10a37f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "18px", marginBottom: "16px" },
  emptyTitle: { fontSize: "26px", fontWeight: 600, color: "#0d0d0d", margin: "0 0 10px" },
  emptyHint: { color: "#6e6e80", fontSize: "14px", margin: "0 0 22px" },
  suggestions: { display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "440px" },
  suggestionChip: { textAlign: "left", background: "#f7f7f8", border: "1px solid #eceef0", borderRadius: "12px", padding: "12px 14px", fontSize: "14px", color: "#0d0d0d", cursor: "pointer" },

  row: { display: "flex", gap: "14px", padding: "18px 0" },
  rowBody: { flex: 1, minWidth: 0, paddingTop: "4px" },
  avatarUser: { flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#e5e5e8", color: "#444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 600 },
  avatarAssistant: { flexShrink: 0, width: "28px", height: "28px", borderRadius: "50%", background: "#10a37f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700 },
  userText: { margin: 0, color: "#0d0d0d", fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  assistantText: { margin: "0 0 4px", color: "#0d0d0d", fontSize: "15px", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  chartTitle: { margin: "0 0 2px", color: "#0d0d0d", fontSize: "16px", fontWeight: 600 },
  chartSubtitle: { margin: "0 0 4px", color: "#9a9aa5", fontSize: "12px", fontStyle: "italic" },

  typingDots: { display: "flex", gap: "4px", padding: "6px 0" },
  typingDot: { width: "6px", height: "6px", borderRadius: "50%", background: "#8e8ea0", animation: "concreteChatBounce 1.2s infinite ease-in-out" },

  tableWrap: { overflowX: "auto", marginTop: "8px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { textAlign: "left", color: "#6e6e80", fontWeight: 600, padding: "6px 12px 6px 0", borderBottom: "1px solid #eceef0", whiteSpace: "nowrap" },
  td: { padding: "6px 12px 6px 0", color: "#0d0d0d", borderBottom: "1px solid #f4f4f5", whiteSpace: "nowrap" },

  exportArea: { background: "#fff" },
  actionsRow: { display: "flex", gap: "8px", marginTop: "10px" },
  pdfBtn: { display: "inline-flex", alignItems: "center", gap: "6px", background: "#f7f7f8", border: "1px solid #eceef0", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", color: "#444", cursor: "pointer" },

  sqlDetails: { marginTop: "10px" },
  sqlSummary: { fontSize: "12px", color: "#8e8ea0", cursor: "pointer" },
  sqlCode: { display: "block", marginTop: "6px", padding: "10px 12px", background: "#f7f7f8", border: "1px solid #eceef0", borderRadius: "8px", fontSize: "12px", color: "#444", whiteSpace: "pre-wrap", wordBreak: "break-word" },

  error: { margin: "10px 0", background: "#fff0f0", color: "#c00", borderRadius: "10px", padding: "10px 14px", fontSize: "13px" },

  composerWrap: { flexShrink: 0, borderTop: "1px solid #eceef0", padding: "14px 0 10px", background: "#fff" },
  composer: { display: "flex", alignItems: "flex-end", gap: "8px", border: "1px solid #d9d9e3", borderRadius: "26px", padding: "10px 10px 10px 18px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" },
  textarea: { flex: 1, border: "none", outline: "none", resize: "none", fontSize: "15px", lineHeight: 1.5, fontFamily: "inherit", maxHeight: "200px", background: "transparent" },
  sendBtn: { flexShrink: 0, width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "#0d0d0d", color: "#fff", fontSize: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { background: "#eceef0", color: "#b4b4bd", cursor: "default" },
  disclaimer: { textAlign: "center", color: "#8e8ea0", fontSize: "11px", margin: "10px 0 0" },
};

export default ConcreteChatPage;
