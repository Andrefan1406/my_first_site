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

const WEEKDAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// Считаем день недели из строки даты напрямую через UTC, не полагаясь на
// часовой пояс браузера — тот же приём, что и в server/peopleGapDetection.js.
const weekdayName = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// PDF-бланк дат без отчёта для конкретного участка — печатная форма для
// начальника участка: он вписывает количество людей от руки за каждую дату.
// Только "missing" (нерешённые пропуски) — уже решённые дни в бланк не идут.
// Суббота/воскресенье выделены подписью дня недели и заливкой строки, чтобы
// начальник участка сразу видел, какие пропуски — выходные (см. is_weekend
// из people_report_gaps — теперь выходные тоже пропуски, а не норма).
//
// jsPDF рендерит text() только стандартными PDF-шрифтами (Helvetica и т.п.),
// которые не содержат кириллических глифов — русский текст превращается в
// мусорные символы. Поэтому, как и в ConcreteChatPage.jsx/
// ConcreteDailyReportPage.js, строим обычную HTML-таблицу, рендерим её в
// картинку через html2canvas и вставляем в PDF как изображение — так текст
// берётся из реального рендера браузера со шрифтом, который кириллицу знает.
// Сколько строк дат помещается на странице при текущей вёрстке (шрифт 14px,
// паддинг ячеек 6/12px, отступы листа 15мм) — подобрано опытным путём.
// На первом листе меньше, потому что там ещё название участка и шапка
// таблицы; на остальных листах только повторённая шапка таблицы.
const FIRST_PAGE_ROWS = 34;
const OTHER_PAGE_ROWS = 35;

const buildGapRowHtml = (gap) => {
  const rowBg = gap.is_weekend ? "background:#fdf3d0;" : "";
  const dayLabel = weekdayName(gap.report_date);
  const dateCell = gap.is_weekend
    ? `${gap.report_date} <strong>(${dayLabel}, выходной)</strong>`
    : `${gap.report_date} (${dayLabel})`;
  return `
    <tr style="${rowBg}">
      <td style="border:1px solid #000;padding:6px 12px;">${dateCell}</td>
      <td style="border:1px solid #000;padding:6px 12px;">&nbsp;</td>
    </tr>
  `;
};

const renderPageToCanvas = async (rowsHtml, siteTitle) => {
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
    ${siteTitle ? `<h2 style="margin:0 0 14px;font-size:20px;">${siteTitle}</h2>` : ""}
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
    return await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
  } finally {
    document.body.removeChild(container);
  }
};

