import React, { useMemo } from "react";

// Реконструкция графика производства работ (ГПР) по Позиции 64 из PDF
// (см. историю чата) — понедельная % готовности по конструктивам с
// 07.11.2025 по 25.12.2026. Пока это статичная страница с зашитыми
// данными из исходного документа, без кнопки перехода из остального
// сайта (см. явную просьбу пользователя) — только прямой URL /gpr-64.
//
// Данные перенесены из PDF программным парсингом (не на глаз), чтобы
// исключить опечатки при переносе ~700 процентных значений — см.
// коммит для деталей. Строки короче 60 недель — это не 0%, а "нет
// данных" (в исходнике ячейка просто пустая): такие столбцы рендерятся
// пустыми, а не нулевыми.

const MONTH_INDEX = {
  "янв.": 0, "февр.": 1, "мар.": 2, "апр.": 3, "мая": 4, "июн.": 5,
  "июл.": 6, "авг.": 7, "сент.": 8, "окт.": 9, "нояб.": 10, "дек.": 11,
};

const MONTH_GROUPS = [
  { label: "нояб.", year: 2025, days: [7, 14, 21, 28] },
  { label: "дек.", year: 2025, days: [5, 12, 19, 26] },
  { label: "янв.", year: 2026, days: [2, 9, 16, 23, 30] },
  { label: "февр.", year: 2026, days: [6, 13, 20, 27] },
  { label: "мар.", year: 2026, days: [6, 13, 20, 27] },
  { label: "апр.", year: 2026, days: [3, 10, 17, 24] },
  { label: "мая", year: 2026, days: [1, 8, 15, 22, 29] },
  { label: "июн.", year: 2026, days: [5, 12, 19, 26] },
  { label: "июл.", year: 2026, days: [3, 10, 17, 24, 31] },
  { label: "авг.", year: 2026, days: [7, 14, 21, 28] },
  { label: "сент.", year: 2026, days: [4, 11, 18, 25] },
  { label: "окт.", year: 2026, days: [2, 9, 16, 23, 30] },
  { label: "нояб.", year: 2026, days: [6, 13, 20, 27] },
  { label: "дек.", year: 2026, days: [4, 11, 18, 25] },
];

const COLUMNS = MONTH_GROUPS.flatMap(({ label, year, days }) =>
  days.map((day) => ({
    monthLabel: label,
    year,
    day,
    date: new Date(year, MONTH_INDEX[label], day),
  }))
);

// Первая колонка на/после сегодняшней даты — вертикальная отметка "сегодня"
// на графике (см. renderColGroup/renderHeaderCell ниже).
const TODAY = new Date();
const TODAY_COL_INDEX = COLUMNS.findIndex((c) => c.date >= TODAY);

const pctList = (raw) =>
  raw.trim().split(/\s+/).map((s) => parseFloat(s.replace("%", "").replace(",", ".")));

// Короткие строки данные из PDF заканчиваются раньше 60 недель — это
// означает "дальше не заполнено", а не "0%", поэтому дополняем null,
// а не нулями (см. cellStyle: null рендерится пустой ячейкой).
const padded = (raw) => {
  const values = pctList(raw);
  while (values.length < COLUMNS.length) values.push(null);
  return values;
};

