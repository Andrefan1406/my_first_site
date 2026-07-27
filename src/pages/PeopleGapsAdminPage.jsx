// Админ-панель «Пропуски в отчётах по людям»: показывает календарные дни
// (рабочие И выходные — суббота/воскресенье больше не исключаются), за
// которые начальник участка не сдал отчёт, и даёт администратору принять
// решение — скопировать данные с другого дня того же участка или
// подтвердить, что участок в этот день не работал. Никакого автоматического
// заполнения: пока решения нет, день так и остаётся "требует решения" и не
// участвует в аналитике (см. server/peopleGapDetection.js, server/syncPeople.js).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";

// PDF-бланк дат без отчёта для конкретного участка — печатная форма для
// начальника участка: он вписывает количество людей от руки за каждую дату.
// Только "missing" (нерешённые пропуски) — уже решённые дни в бланк не идут.
//
// jsPDF рендерит text() только стандартными PDF-шрифтами (Helvetica и т.п.),
// которые не содержат кириллических глифов — русский текст превращается в
// мусорные символы. Поэтому, как и в ConcreteChatPage.jsx/
// ConcreteDailyReportPage.js, строим обычную HTML-таблицу, рендерим её в
// картинку через html2canvas и вставляем в PDF как изображение — так текст
// берётся из реального рендера браузера со шрифтом, который кириллицу знает.
const buildMissingGapsPdf = async (site, missingGaps) => {
  const sorted = [...missingGaps].sort((a, b) => a.report_date.localeCompare(b.report_date));

  const rowsHtml = sorted
    .map(
      (gap) => `
        <tr>
          <td style="border:1px solid #000;padding:6px 12px;">${gap.report_date}</td>
          <td style="border:1px solid #000;padding:6px 12px;">&nbsp;</td>
        </tr>
      `
    )
    .join("");

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "700px";
  container.style.padding = "20px";
  container.style.background = "#fff";
  container.style.fontFamily = "Arial, sans-serif";
  container.style.color = "#000";
  container.innerHTML = `
    <h2 style="margin:0 0 14px;font-size:20px;">${site}</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr>
          <th style="border:1px solid #000;padding:6px 12px;text-align:left;background:#f0f0f0;">Дата</th>
          <th style="border:1px solid #000;padding:6px 12px;text-align:left;background:#f0f0f0;">Количество</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const usableHeight = pageHeight - margin * 2;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;

    while (heightLeft > 0) {
      position -= usableHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;
    }

    const today = new Date().toLocaleDateString("ru-RU");
    const fileSafeSite = site.replace(/[^\p{L}\p{N}]+/gu, "_");
    pdf.save(`пропуски_${fileSafeSite}_${today.replace(/\./g, "-")}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
};

const STATUS_LABELS = {
  missing: "Ждёт решения",
  resolved_copy: "Заполнено (копия)",
  resolved_no_report: "Не работал (подтверждено)",
  real: "Реальный отчёт",
};

const STATUS_COLORS = {
  missing: "#c0392b",
  resolved_copy: "#1a7f37",
  resolved_no_report: "#6e6e80",
};

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

