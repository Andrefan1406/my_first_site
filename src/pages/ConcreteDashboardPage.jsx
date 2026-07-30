// Дашборд «Аналитика по бетону и раствору»: общий блок фильтров сверху
// (объект, категория, марка/класс, материал, статус исполнения, период) и
// карточки-графики ниже. Данные считает сервер (server/concreteDashboard.js)
// поверх concrete_orders — клиент не тягает и не агрегирует сырые строки.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";

const YEARS = ["2024", "2025", "2026"];
const YEAR_COLORS = { 2024: "#8884d8", 2025: "#6dbb6d", 2026: "#4e79a7" };
const MONTH_NAMES = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

async function apiFetch(path) {
  const res = await fetch(`${API_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ошибка сервера (${res.status})`);
  }
  return data;
}

// Строки из /monthly (по одной на материал+год+месяц) -> данные для recharts:
// один объект на месяц, с ключами "2024"/"2025"/"2026" — значение зависит от
// текущего режима "План/Факт", поэтому пересчитывается на клиенте без
// повторного запроса при переключении.
function buildChartData(rows, material, valueMode) {
  const valueField = valueMode === "actual" ? "actual_m3" : "planned_m3";
  const byMonth = new Map(MONTH_KEYS.map((m) => [m, { month: MONTH_NAMES[MONTH_KEYS.indexOf(m)] }]));

  for (const row of rows) {
    if (row.material !== material) continue;
    const entry = byMonth.get(row.month);
    if (!entry) continue;
    entry[row.year] = (row[valueField] || 0);
  }

  return [...byMonth.values()];
}

// Итог за год по каждому из 2024/2025/2026 — сумма всех месяцев, для
// отдельного мини-графика из 3 столбиков рядом с помесячным.
function buildYearTotals(monthlyData) {
  return YEARS.map((year) => ({
    year,
    total: monthlyData.reduce((sum, row) => sum + (row[year] || 0), 0),
  }));
}

// Строки из /unexecuted (одна на материал+объект+позицию) -> список объектов
// данного материала, каждый со свёрнутой суммой по всем своим позициям и
// самим списком позиций для разворачивания по клику.
function groupUnexecutedByObject(rows, material) {
  const byObject = new Map();

  for (const row of rows) {
    if (row.material !== material) continue;
    const key = row.object_name || "";
    if (!byObject.has(key)) {
      byObject.set(key, {
        object_name: row.object_name,
        request_count: 0,
        sum_planned_m3: 0,
        overdue_count: 0,
        earliest_planned_delivery_date: null,
        max_overdue_days: 0,
        positions: [],
      });
    }

    const obj = byObject.get(key);
    obj.request_count += row.request_count;
    obj.sum_planned_m3 += row.sum_planned_m3 || 0;
    obj.overdue_count += row.overdue_count;
    obj.max_overdue_days = Math.max(obj.max_overdue_days, row.max_overdue_days || 0);
    if (
      row.earliest_planned_delivery_date &&
      (!obj.earliest_planned_delivery_date || row.earliest_planned_delivery_date < obj.earliest_planned_delivery_date)
    ) {
      obj.earliest_planned_delivery_date = row.earliest_planned_delivery_date;
    }

    obj.positions.push({
      block_position: row.block_position,
      request_count: row.request_count,
      sum_planned_m3: row.sum_planned_m3,
      overdue_count: row.overdue_count,
      earliest_planned_delivery_date: row.earliest_planned_delivery_date,
      max_overdue_days: row.max_overdue_days,
    });
  }

  return [...byObject.values()].sort(
    (a, b) => b.max_overdue_days - a.max_overdue_days || b.sum_planned_m3 - a.sum_planned_m3
  );
}

