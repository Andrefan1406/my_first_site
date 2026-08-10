// Админ-панель «Пропуски в отчётах по людям»: показывает календарные дни
// (рабочие И выходные — суббота/воскресенье больше не исключаются), за
// которые начальник участка не сдал отчёт, и даёт администратору принять
// решение — скопировать данные с другого дня того же участка или
// подтвердить, что участок в этот день не работал. Никакого автоматического
// заполнения: пока решения нет, день так и остаётся "требует решения" и не
// участвует в аналитике (см. server/peopleGapDetection.js, server/syncPeople.js).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
// Разбивает отсортированные пропуски ОДНОГО участка на страницы по
// FIRST_PAGE_ROWS/OTHER_PAGE_ROWS — первая страница получает заголовок
// (название участка), остальные — нет (только повторённая шапка таблицы).
const buildSitePageChunks = (gaps) => {
  const sorted = [...gaps].sort((a, b) => a.report_date.localeCompare(b.report_date));
  const chunks = [];
  for (let i = 0; i < sorted.length; ) {
    const isFirstPage = chunks.length === 0;
    const size = isFirstPage ? FIRST_PAGE_ROWS : OTHER_PAGE_ROWS;
    chunks.push({ rows: sorted.slice(i, i + size), showTitle: isFirstPage });
    i += size;
  }
  return chunks;
};