const RowActions = ({ gap, candidates, loadingCandidates, onLoadCandidates, onDecide, onUndo, busy }) => {
  const [expanded, setExpanded] = useState(false);
  const [sourceDate, setSourceDate] = useState("");

  // Кандидатов теперь только два — ближайший реальный отчёт до пропуска и
  // ближайший после (см. GET /candidates), поэтому по умолчанию предлагаем
  // тот, что ДО (в духе LOCF — переносим последнее известное значение вперёд),
  // а если такого нет (пропуск в самом начале ряда участка) — тот, что после.
  const bestGuess = useMemo(() => {
    if (!candidates?.length) return "";
    const before = candidates.filter((c) => c.report_date < gap.report_date);
    return (before[0] || candidates[0]).report_date;
  }, [candidates, gap.report_date]);

  useEffect(() => {
    if (bestGuess && !sourceDate) setSourceDate(bestGuess);
  }, [bestGuess, sourceDate]);

  const isPending = gap.status === "missing";

  if (!isPending) {
    return (
      <div style={s.resolvedInfo}>
        <div>
          {gap.status === "resolved_copy"
            ? `Скопировано с ${gap.source_date}`
            : "Подтверждено: участок не работал"}
        </div>
        <div style={s.resolvedMeta}>
          {gap.decided_by} · {gap.decided_at?.replace("T", " ").slice(0, 16)}
        </div>
        <button style={s.linkBtn} disabled={busy} onClick={() => onUndo(gap)}>
          Отменить решение
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        style={s.actionBtn}
        onClick={() => {
          setExpanded(true);
          if (!candidates) onLoadCandidates(gap.site, gap.report_date);
        }}
      >
        Принять решение
      </button>
    );
  }

  return (
    <div style={s.decisionPanel}>
      {loadingCandidates ? (
        <div style={s.muted}>Загрузка дат...</div>
      ) : (
        <div style={s.decisionRow}>
          <select
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
            style={s.select}
          >
            {(candidates || []).map((c) => (
              <option key={c.report_date} value={c.report_date}>
                {c.report_date} ({c.total_headcount ?? 0} чел.)
              </option>
            ))}
          </select>
          <button
            style={s.confirmBtn}
            disabled={busy || !sourceDate}
            onClick={() => onDecide(gap, { action: "copy", source_date: sourceDate })}
          >
            Заполнить копией
          </button>
        </div>
      )}
      <button
        style={s.confirmBtnAlt}
        disabled={busy}
        onClick={() => onDecide(gap, { action: "confirm_no_report" })}
      >
        Участок не работал в этот день
      </button>
      <button style={s.linkBtn} onClick={() => setExpanded(false)}>
        Отмена
      </button>
    </div>
  );
};