// Таблица неисполненных заявок для одного материала: строка объекта
// разворачивается по клику в список его позиций.
const UnexecutedSection = ({ title, rows, expandedKeys, onToggleObject, materialKey }) => {
  const totals = useMemo(
    () => ({
      requestCount: rows.reduce((sum, r) => sum + r.request_count, 0),
      volume: rows.reduce((sum, r) => sum + (r.sum_planned_m3 || 0), 0),
      overdueCount: rows.reduce((sum, r) => sum + r.overdue_count, 0),
    }),
    [rows]
  );

  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      <div style={s.summaryRow}>
        <span>Всего заявок: <strong>{totals.requestCount}</strong></span>
        <span>Суммарный объём: <strong>{totals.volume.toLocaleString("ru-RU")} м³</strong></span>
        <span style={totals.overdueCount ? s.overdueHighlight : null}>
          Просрочено: <strong>{totals.overdueCount}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={s.muted}>Неисполненных заявок по выбранным фильтрам нет.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Объект</th>
              <th style={s.th}>Заявок</th>
              <th style={s.th}>Объём, м³</th>
              <th style={s.th}>Просрочено</th>
              <th style={s.th}>Самая ранняя плановая дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${materialKey}::${row.object_name || ""}`;
              const expanded = expandedKeys.has(key);
              return (
                <React.Fragment key={key}>
                  <tr style={s.objectRow} onClick={() => onToggleObject(key)}>
                    <td style={s.td}>
                      <span style={s.expandIcon}>{expanded ? "▾" : "▸"}</span>
                      {row.object_name || "(без объекта)"}
                    </td>
                    <td style={s.td}>{row.request_count}</td>
                    <td style={s.td}>{(row.sum_planned_m3 || 0).toLocaleString("ru-RU")}</td>
                    <td style={{ ...s.td, color: row.overdue_count ? "#c0392b" : "#333", fontWeight: row.overdue_count ? 600 : 400 }}>
                      {row.overdue_count > 0 ? `${row.overdue_count} (до ${row.max_overdue_days} дн.)` : "—"}
                    </td>
                    <td style={s.td}>{row.earliest_planned_delivery_date || "—"}</td>
                  </tr>
                  {expanded && row.positions.map((pos, i) => (
                    <tr key={i} style={s.positionRow}>
                      <td style={{ ...s.td, ...s.positionCell }}>{pos.block_position || "(без позиции)"}</td>
                      <td style={s.td}>{pos.request_count}</td>
                      <td style={s.td}>{(pos.sum_planned_m3 || 0).toLocaleString("ru-RU")}</td>
                      <td style={{ ...s.td, color: pos.overdue_count ? "#c0392b" : "#333", fontWeight: pos.overdue_count ? 600 : 400 }}>
                        {pos.overdue_count > 0 ? `${pos.overdue_count} (до ${pos.max_overdue_days} дн.)` : "—"}
                      </td>
                      <td style={s.td}>{pos.earliest_planned_delivery_date || "—"}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

const yearTooltipFormatter = (value) => (value ? `${Number(value).toLocaleString("ru-RU")} м³` : "0 м³");

// Большие числа — целыми и с разделителем разрядов, чтобы подписи над
// столбиками не превращались в простыню цифр.
const formatBarValue = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return Math.abs(value) >= 1000
    ? Math.round(value).toLocaleString("ru-RU")
    : value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
};

// Подписи над столбиками: на основном (помесячном) графике разворачиваем
// вертикально — там много узких столбиков и горизонтальные числа наезжают
// друг на друга; на мини-графике итогов всего 3 широких столбика, поэтому
// подписи остаются горизонтальными.
const makeBarLabel = (rotate) => (props) => {
  const { x, y, width, value } = props;
  const label = formatBarValue(value);
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

const MonthlyChartCard = ({ title, data, expanded, onMouseEnter, onMouseLeave }) => {
  const totals = useMemo(() => buildYearTotals(data), [data]);

  return (
    <div
      style={{ ...s.card, ...(expanded ? s.cardExpanded : null) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <h3 style={s.cardTitle}>{title}</h3>
      <div style={s.chartRow}>
        <ResponsiveContainer width="100%" height={320} style={{ flex: 3 }}>
          <BarChart data={data} margin={{ top: expanded ? 36 : 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="month" fontSize={12} stroke="#8e8ea0" />
            <YAxis fontSize={12} stroke="#8e8ea0" />
            <Tooltip formatter={yearTooltipFormatter} />
            {YEARS.map((year) => (
              <Bar key={year} dataKey={year} name={year} fill={YEAR_COLORS[year]}>
                {expanded && <LabelList dataKey={year} content={makeBarLabel(true)} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={320} style={{ flex: 1 }}>
          <BarChart data={totals} margin={{ top: expanded ? 20 : 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="year" fontSize={12} stroke="#8e8ea0" />
            <YAxis orientation="right" fontSize={12} stroke="#8e8ea0" />
            <Tooltip formatter={yearTooltipFormatter} />
            <Bar dataKey="total" name="Итого">
              {totals.map((t) => (
                <Cell key={t.year} fill={YEAR_COLORS[t.year]} />
              ))}
              {expanded && <LabelList dataKey="total" content={makeBarLabel(false)} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Общая легенда на обе диаграммы сразу — раньше Legend был только у
          основного графика, из-за чего области построения (и ось X) не
          совпадали по высоте с мини-графиком итогов, у которого своего
          Legend не было. */}
      <div style={s.legendRow}>
        {YEARS.map((year) => (
          <span key={year} style={s.legendItem}>
            <span style={{ ...s.legendSwatch, background: YEAR_COLORS[year] }} />
            {year}
          </span>
        ))}
      </div>
    </div>
  );
};

const ConcreteDashboardPage = () => {
  const navigate = useNavigate();

  const [options, setOptions] = useState({ categories: [], objects: [], positions: [], grades: [], materials: [] });
  const [filters, setFilters] = useState({ category: "", object: "", position: "", grade: "", material: "", from: "", to: "" });
  const [valueMode, setValueMode] = useState("planned"); // "planned" | "actual"
  const [hoveredChart, setHoveredChart] = useState(null); // null | "concrete" | "mortar"
  // Небольшая задержка перед увеличением — чтобы случайный провод курсора
  // мимо графика не вызывал разворот; уход курсора отменяет ещё не
  // сработавшую задержку и сворачивает карточку сразу.
  const hoverTimeoutRef = useRef(null);
  const handleChartHoverStart = (chart) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredChart(chart), 600);
  };
  const handleChartHoverEnd = () => {
    clearTimeout(hoverTimeoutRef.current);
    setHoveredChart(null);
  };
  useEffect(() => () => clearTimeout(hoverTimeoutRef.current), []);

  const [monthlyRows, setMonthlyRows] = useState([]);
  const [unexecutedRows, setUnexecutedRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Категория/объект/позиция — каскад по таксономии constructionData.js:
  // category сужает список объектов, object сужает список позиций (как в
  // самой форме заявки), но ни одно поле не блокируется. Поэтому список
  // опций перезапрашивается при смене category/object.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.object) params.set("object", filters.object);
    apiFetch(`/api/concrete-dashboard/options?${params.toString()}`)
      .then(setOptions)
      .catch((err) => setError(err.message || "Не удалось загрузить фильтры"));
  }, [filters.category, filters.object]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.object) params.set("object", filters.object);
      if (filters.position) params.set("position", filters.position);
      if (filters.grade) params.set("grade", filters.grade);
      if (filters.material) params.set("material", filters.material);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);

      const [monthly, unexecuted] = await Promise.all([
        apiFetch(`/api/concrete-dashboard/monthly?${params.toString()}`),
        apiFetch(`/api/concrete-dashboard/unexecuted?${params.toString()}`),
      ]);
      setMonthlyRows(monthly.rows || []);
      setUnexecutedRows(unexecuted.rows || []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Заголовки графиков от LLM (тот же gpt-oss:120b-cloud, что и в остальных
  // сервисах) на основе текущих фильтров — с задержкой 500мс, чтобы не
  // дёргать модель на каждое отдельное изменение при быстром переключении
  // фильтров. Молча остаёмся на дефолтном заголовке, если модель недоступна
  // или ответ пришёл после того, как фильтры уже снова поменялись.
  const [chartTitles, setChartTitles] = useState({ concrete: null, mortar: null });
  const titleRequestRef = useRef(0);
  useEffect(() => {
    const requestId = ++titleRequestRef.current;
    const timeoutId = setTimeout(async () => {
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.object) params.set("object", filters.object);
      if (filters.position) params.set("position", filters.position);
      if (filters.grade) params.set("grade", filters.grade);
      if (filters.material) params.set("material", filters.material);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("valueMode", valueMode);

      try {
        const result = await apiFetch(`/api/concrete-dashboard/chart-titles?${params.toString()}`);
        if (titleRequestRef.current === requestId) {
          setChartTitles({ concrete: result.concreteTitle || null, mortar: result.mortarTitle || null });
        }
      } catch {
        // модель недоступна/ошиблась — остаёмся на дефолтных заголовках
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters, valueMode]);

  const concreteChartData = useMemo(() => buildChartData(monthlyRows, "Бетон", valueMode), [monthlyRows, valueMode]);
  const mortarChartData = useMemo(() => buildChartData(monthlyRows, "Раствор", valueMode), [monthlyRows, valueMode]);

  const concreteUnexecuted = useMemo(() => groupUnexecutedByObject(unexecutedRows, "Бетон"), [unexecutedRows]);
  const mortarUnexecuted = useMemo(() => groupUnexecutedByObject(unexecutedRows, "Раствор"), [unexecutedRows]);

  // Развёрнутые объекты в таблицах неисполненных заявок — ключ материал+объект,
  // чтобы разворот в одной таблице не задевал одноимённый объект в другой.
  const [expandedObjects, setExpandedObjects] = useState(() => new Set());
  const toggleExpandedObject = (key) => {
    setExpandedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Смена category сбрасывает object/position (могли принадлежать другой
  // категории), смена object сбрасывает position — как в форме заявки.
  const setFilter = (key) => (e) => {
    const value = e.target.value;
    setFilters((prev) => {
      if (key === "category") return { ...prev, category: value, object: "", position: "" };
      if (key === "object") return { ...prev, object: value, position: "" };
      return { ...prev, [key]: value };
    });
  };
  const clearFilters = () => setFilters({ category: "", object: "", position: "", grade: "", material: "", from: "", to: "" });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate("/")} style={s.back}>← Назад</button>
        <h1 style={s.title}>Аналитика по бетону и раствору</h1>
      </div>

      <div style={s.filters}>
        <label>
          Категория:{" "}
          <select value={filters.category} onChange={setFilter("category")}>
            <option value="">Все</option>
            {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Объект:{" "}
          <select value={filters.object} onChange={setFilter("object")}>
            <option value="">Все</option>
            {options.objects.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label>
          Позиция:{" "}
          <select value={filters.position} onChange={setFilter("position")}>
            <option value="">Все</option>
            {options.positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>
          Марка/класс:{" "}
          <select value={filters.grade} onChange={setFilter("grade")}>
            <option value="">Все</option>
            {options.grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>
          Материал:{" "}
          <select value={filters.material} onChange={setFilter("material")}>
            <option value="">Все</option>
            {options.materials.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          С даты: <input type="date" value={filters.from} onChange={setFilter("from")} />
        </label>
        <label>
          По дату: <input type="date" value={filters.to} onChange={setFilter("to")} />
        </label>
        <button onClick={clearFilters}>Сбросить фильтры</button>
        <button onClick={load} disabled={loading}>Обновить</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.toggleRow}>
        <span style={s.toggleLabel}>Показывать объём:</span>
        <div style={s.toggleGroup}>
          <button
            style={{ ...s.toggleBtn, ...(valueMode === "planned" ? s.toggleBtnActive : null) }}
            onClick={() => setValueMode("planned")}
          >
            План
          </button>
          <button
            style={{ ...s.toggleBtn, ...(valueMode === "actual" ? s.toggleBtnActive : null) }}
            onClick={() => setValueMode("actual")}
          >
            Факт
          </button>
        </div>
      </div>

      <div style={s.chartsGrid}>
        <MonthlyChartCard
          title={chartTitles.concrete || "Бетон — помесячно по годам"}
          data={concreteChartData}
          expanded={hoveredChart === "concrete"}
          onMouseEnter={() => handleChartHoverStart("concrete")}
          onMouseLeave={handleChartHoverEnd}
        />
        <MonthlyChartCard
          title={chartTitles.mortar || "Раствор — помесячно по годам"}
          data={mortarChartData}
          expanded={hoveredChart === "mortar"}
          onMouseEnter={() => handleChartHoverStart("mortar")}
          onMouseLeave={handleChartHoverEnd}
        />
      </div>

      {loading ? (
        <div style={s.section}><p>Загрузка...</p></div>
      ) : (
        <>
          <UnexecutedSection
            title="Сводка неисполненных заявок — Бетон"
            rows={concreteUnexecuted}
            expandedKeys={expandedObjects}
            onToggleObject={toggleExpandedObject}
            materialKey="Бетон"
          />
          <UnexecutedSection
            title="Сводка неисполненных заявок — Раствор"
            rows={mortarUnexecuted}
            expandedKeys={expandedObjects}
            onToggleObject={toggleExpandedObject}
            materialKey="Раствор"
          />
        </>
      )}
    </div>
  );
};

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "1200px", margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" },
  back: { background: "none", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 12px", cursor: "pointer" },
  title: { margin: 0, fontSize: "22px" },

  filters: { display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" },
  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "13px" },

  toggleRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" },
  toggleLabel: { fontSize: "13px", color: "#555" },
  toggleGroup: { display: "inline-flex", border: "1px solid #ccc", borderRadius: "6px", overflow: "hidden" },
  toggleBtn: { background: "#fff", border: "none", padding: "6px 16px", cursor: "pointer", fontSize: "13px" },
  toggleBtnActive: { background: "#0d0d0d", color: "#fff" },

  chartsGrid: { position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "20px", marginBottom: "24px" },
  card: { background: "#fff", borderRadius: "12px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  // При наведении карточка выходит из грид-потока и накрывает собой оба
  // столбца поверх второго графика, а не сдвигает его — второй график
  // остаётся на месте под ней.
  cardExpanded: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" },
  cardTitle: { margin: "0 0 12px", fontSize: "15px" },
  chartRow: { display: "flex", gap: "8px", alignItems: "stretch" },
  legendRow: { display: "flex", justifyContent: "center", gap: "20px", marginTop: "6px" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555" },
  legendSwatch: { width: "10px", height: "10px", borderRadius: "2px", display: "inline-block" },

  section: { background: "#fff", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "20px" },
  sectionTitle: { margin: "0 0 12px", fontSize: "18px" },
  summaryRow: { display: "flex", gap: "24px", marginBottom: "16px", fontSize: "14px", flexWrap: "wrap" },
  overdueHighlight: { color: "#c0392b" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "10px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "10px", borderBottom: "1px solid #eee", fontSize: "13px" },
  objectRow: { cursor: "pointer" },
  positionRow: { background: "#fafbfc" },
  positionCell: { paddingLeft: "32px", color: "#555" },
  expandIcon: { display: "inline-block", width: "14px", color: "#888" },
};

export default ConcreteDashboardPage;