const ROWS = [
  {
    type: "summary",
    label: "Позиция 64",
    values: padded(
      "55,51% 56% 56% 57% 58% 58% 59% 59% 59% 59% 60% 60% 60% 60% 61% 61% 61% 62% 64% 65% 65% 66% 67% 67% 68% 68% 68% 68% 69% 69% 69% 69% 69% 72% 73% 63% 61% 62% 59% 57% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0%"
    ),
  },
  {
    type: "data",
    label: "Земляные работы",
    values: padded(
      "100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100%"
    ),
  },
  {
    type: "data",
    label: "КЖ",
    start: "01.03.2026",
    end: "15.03.2026",
    values: padded(
      "98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 99% 99% 99% 99% 99% 99% 99% 99% 99% 100% 100% 100% 100% 100% 100% 100%"
    ),
  },
  {
    type: "data",
    label: "Каменная кладка",
    start: "11.03.2025",
    end: "15.12.2025",
    values: padded(
      "90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 93% 95% 95% 97% 98% 98% 98% 98% 98% 98% 98% 98% 98% 98% 100% 100% 100% 100% 100% 100% 100%"
    ),
  },
  { type: "section", label: "Кровельные работы" },
  {
    type: "data",
    label: "Кровля (стяжка)",
    start: "01.04.2025",
    end: "01.05.2025",
    values: padded(
      "85% 85% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100% 100%"
    ),
  },
  {
    type: "data",
    label: "Кровля (покрытие)",
    start: "21.04.2026",
    end: "06.05.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 2% 2% 2% 2% 2%"
    ),
  },
  { type: "section", label: "Окна и витражи" },
  {
    type: "data",
    label: "Оконные блоки",
    start: "17.11.2025",
    end: "15.01.2026",
    values: padded(
      "0% 0% 10% 24% 37% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 60% 65% 68% 75% 75% 80% 85% 90% 93% 93% 94% 94% 95% 95% 95% 95% 95% 95%"
    ),
  },
  {
    type: "data",
    label: "Витражи",
    start: "02.01.2026",
    end: "30.01.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 25% 25% 25% 35% 65% 70% 75% 85% 88% 90% 92% 92% 92% 93% 94% 95% 95% 95% 95% 95% 95%"
    ),
  },
  {
    type: "data",
    label: "Фасад",
    start: "20.01.2026",
    end: "20.04.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 21% 24% 26%"
    ),
  },
  { type: "section", label: "ВК и ОВ" },
  {
    type: "data",
    label: "Водоснабжение и канализация",
    section: "ВК",
    start: "07.11.2025",
    end: "31.01.2026",
    values: padded(
      "40% 40% 45% 45% 45% 45% 45% 45% 45% 45% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50% 50%"
    ),
  },
  {
    type: "data",
    label: "Электромонтаж",
    start: "05.01.2026",
    end: "30.04.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 5% 10%"
    ),
  },
  {
    type: "data",
    label: "Отопление",
    section: "ОВ",
    start: "07.10.2025",
    end: "10.01.2026",
    values: padded(
      "33% 33% 33% 33% 40% 40% 50% 50% 50% 50% 50% 50% 50% 50% 50% 52% 52% 53% 54% 55% 55% 56% 56% 57% 57% 58% 58% 59% 59% 59% 60% 60% 60% 61% 61% 61% 62% 62%"
    ),
  },
  {
    type: "data",
    label: "Стяжка полов",
    start: "16.01.2026",
    end: "17.02.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 10%"
    ),
  },
  {
    type: "data",
    label: "Внутренняя отделка",
    start: "01.02.2026",
    end: "30.04.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 5% 5% 5% 5% 7% 10% 10% 15% 18% 35% 40%"
    ),
  },
  {
    type: "data",
    label: "Устройство HPL панелей (МОП)",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0%"
    ),
  },
  {
    type: "data",
    label: "Слаботочные сети",
    start: "31.03.2026",
    end: "30.04.2026",
    values: padded(
      "0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0% 0%"
    ),
  },
  {
    type: "data",
    label: "Лифты",
    start: "30.11.2025",
    end: "10.01.2026",
    values: padded(
      "0% 0% 0% 0% 1% 2% 5% 20% 25% 30% 40% 50% 60% 60% 60% 60% 60% 60% 60% 60% 60% 60% 80% 90% 90% 90% 90% 90% 90% 90% 90% 90% 90% 95% 97% 97% 97% 97% 97%"
    ),
  },
];

// Мягкий heatmap: 0% — красноватый, 50% — жёлтый, 100% — зелёный.
// Пастельные тона (высокая lightness), чтобы текст поверх оставался читаемым.
const cellBackground = (value) => {
  if (value === null || value === undefined) return "transparent";
  const hue = Math.max(0, Math.min(100, value)) * 1.2; // 0 -> красный, 120 -> зелёный
  return `hsl(${hue}, 65%, 88%)`;
};

const COL_WIDTH = 34;
const STICKY_WIDTHS = [64, 70, 220, 84, 84]; // № п/п, Раздел, Конструктивы, Начало, Окончание
const stickyLeft = (i) => STICKY_WIDTHS.slice(0, i).reduce((a, b) => a + b, 0);