const PeopleGapsAdminPage = () => {
  const navigate = useNavigate();
  const [gaps, setGaps] = useState([]);
  const [sites, setSites] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  const [filterSite, setFilterSite] = useState("");
  const [filterStatus, setFilterStatus] = useState("missing");

  // Ключ — "site|report_date": кандидаты на копирование зависят от конкретного
  // пропуска (ближайшие реальные даты вокруг него), а не только от участка.
  const [candidatesByGap, setCandidatesByGap] = useState({});
  const [loadingCandidatesFor, setLoadingCandidatesFor] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterSite) params.set("site", filterSite);
      if (filterStatus) params.set("status", filterStatus);
      const data = await apiFetch(`/api/admin/people-gaps?${params.toString()}`);
      setGaps(data.gaps || []);
      setSites(data.sites || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err.message || "Не удалось загрузить пропуски");
    } finally {
      setLoading(false);
    }
  }, [filterSite, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCandidates = async (site, reportDate) => {
    const key = `${site}|${reportDate}`;
    if (candidatesByGap[key]) return;
    setLoadingCandidatesFor(key);
    try {
      const params = new URLSearchParams({ site, report_date: reportDate });
      const data = await apiFetch(`/api/admin/people-gaps/candidates?${params.toString()}`);
      setCandidatesByGap((prev) => ({ ...prev, [key]: data.candidates || [] }));
    } catch (err) {
      setError(err.message || "Не удалось загрузить даты участка");
    } finally {
      setLoadingCandidatesFor(null);
    }
  };

  const handleDecide = async (gap, payload) => {
    const key = `${gap.site}|${gap.report_date}`;
    setBusyKey(key);
    setError("");
    try {
      await apiFetch(`/api/admin/people-gaps/decisions`, {
        method: "POST",
        body: JSON.stringify({ site: gap.site, report_date: gap.report_date, ...payload }),
      });
      await load();
    } catch (err) {
      setError(err.message || "Не удалось сохранить решение");
    } finally {
      setBusyKey(null);
    }
  };

  // Всегда экспортируем именно "missing" по выбранному участку — независимо
  // от текущего фильтра статуса на экране, т.к. смысл документа только в
  // ещё не решённых пропусках (см. buildMissingGapsPdf).
  const handleDownloadPdf = async () => {
    if (!filterSite) return;
    setPdfLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ site: filterSite, status: "missing" });
      const data = await apiFetch(`/api/admin/people-gaps?${params.toString()}`);
      const missingGaps = data.gaps || [];
      if (!missingGaps.length) {
        setError(`По участку «${filterSite}» нет нерешённых пропусков — скачивать нечего.`);
        return;
      }
      await buildMissingGapsPdf(filterSite, missingGaps);
    } catch (err) {
      setError(err.message || "Не удалось сформировать PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleUndo = async (gap) => {
    const key = `${gap.site}|${gap.report_date}`;
    setBusyKey(key);
    setError("");
    try {
      await apiFetch(`/api/admin/people-gaps/decisions`, {
        method: "DELETE",
        body: JSON.stringify({ site: gap.site, report_date: gap.report_date }),
      });
      await load();
    } catch (err) {
      setError(err.message || "Не удалось отменить решение");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Пропуски в отчётах по людям</h1>
      </div>

      {summary && (
        <div style={s.cards}>
          <div style={s.card}>
            <div style={s.cardLabel}>Ждут решения</div>
            <div style={{ ...s.cardValue, color: STATUS_COLORS.missing }}>{summary.pending}</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Заполнено копией</div>
            <div style={{ ...s.cardValue, color: STATUS_COLORS.resolved_copy }}>{summary.resolvedCopy}</div>
          </div>
          <div style={s.card}>
            <div style={s.cardLabel}>Подтверждено «не работал»</div>
            <div style={{ ...s.cardValue, color: STATUS_COLORS.resolved_no_report }}>{summary.resolvedNoReport}</div>
          </div>
        </div>
      )}

      <div style={s.filters}>
        <label>
          Участок:{" "}
          <select value={filterSite} onChange={(e) => setFilterSite(e.target.value)}>
            <option value="">Все</option>
            {sites.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
        </label>
        <label>
          Статус:{" "}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="missing">Ждут решения</option>
            <option value="resolved_copy">Заполнено копией</option>
            <option value="resolved_no_report">Подтверждено «не работал»</option>
            <option value="">Все статусы</option>
          </select>
        </label>
        <button onClick={load} disabled={loading}>Обновить</button>
        <button
          onClick={handleDownloadPdf}
          disabled={!filterSite || pdfLoading}
          title={!filterSite ? "Сначала выберите участок" : "Скачать список дней без отчёта для начальника участка"}
          style={s.pdfBtn}
        >
          {pdfLoading ? "Формирую PDF..." : "⬇ Скачать PDF для начальника участка"}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <p>Загрузка...</p>
      ) : gaps.length === 0 ? (
        <p style={s.muted}>Ничего не найдено по выбранным фильтрам.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Дата</th>
              <th style={s.th}>Участок</th>
              <th style={s.th}>Статус</th>
              <th style={s.th}>Решение</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => {
              const key = `${gap.site}|${gap.report_date}`;
              return (
                <tr key={key}>
                  <td style={s.td}>
                    {gap.report_date}
                    {!!gap.is_weekend && <span style={s.weekendTag}>вых.</span>}
                  </td>
                  <td style={s.td}>{gap.site}</td>
                  <td style={{ ...s.td, color: STATUS_COLORS[gap.status] || "#333", fontWeight: 600 }}>
                    {STATUS_LABELS[gap.status] || gap.status}
                  </td>
                  <td style={s.td}>
                    <RowActions
                      gap={gap}
                      candidates={candidatesByGap[key]}
                      loadingCandidates={loadingCandidatesFor === key}
                      onLoadCandidates={loadCandidates}
                      onDecide={handleDecide}
                      onUndo={handleUndo}
                      busy={busyKey === key}
                    />
                  </td>
                </tr>
              );
            })}
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

  cards: { display: "grid", gridTemplateColumns: "repeat(3, minmax(160px, 1fr))", gap: "16px", marginBottom: "20px" },
  card: { background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  cardLabel: { color: "#666", fontSize: "13px", marginBottom: "6px" },
  cardValue: { fontSize: "28px", fontWeight: 700 },

  filters: { display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" },
  pdfBtn: { background: "#8e44ad", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "13px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa" },
  td: { padding: "10px", borderBottom: "1px solid #eee", verticalAlign: "top" },

  actionBtn: { background: "#007bff", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
  decisionPanel: { display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" },
  decisionRow: { display: "flex", gap: "8px" },
  select: { flex: 1, padding: "4px" },
  confirmBtn: { background: "#1a7f37", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap" },
  confirmBtnAlt: { background: "#6e6e80", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "12px" },
  linkBtn: { background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "12px", textAlign: "left", padding: 0 },

  resolvedInfo: { fontSize: "13px" },
  resolvedMeta: { color: "#888", fontSize: "11px", margin: "2px 0 6px" },
  weekendTag: { marginLeft: "6px", fontSize: "10px", color: "#8e6f00", background: "#fff6d9", border: "1px solid #f0e0a0", borderRadius: "4px", padding: "1px 5px" },
};

export default PeopleGapsAdminPage;