// Каждая страница рендерится ОТДЕЛЬНЫМ html2canvas-вызовом с ограниченным
// числом целых строк (FIRST_PAGE_ROWS/OTHER_PAGE_ROWS), а не одной большой
// картинкой, порезанной по пикселям задним числом — раньше из-за этого
// строка могла попасть ровно на границу страниц и обрезаться посередине.
//
// siteGroups — [{ site, gaps }, ...]: при нескольких выбранных участках
// разделы идут один за другим в одном PDF, каждый со своим заголовком —
// новый участок всегда начинается с новой страницы.
const buildMissingGapsPdf = async (siteGroups) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 15;
  const imgWidth = pageWidth - margin * 2;

  let isFirstPageOverall = true;

  for (const { site, gaps } of siteGroups) {
    const pageChunks = buildSitePageChunks(gaps);

    for (const { rows, showTitle } of pageChunks) {
      const rowsHtml = rows.map(buildGapRowHtml).join("");
      const canvas = await renderPageToCanvas(rowsHtml, showTitle ? site : null);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (!isFirstPageOverall) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, imgWidth, imgHeight);
      isFirstPageOverall = false;
    }
  }

  const today = new Date().toLocaleDateString("ru-RU");
  const siteNames = siteGroups.map((g) => g.site);
  const fileLabel = siteNames.length <= 3
    ? siteNames.join("_")
    : `${siteNames.length}_участков`;
  const fileSafeLabel = fileLabel.replace(/[^\p{L}\p{N}_]+/gu, "_");
  pdf.save(`пропуски_${fileSafeLabel}_${today.replace(/\./g, "-")}.pdf`);
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

  // Множественный выбор участков (см. дропдаун с чекбоксами ниже) — пустой
  // массив означает "Все".
  const [filterSite, setFilterSite] = useState([]);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef(null);
  const [filterStatus, setFilterStatus] = useState("missing");

  useEffect(() => {
    if (!siteDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(e.target)) {
        setSiteDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [siteDropdownOpen]);

  // Ключ — "site|report_date": кандидаты на копирование зависят от конкретного
  // пропуска (ближайшие реальные даты вокруг него), а не только от участка.
  const [candidatesByGap, setCandidatesByGap] = useState({});
  const [loadingCandidatesFor, setLoadingCandidatesFor] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [resyncLoading, setResyncLoading] = useState(false);

  // Выбор строк для массового применения решения (см. handleBulkApply ниже) —
  // только для status === 'missing', т.к. смысл кнопок "применить к выбранным"
  // именно в быстрой обработке пачки ещё нерешённых пропусков.
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Последняя строка, по которой кликнули (не через shift) — опорная точка
  // для диапазона при следующем shift-клике (см. toggleSelected ниже).
  const [lastSelectedKey, setLastSelectedKey] = useState(null);

  // Ручной выбор даты-донора для массового копирования (в отличие от кнопки
  // "ближайший отчёт", которая на сервере сама подбирает дату КАЖДОМУ
  // пропуску отдельно) — доступен только когда все выделенные строки
  // относятся к одному участку, т.к. дата-донор имеет смысл в рамках одного
  // участка. Список дат подгружается заново при смене этого единственного
  // участка.
  const [bulkSourceOptions, setBulkSourceOptions] = useState([]);
  const [bulkSourceDate, setBulkSourceDate] = useState("");
  const [bulkSourceLoading, setBulkSourceLoading] = useState(false);

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
      filterSite.forEach((site) => params.append("site", site));
      if (filterStatus) params.set("status", filterStatus);
      const data = await apiFetch(`/api/admin/people-gaps?${params.toString()}`);
      setGaps(data.gaps || []);
      setSites(data.sites || []);
      setSelected(new Set());
    } catch (err) {
      setError(err.message || "Не удалось загрузить пропуски");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterSite, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // Ручной внеплановый синк отчётов по людям из Google Таблицы (обычно раз
  // в 2 часа, см. PEOPLE_SYNC_CRON) — нужен, когда кто-то только что заполнил
  // отчёт и не хочет ждать планового синка, чтобы увидеть результат здесь.
  const handleResync = async () => {
    setResyncLoading(true);
    setError("");
    try {
      await apiFetch(`/api/admin/people-gaps/resync`, { method: "POST" });
      await load(true);
    } catch (err) {
      setError(err.message || "Не удалось пересинхронизировать отчёты по людям");
    } finally {
      setResyncLoading(false);
    }
  };

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

  // Всегда экспортируем именно "missing" по выбранным участкам — независимо
  // от текущего фильтра статуса на экране, т.к. смысл документа только в
  // ещё не решённых пропусках (см. buildMissingGapsPdf). Один запрос на все
  // выбранные участки сразу (сервер поддерживает несколько ?site=...),
  // дальше группируем по участку на клиенте — так в PDF разделы участков
  // идут один за другим, каждый со своим заголовком.
  const handleDownloadPdf = async () => {
    if (!filterSite.length) return;
    setPdfLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      filterSite.forEach((site) => params.append("site", site));
      params.set("status", "missing");
      const data = await apiFetch(`/api/admin/people-gaps?${params.toString()}`);
      const allGaps = data.gaps || [];
      if (!allGaps.length) {
        setError("По выбранным участкам нет нерешённых пропусков — скачивать нечего.");
        return;
      }

      const bySite = new Map();
      for (const gap of allGaps) {
        if (!bySite.has(gap.site)) bySite.set(gap.site, []);
        bySite.get(gap.site).push(gap);
      }
      const groups = [...filterSite]
        .sort((a, b) => a.localeCompare(b, "ru"))
        .filter((site) => bySite.has(site))
        .map((site) => ({ site, gaps: bySite.get(site) }));

      await buildMissingGapsPdf(groups);
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

  const selectableGaps = useMemo(() => gaps.filter((g) => g.status === "missing"), [gaps]);
  const allSelectableChecked = selectableGaps.length > 0 && selectableGaps.every((g) => selected.has(`${g.site}|${g.report_date}`));

  // Единственный участок среди выделенных строк — null, если выделение
  // пустое или охватывает несколько разных участков (тогда ручной выбор
  // даты-донора не показывается, см. bulkSourceOptions выше).
  const bulkSingleSite = useMemo(() => {
    const sitesInSelection = new Set(
      gaps.filter((g) => selected.has(`${g.site}|${g.report_date}`)).map((g) => g.site)
    );
    return sitesInSelection.size === 1 ? [...sitesInSelection][0] : null;
  }, [gaps, selected]);

  useEffect(() => {
    if (!bulkSingleSite) {
      setBulkSourceOptions([]);
      setBulkSourceDate("");
      return;
    }
    let cancelled = false;
    setBulkSourceLoading(true);
    apiFetch(`/api/admin/people-gaps/site-report-dates?site=${encodeURIComponent(bulkSingleSite)}`)
      .then((data) => {
        if (cancelled) return;
        const dates = data.dates || [];
        setBulkSourceOptions(dates);
        setBulkSourceDate(dates[0]?.report_date || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Не удалось загрузить даты участка");
      })
      .finally(() => {
        if (!cancelled) setBulkSourceLoading(false);
      });
    return () => { cancelled = true; };
  }, [bulkSingleSite]);

  // shiftKey=true и есть опорная строка от предыдущего клика — выделяем
  // диапазон между опорной строкой и текущей (по порядку отображения среди
  // ВЫБираемых строк, т.е. status === 'missing' — так же, как shift-выбор
  // работает в проводнике/почте). Обычный клик — просто переключает одну
  // строку и запоминает её как новую опорную для следующего shift-клика.
  const toggleSelected = (key, shiftKey) => {
    if (shiftKey && lastSelectedKey) {
      const orderedKeys = selectableGaps.map((g) => `${g.site}|${g.report_date}`);
      const fromIdx = orderedKeys.indexOf(lastSelectedKey);
      const toIdx = orderedKeys.indexOf(key);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
        const rangeKeys = orderedKeys.slice(start, end + 1);
        setSelected((prev) => {
          const next = new Set(prev);
          rangeKeys.forEach((k) => next.add(k));
          return next;
        });
        setLastSelectedKey(key);
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastSelectedKey(key);
  };

  const toggleSelectAll = () => {
    setSelected(() => {
      if (allSelectableChecked) return new Set();
      return new Set(selectableGaps.map((g) => `${g.site}|${g.report_date}`));
    });
  };

  // Применяет один action сразу ко всем выбранным пропускам одним запросом
  // (см. POST /decisions/bulk на сервере). Для action='copy' есть два режима:
  // если sourceDate не передан — сервер сам подбирает его на каждый пропуск
  // отдельно (ближайший реальный отчёт до дня, иначе после), как и bestGuess
  // по умолчанию в панели решения одиночной строки (см. RowActions выше);
  // если sourceDate передан явно (админ выбрал дату в выпадающем списке над
  // кнопкой) — та же самая дата применяется ко всем выбранным строкам.
  const handleBulkApply = async (action, sourceDate) => {
    const items = gaps
      .filter((g) => selected.has(`${g.site}|${g.report_date}`))
      .map((g) => ({ site: g.site, report_date: g.report_date }));
    if (!items.length) return;

    setBulkBusy(true);
    setError("");
    try {
      const data = await apiFetch(`/api/admin/people-gaps/decisions/bulk`, {
        method: "POST",
        body: JSON.stringify({ items, action, ...(sourceDate ? { source_date: sourceDate } : {}) }),
      });
      await load(true);
      if (data.errors?.length) {
        setError(
          `Применено: ${data.gaps.length} из ${items.length}. Не удалось (${data.errors.length}): ` +
            data.errors.map((e) => `${e.site} ${e.report_date} — ${e.error}`).join("; ")
        );
      }
    } catch (err) {
      setError(err.message || "Не удалось применить массовое решение");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/admin")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Пропуски в отчётах по людям</h1>
        <button onClick={() => navigate("/admin/users")} style={s.usersLink}>
          Управление пользователями →
        </button>
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
        <div style={s.multiSelectWrap} ref={siteDropdownRef}>
          <span style={s.filterLabel}>Участок:</span>
          <button
            type="button"
            style={s.multiSelectButton}
            onClick={() => setSiteDropdownOpen((open) => !open)}
          >
            {filterSite.length === 0 ? "Все" : `Выбрано: ${filterSite.length}`} ▾
          </button>
          {siteDropdownOpen && (
            <div style={s.multiSelectPanel}>
              <div style={s.multiSelectActions}>
                <button type="button" style={s.linkBtn} onClick={() => setFilterSite(sites)}>
                  Выбрать все
                </button>
                <button type="button" style={s.linkBtn} onClick={() => setFilterSite([])}>
                  Сбросить
                </button>
              </div>
              {sites.map((site) => (
                <label key={site} style={s.multiSelectOption}>
                  <input
                    type="checkbox"
                    checked={filterSite.includes(site)}
                    onChange={() =>
                      setFilterSite((prev) =>
                        prev.includes(site) ? prev.filter((s2) => s2 !== site) : [...prev, site]
                      )
                    }
                  />
                  {site}
                </label>
              ))}
            </div>
          )}
        </div>
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
          onClick={handleResync}
          disabled={resyncLoading}
          title="Заново скачать отчёты по людям из Google Таблицы, не дожидаясь планового синка (раз в 2 часа)"
          style={s.resyncBtn}
        >
          {resyncLoading ? "Синхронизирую..." : "⟳ Пересинхронизировать"}
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={!filterSite.length || pdfLoading}
          title={!filterSite.length ? "Сначала выберите один или несколько участков" : "Скачать список дней без отчёта для начальника участка"}
          style={s.pdfBtn}
        >
          {pdfLoading ? "Формирую PDF..." : "⬇ Скачать PDF для начальника участка"}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {selected.size > 0 && (
        <div style={s.bulkBar}>
          <span style={s.bulkCount}>Выбрано: {selected.size}</span>
          <button
            style={s.confirmBtn}
            disabled={bulkBusy}
            onClick={() => handleBulkApply("copy")}
            title="Для каждого пропуска сервер сам подберёт ближайший реальный отчёт того же участка"
          >
            Скопировать с ближайшего отчёта
          </button>
          {bulkSingleSite ? (
            <span style={s.bulkCopyPicker}>
              <select
                value={bulkSourceDate}
                onChange={(e) => setBulkSourceDate(e.target.value)}
                disabled={bulkSourceLoading || !bulkSourceOptions.length}
                style={{ ...s.select, flex: "0 0 190px" }}
              >
                {bulkSourceLoading && <option value="">Загрузка дат...</option>}
                {!bulkSourceLoading && !bulkSourceOptions.length && <option value="">Нет реальных отчётов</option>}
                {bulkSourceOptions.map((c) => (
                  <option key={c.report_date} value={c.report_date}>
                    {c.report_date} ({c.total_headcount ?? 0} чел.)
                  </option>
                ))}
              </select>
              <button
                style={s.confirmBtn}
                disabled={bulkBusy || !bulkSourceDate}
                onClick={() => handleBulkApply("copy", bulkSourceDate)}
                title="Применить одну и ту же дату-донора ко всем выбранным пропускам этого участка"
              >
                Заполнить выбранной копией
              </button>
            </span>
          ) : (
            selected.size > 1 && (
              <span style={s.muted} title="Ручной выбор даты-донора доступен только когда выбраны пропуски одного участка">
                Чтобы выбрать конкретную дату — оставьте пропуски только одного участка
              </span>
            )
          )}
          <button style={s.confirmBtnAlt} disabled={bulkBusy} onClick={() => handleBulkApply("confirm_no_report")}>
            Участок не работал
          </button>
          <button
            style={s.confirmBtnCompleted}
            disabled={bulkBusy}
            onClick={() => handleBulkApply("work_completed")}
            title="Все последующие дни этих участков перестанут быть пропусками, пока не появится новый реальный отчёт"
          >
            Работы завершены
          </button>
          <button style={s.linkBtn} disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            Снять выделение
          </button>
          {bulkBusy && <span style={s.muted}>Применяю...</span>}
        </div>
      )}

      {loading ? (
        <p>Загрузка...</p>
      ) : gaps.length === 0 ? (
        <p style={s.muted}>Ничего не найдено по выбранным фильтрам.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>
                {selectableGaps.length > 0 && (
                  <input type="checkbox" checked={allSelectableChecked} onChange={toggleSelectAll} style={s.checkbox} />
                )}
              </th>
              <th style={s.th}>Дата</th>
              <th style={s.th}>Участок</th>
              <th style={s.th}>Статус</th>
              <th style={s.th}>Решение</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => {
              const key = `${gap.site}|${gap.report_date}`;
              const selectable = gap.status === "missing";
              // Клик в любом месте строки ставит/снимает галочку — кроме
              // кликов по самому чекбоксу (у него свой обработчик, иначе
              // клик обработался бы дважды) и по интерактивным элементам
              // колонки "Решение" (кнопки/список выбора даты), чтобы работа
              // с панелью принятия решения не сбивала выделение строки.
              const handleRowClick = selectable
                ? (e) => {
                    if (e.target.closest("input, button, select, a, textarea")) return;
                    toggleSelected(key, e.shiftKey);
                  }
                : undefined;
              return (
                <tr key={key} onClick={handleRowClick} style={selectable ? s.trSelectable : undefined}>
                  <td style={s.td}>
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={(e) => toggleSelected(key, e.nativeEvent.shiftKey)}
                        style={s.checkbox}
                      />
                    )}
                  </td>
                  <td style={s.td}>
                    {gap.report_date}
                    {!!gap.is_weekend && (
                      <span style={s.weekendTag}>
                        {weekdayName(gap.report_date) === "Сб" ? "сб." : "вск."}
                      </span>
                    )}
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
  usersLink: { marginLeft: "auto", background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "13px", fontWeight: 500 },

  cards: { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: "16px", marginBottom: "20px" },
  card: { background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  cardLabel: { color: "#666", fontSize: "13px", marginBottom: "6px" },
  cardValue: { fontSize: "28px", fontWeight: 700 },

  filters: { display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" },
  pdfBtn: { background: "#8e44ad", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },
  resyncBtn: { background: "#17a2b8", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },

  filterLabel: { marginRight: "6px" },
  multiSelectWrap: { position: "relative", display: "inline-flex", alignItems: "center" },
  multiSelectButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "13px", minWidth: "110px", textAlign: "left" },
  multiSelectPanel: { position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: "8px", minWidth: "240px", maxHeight: "320px", overflowY: "auto" },
  multiSelectActions: { display: "flex", justifyContent: "space-between", gap: "12px", padding: "0 4px 8px", marginBottom: "6px", borderBottom: "1px solid #eee" },
  multiSelectOption: { display: "flex", alignItems: "center", gap: "8px", padding: "4px", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap" },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  bulkBar: { display: "flex", alignItems: "center", gap: "10px", background: "#eef4ff", border: "1px solid #cfe0ff", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", flexWrap: "wrap", position: "sticky", top: "10px", zIndex: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" },
  bulkCount: { fontWeight: 600, fontSize: "13px", marginRight: "4px" },
  bulkCopyPicker: { display: "flex", alignItems: "center", gap: "6px" },
  muted: { color: "#888", fontSize: "13px" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa" },
  td: { padding: "10px", borderBottom: "1px solid #eee", verticalAlign: "top" },
  trSelectable: { cursor: "pointer" },
  checkbox: { width: "20px", height: "20px", cursor: "pointer" },

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