// PDF-бланк дат без отчёта для конкретного участка — печатная форма для
// начальника участка: он вписывает количество людей от руки за каждую дату.
// Только "missing" (нерешённые пропуски) — уже решённые дни в бланк не идут.
// Суббота/воскресенье выделены подписью дня недели и заливкой строки, чтобы
// начальник участка сразу видел, какие пропуски — выходные (см. is_weekend
// из people_report_gaps — теперь выходные тоже пропуски, а не норма).
//
// jsPDF рендерит text() только стандартными PDF-шрифтами (Helvetica и т.п.),
// которые не содержат кириллических глифов — русский текст превращается в
// мусорные символы. Поэтому, как и в ConcreteChatPage.jsx/
// ConcreteDailyReportPage.js, строим обычную HTML-таблицу и рендерим её в
// картинку через html2canvas — так текст берётся из реального рендера
// браузера со шрифтом, который кириллицу знает.
//
// Каждая страница рендерится ОТДЕЛЬНЫМ html2canvas-вызовом с ограниченным
// числом целых строк (FIRST_PAGE_ROWS/OTHER_PAGE_ROWS), а не одной большой
// картинкой, порезанной по пикселям задним числом — раньше из-за этого
// строка могла попасть ровно на границу страниц и обрезаться посередине.
const buildMissingGapsPdf = async (site, missingGaps) => {
  const sorted = [...missingGaps].sort((a, b) => a.report_date.localeCompare(b.report_date));

  const pageChunks = [];
  for (let i = 0; i < sorted.length; ) {
    const isFirstPage = pageChunks.length === 0;
    const size = isFirstPage ? FIRST_PAGE_ROWS : OTHER_PAGE_ROWS;
    pageChunks.push({ rows: sorted.slice(i, i + size), showTitle: isFirstPage });
    i += size;
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const imgWidth = pageWidth - margin * 2;

  for (let p = 0; p < pageChunks.length; p++) {
    const { rows, showTitle } = pageChunks[p];
    const rowsHtml = rows.map(buildGapRowHtml).join("");
    const canvas = await renderPageToCanvas(rowsHtml, showTitle ? site : null);
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (p > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, imgWidth, imgHeight);
  }

  const today = new Date().toLocaleDateString("ru-RU");
  const fileSafeSite = site.replace(/[^\p{L}\p{N}]+/gu, "_");
  pdf.save(`пропуски_${fileSafeSite}_${today.replace(/\./g, "-")}.pdf`);
};

const STATUS_LABELS = {
  missing: "Ждёт решения",
  resolved_copy: "Заполнено (копия)",
  resolved_no_report: "Не работал (подтверждено)",
  resolved_completed: "Работы завершены",
  inactive: "Не ожидается (работы завершены ранее)",
  real: "Реальный отчёт",
};

const STATUS_COLORS = {
  missing: "#c0392b",
  resolved_copy: "#1a7f37",
  resolved_no_report: "#6e6e80",
  resolved_completed: "#2c5f8a",
  inactive: "#aaaaaa",
};

// Текст для панели "уже решено" — показывается только для статусов,
// начинающихся с 'resolved_' (см. RowActions). 'inactive' и прочие статусы
// в неё не попадают, т.к. сами по себе не являются решением — это
// следствие более раннего решения 'work_completed'.
const RESOLVED_TEXT = {
  resolved_copy: (gap) => `Скопировано с ${gap.source_date}`,
  resolved_no_report: () => "Подтверждено: участок не работал",
  resolved_completed: () => "Отмечено: работы на участке завершены",
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
  const isResolved = gap.status.startsWith("resolved_");

  if (isResolved) {
    return (
      <div style={s.resolvedInfo}>
        <div>{(RESOLVED_TEXT[gap.status] || (() => gap.status))(gap)}</div>
        <div style={s.resolvedMeta}>
          {gap.decided_by} · {gap.decided_at?.replace("T", " ").slice(0, 16)}
        </div>
        <button style={s.linkBtn} disabled={busy} onClick={() => onUndo(gap)}>
          Отменить решение
        </button>
      </div>
    );
  }

  if (gap.status === "inactive") {
    return <div style={s.muted}>Не ожидается — работы на участке завершены ранее</div>;
  }

  if (!isPending) {
    // Прочие статусы (например 'real' при фильтре "Все статусы") — решение не нужно.
    return <span style={s.muted}>—</span>;
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
      <button
        style={s.confirmBtnCompleted}
        disabled={busy}
        onClick={() => onDecide(gap, { action: "work_completed" })}
        title="Все последующие дни этого участка перестанут быть пропусками, пока не появится новый реальный отчёт"
      >
        Работы завершены
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

  // Сводка считается из уже загруженного gaps на клиенте (а не хранится
  // отдельным стейтом с сервера) — так она остаётся точной и после точечных
  // локальных обновлений строк в handleDecide/handleUndo, без лишнего
  // перезапроса всего списка.
  const summary = useMemo(
    () => ({
      total: gaps.length,
      pending: gaps.filter((r) => r.status === "missing").length,
      resolvedCopy: gaps.filter((r) => r.status === "resolved_copy").length,
      resolvedNoReport: gaps.filter((r) => r.status === "resolved_no_report").length,
      resolvedCompleted: gaps.filter((r) => r.status === "resolved_completed").length,
    }),
    [gaps]
  );

  // silent=true — фоновое обновление данных БЕЗ показа "Загрузка..." вместо
  // таблицы: если убрать таблицу на время запроса, её место в DOM схлопывается
  // и страница визуально "улетает" вверх (та же проблема, которую убирали
  // точечными обновлениями строк для copy/confirm_no_report — здесь она нужна
  // для work_completed, где локальным обновлением одной строки не обойтись).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterSite) params.set("site", filterSite);
      if (filterStatus) params.set("status", filterStatus);
      const data = await apiFetch(`/api/admin/people-gaps?${params.toString()}`);
      setGaps(data.gaps || []);
      setSites(data.sites || []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить пропуски");
    } finally {
      if (!silent) setLoading(false);
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

  // 'copy' и 'confirm_no_report' решают ровно один день — после ответа
  // сервера просто обновляем эту строку на месте, без перезагрузки всего
  // списка, чтобы таблица не "улетала" и не теряла место, где только что
  // работал администратор. 'work_completed' — исключение: оно может менять
  // статус МНОГИХ последующих дней участка (real -> missing -> inactive),
  // поэтому для него нужен полный перезапрос списка.
  const handleDecide = async (gap, payload) => {
    const key = `${gap.site}|${gap.report_date}`;
    setBusyKey(key);
    setError("");
    try {
      const data = await apiFetch(`/api/admin/people-gaps/decisions`, {
        method: "POST",
        body: JSON.stringify({ site: gap.site, report_date: gap.report_date, ...payload }),
      });
      if (payload.action === "work_completed") {
        await load(true);
      } else if (data.gap) {
        setGaps((prev) => prev.map((g) => (g.site === gap.site && g.report_date === gap.report_date ? data.gap : g)));
      }
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

  // Отмена 'resolved_completed' тоже может затронуть много последующих дней
  // (они снова становятся 'missing') — та же логика, что и в handleDecide:
  // для неё полный перезапрос, для остальных — точечное обновление строки.
  const handleUndo = async (gap) => {
    const key = `${gap.site}|${gap.report_date}`;
    const wasCompleted = gap.status === "resolved_completed";
    setBusyKey(key);
    setError("");
    try {
      const data = await apiFetch(`/api/admin/people-gaps/decisions`, {
        method: "DELETE",
        body: JSON.stringify({ site: gap.site, report_date: gap.report_date }),
      });
      if (wasCompleted) {
        await load(true);
      } else if (data.gap) {
        setGaps((prev) => prev.map((g) => (g.site === gap.site && g.report_date === gap.report_date ? data.gap : g)));
      }
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
        <div style={s.card}>
          <div style={s.cardLabel}>Работы завершены</div>
          <div style={{ ...s.cardValue, color: STATUS_COLORS.resolved_completed }}>{summary.resolvedCompleted}</div>
        </div>
      </div>

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
            <option value="resolved_completed">Работы завершены</option>
            <option value="">Все статусы</option>
          </select>
        </label>
        <button onClick={() => load()} disabled={loading}>Обновить</button>
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

  cards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: "16px", marginBottom: "20px" },
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
  confirmBtnCompleted: { background: "#2c5f8a", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "12px" },
  linkBtn: { background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "12px", textAlign: "left", padding: 0 },

  resolvedInfo: { fontSize: "13px" },
  resolvedMeta: { color: "#888", fontSize: "11px", margin: "2px 0 6px" },
  weekendTag: { marginLeft: "6px", fontSize: "10px", color: "#8e6f00", background: "#fff6d9", border: "1px solid #f0e0a0", borderRadius: "4px", padding: "1px 5px" },
};

export default PeopleGapsAdminPage;