export default function GprPosition64Page() {
  const monthHeaderCells = useMemo(() => {
    return MONTH_GROUPS.map((g, i) => (
      <th key={`${g.label}-${g.year}-${i}`} colSpan={g.days.length} style={s.monthHeader}>
        {g.label}
      </th>
    ));
  }, []);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>ГПР — Позиция 64</h1>
        <p style={s.subtitle}>
          График производства работ, % готовности по неделям. Данные по состоянию на
          07.08.2026 (реконструкция из исходного PDF).
        </p>
      </div>

      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={{ ...s.legendSwatch, background: cellBackground(5) }} /> низкая готовность
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendSwatch, background: cellBackground(50) }} /> средняя
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendSwatch, background: cellBackground(95) }} /> высокая
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendSwatch, border: "1px dashed #1976d2", background: "transparent" }} /> сегодня
        </span>
      </div>

      <div style={s.tableScroll}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.cornerHeader, left: stickyLeft(0), width: STICKY_WIDTHS[0] }}>№ п/п</th>
              <th style={{ ...s.cornerHeader, left: stickyLeft(1), width: STICKY_WIDTHS[1] }}>Раздел</th>
              <th style={{ ...s.cornerHeader, left: stickyLeft(2), width: STICKY_WIDTHS[2] }}>Конструктивы</th>
              <th style={{ ...s.cornerHeader, left: stickyLeft(3), width: STICKY_WIDTHS[3] }}>Начало</th>
              <th style={{ ...s.cornerHeader, left: stickyLeft(4), width: STICKY_WIDTHS[4] }}>Окончание</th>
              {monthHeaderCells}
            </tr>
            <tr>
              <th style={{ ...s.cornerHeaderSub, left: stickyLeft(0) }} />
              <th style={{ ...s.cornerHeaderSub, left: stickyLeft(1) }} />
              <th style={{ ...s.cornerHeaderSub, left: stickyLeft(2) }} />
              <th style={{ ...s.cornerHeaderSub, left: stickyLeft(3) }} />
              <th style={{ ...s.cornerHeaderSub, left: stickyLeft(4) }} />
              {COLUMNS.map((c, i) => (
                <th
                  key={i}
                  style={{
                    ...s.dayHeader,
                    width: COL_WIDTH,
                    borderLeft: i === TODAY_COL_INDEX ? "2px dashed #1976d2" : undefined,
                  }}
                >
                  {c.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, rowIdx) => {
              if (row.type === "section") {
                return (
                  <tr key={rowIdx}>
                    <td
                      colSpan={5 + COLUMNS.length}
                      style={s.sectionRow}
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              const isSummary = row.type === "summary";
              return (
                <tr key={rowIdx}>
                  <td style={{ ...s.stickyCell, left: stickyLeft(0), width: STICKY_WIDTHS[0], fontWeight: isSummary ? 700 : 400 }}>
                    поз.64
                  </td>
                  <td style={{ ...s.stickyCell, left: stickyLeft(1), width: STICKY_WIDTHS[1] }}>
                    {row.section || ""}
                  </td>
                  <td
                    style={{
                      ...s.stickyCell,
                      left: stickyLeft(2),
                      width: STICKY_WIDTHS[2],
                      fontWeight: isSummary ? 700 : 400,
                      textAlign: "left",
                    }}
                  >
                    {row.label}
                  </td>
                  <td style={{ ...s.stickyCell, left: stickyLeft(3), width: STICKY_WIDTHS[3] }}>
                    {row.start || ""}
                  </td>
                  <td style={{ ...s.stickyCell, left: stickyLeft(4), width: STICKY_WIDTHS[4] }}>
                    {row.end || ""}
                  </td>
                  {row.values.map((value, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        ...s.dataCell,
                        width: COL_WIDTH,
                        background: cellBackground(value),
                        fontWeight: isSummary ? 700 : 400,
                        borderLeft: colIdx === TODAY_COL_INDEX ? "2px dashed #1976d2" : undefined,
                      }}
                    >
                      {value === null ? "" : `${value}%`}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    maxWidth: "1400px",
    margin: "0 auto 16px",
  },
  title: {
    margin: 0,
    fontSize: "26px",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#666",
    fontSize: "14px",
  },
  legend: {
    maxWidth: "1400px",
    margin: "0 auto 12px",
    display: "flex",
    gap: "18px",
    fontSize: "12px",
    color: "#444",
    alignItems: "center",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  legendSwatch: {
    display: "inline-block",
    width: "14px",
    height: "14px",
    borderRadius: "3px",
  },
  tableScroll: {
    maxWidth: "1400px",
    margin: "0 auto",
    overflowX: "auto",
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
  },
  table: {
    borderCollapse: "collapse",
    fontSize: "11px",
  },
  cornerHeader: {
    position: "sticky",
    top: 0,
    zIndex: 3,
    background: "#f0f2f5",
    borderBottom: "1px solid #d0d7de",
    borderRight: "1px solid #e5e7eb",
    padding: "6px 8px",
    textAlign: "left",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  cornerHeaderSub: {
    position: "sticky",
    top: "31px",
    zIndex: 3,
    background: "#f0f2f5",
    borderBottom: "1px solid #d0d7de",
    borderRight: "1px solid #e5e7eb",
  },
  monthHeader: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "#eef1f5",
    borderBottom: "1px solid #d0d7de",
    borderLeft: "1px solid #e5e7eb",
    padding: "4px 2px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#444",
  },
  dayHeader: {
    position: "sticky",
    top: "31px",
    zIndex: 2,
    background: "#f7f8fa",
    borderBottom: "1px solid #d0d7de",
    fontSize: "10px",
    color: "#777",
    fontWeight: 400,
    padding: "3px 0",
  },
  sectionRow: {
    background: "#e9ecef",
    color: "#333",
    fontWeight: 700,
    fontSize: "12px",
    padding: "6px 10px",
    textAlign: "left",
    position: "sticky",
    left: 0,
  },
  stickyCell: {
    position: "sticky",
    background: "#ffffff",
    borderRight: "1px solid #eceef0",
    borderBottom: "1px solid #f0f1f3",
    padding: "3px 8px",
    fontSize: "11px",
    whiteSpace: "nowrap",
    textAlign: "center",
    zIndex: 1,
  },
  dataCell: {
    borderBottom: "1px solid #f0f1f3",
    textAlign: "center",
    fontSize: "10px",
    padding: "3px 0",
    whiteSpace: "nowrap",
  },
};
