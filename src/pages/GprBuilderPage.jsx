import React, { useMemo, useRef, useState } from "react";

// Конструктор ГПР: строки добавляются вручную (наименование работ — из
// выпадающего списка, начало/окончание — даты), а столбцы с датами
// (каждая пятница от самого раннего начала до самого позднего окончания
// среди ВСЕХ строк) достраиваются автоматически при каждом изменении.
// Список работ — тот же набор конструктивов, что и в образце ГПР (см.
// GprPosition64Page.jsx). Уже выбранная в одной строке работа пропадает
// из списка выбора для остальных строк — один вид работ на строку.
//
// Две НЕЗАВИСИМЫЕ таблицы бок о бок вместо одной с sticky-колонками:
// слева статичная (название/начало/окончание, не скроллится), справа —
// только календарная часть в своём overflowX:auto. Sticky-колонки внутри
// одной auto-layout таблицы давали рассинхрон между заявленной шириной
// колонки и её реальной отрисованной шириной (белая полоса между
// названием и датами) — раздельные таблицы этого не допускают в принципе.
// Высоты строк/шапки у обеих таблиц зафиксированы одинаково (ROW_HEIGHT/
// HEADER_HEIGHT), чтобы строки не расходились по вертикали.

const WORK_OPTIONS = [
  "Земляные работы",
  "КЖ",
  "Каменная кладка",
  "Кровля (стяжка)",
  "Кровля (покрытие)",
  "Оконные блоки",
  "Витражи",
  "Фасад",
  "Водоснабжение и канализация",
  "Электромонтаж",
  "Отопление",
  "Стяжка полов",
  "Внутренняя отделка",
  "Устройство HPL панелей (МОП)",
  "Слаботочные сети",
  "Лифты",
];

// "YYYY-MM-DD" из <input type="date"> -> Date в локальной полуночи.
// new Date("YYYY-MM-DD") без времени парсится как UTC-полночь, что на
// отрицательных смещениях часового пояса сдвигает дату на день назад —
// поэтому явно добавляем T00:00:00.
const parseDateInput = (value) => (value ? new Date(`${value}T00:00:00`) : null);

const formatColDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;

const formatDate = (date) =>
  `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;

const nextFriday = (date) => {
  const d = new Date(date);
  const diff = (5 - d.getDay() + 7) % 7; // getDay(): 0=Вс ... 5=Пт ... 6=Сб
  d.setDate(d.getDate() + diff);
  return d;
};

const generateFridays = (min, max) => {
  if (!min || !max || min > max) return [];
  const fridays = [];
  let cur = nextFriday(min);
  while (cur <= max) {
    fridays.push(new Date(cur));
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  return fridays;
};

const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 42;

export default function GprBuilderPage() {
  const [rows, setRows] = useState([]);
  const nextIdRef = useRef(1);

  const addRow = () => {
    const id = nextIdRef.current++;
    setRows((prev) => [...prev, { id, workName: "", start: "", end: "" }]);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // Работы, уже выбранные хоть в одной строке — исключаются из выпадающего
  // списка ДРУГИХ строк (см. options ниже), но не из своей собственной.
  const usedNames = useMemo(
    () => new Set(rows.map((r) => r.workName).filter(Boolean)),
    [rows]
  );

  const { minDate, maxDate, columns } = useMemo(() => {
    const ranges = rows
      .map((r) => ({ start: parseDateInput(r.start), end: parseDateInput(r.end) }))
      .filter((r) => r.start && r.end && r.start <= r.end);

    if (!ranges.length) return { minDate: null, maxDate: null, columns: [] };

    const min = new Date(Math.min(...ranges.map((r) => r.start.getTime())));
    const max = new Date(Math.max(...ranges.map((r) => r.end.getTime())));
    return { minDate: min, maxDate: max, columns: generateFridays(min, max) };
  }, [rows]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Конструктор графика производства работ</h1>
        <p style={s.subtitle}>
          Добавляйте строки, выбирайте вид работ и сроки — столбцы с датами (каждая пятница
          от самого раннего начала до самого позднего окончания среди всех строк) достраиваются
          автоматически.
        </p>
        {minDate && maxDate && (
          <p style={s.rangeInfo}>
            Показаны пятницы с {formatDate(minDate)} по {formatDate(maxDate)} ({columns.length} шт.)
          </p>
        )}
      </div>

      <div style={s.builderRow}>
        {/* Статичная часть — не скроллится никогда */}
        <div style={s.fixedWrap}>
          <table style={s.fixedTable}>
            <thead>
              <tr style={{ height: HEADER_HEIGHT }}>
                <th style={{ ...s.th, width: 240 }}>Наименование работ</th>
                <th style={{ ...s.th, width: 118 }}>Начало</th>
                <th style={{ ...s.th, width: 118 }}>Окончание</th>
                <th style={{ ...s.th, width: 36, borderRight: "none" }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr style={{ height: ROW_HEIGHT }}>
                  <td colSpan={4} style={s.emptyState}>
                    Строк пока нет — нажмите «Добавить строку» ниже.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const options = WORK_OPTIONS.filter(
                    (w) => w === row.workName || !usedNames.has(w)
                  );
                  return (
                    <tr key={row.id} style={{ height: ROW_HEIGHT }}>
                      <td style={{ ...s.td, width: 240, textAlign: "left" }}>
                        <select
                          value={row.workName}
                          onChange={(e) => updateRow(row.id, { workName: e.target.value })}
                          style={s.select}
                        >
                          <option value="">— выберите работу —</option>
                          {options.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...s.td, width: 118 }}>
                        <input
                          type="date"
                          value={row.start}
                          onChange={(e) => updateRow(row.id, { start: e.target.value })}
                          style={s.dateInput}
                        />
                      </td>
                      <td style={{ ...s.td, width: 118 }}>
                        <input
                          type="date"
                          value={row.end}
                          onChange={(e) => updateRow(row.id, { end: e.target.value })}
                          style={s.dateInput}
                        />
                      </td>
                      <td style={{ ...s.td, width: 36, borderRight: "none" }}>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          style={s.removeBtn}
                          title="Удалить строку"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Календарная часть — скроллится только она */}
        {columns.length > 0 && (
          <div style={s.scrollWrap}>
            <table style={s.scrollTable}>
              <thead>
                <tr style={{ height: HEADER_HEIGHT }}>
                  {columns.map((d, i) => (
                    <th key={i} style={s.dateTh}>
                      {formatColDate(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const start = parseDateInput(row.start);
                  const end = parseDateInput(row.end);
                  const validRange = start && end && start <= end;
                  return (
                    <tr key={row.id} style={{ height: ROW_HEIGHT }}>
                      {columns.map((d, i) => {
                        const active = validRange && d >= start && d <= end;
                        return (
                          <td
                            key={i}
                            style={{ ...s.dateTd, background: active ? "#66bb6a" : "transparent" }}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button type="button" onClick={addRow} style={s.addBtn}>
        + Добавить строку
      </button>
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
  rangeInfo: {
    margin: "6px 0 0",
    color: "#1976d2",
    fontSize: "13px",
    fontWeight: 600,
  },
  builderRow: {
    maxWidth: "1400px",
    margin: "0 auto",
    display: "flex",
    alignItems: "flex-start",
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  },
  fixedWrap: {
    flex: "0 0 auto",
    borderRight: "2px solid #d0d7de",
  },
  fixedTable: {
    borderCollapse: "collapse",
    fontSize: "13px",
    tableLayout: "fixed",
  },
  scrollWrap: {
    flex: "1 1 auto",
    overflowX: "auto",
    minWidth: 0,
  },
  scrollTable: {
    borderCollapse: "collapse",
    fontSize: "13px",
    tableLayout: "fixed",
  },
  th: {
    background: "#f0f2f5",
    borderBottom: "1px solid #d0d7de",
    borderRight: "1px solid #e5e7eb",
    padding: "0 10px",
    textAlign: "left",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  dateTh: {
    background: "#f0f2f5",
    borderBottom: "1px solid #d0d7de",
    borderLeft: "1px solid #e5e7eb",
    textAlign: "center",
    fontSize: "11px",
    color: "#555",
    fontWeight: 600,
    width: "40px",
  },
  td: {
    borderBottom: "1px solid #f0f1f3",
    borderRight: "1px solid #f4f5f7",
    padding: "0 8px",
    textAlign: "center",
  },
  dateTd: {
    borderBottom: "1px solid #f0f1f3",
    borderLeft: "1px solid #f4f5f7",
    width: "40px",
    padding: 0,
  },
  select: {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "13px",
    boxSizing: "border-box",
  },
  dateInput: {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "13px",
    boxSizing: "border-box",
  },
  removeBtn: {
    width: "26px",
    height: "26px",
    border: "1px solid #f0b4b4",
    borderRadius: "6px",
    background: "#fff5f5",
    color: "#c0392b",
    cursor: "pointer",
    fontSize: "15px",
    lineHeight: 1,
  },
  addBtn: {
    display: "block",
    margin: "16px auto 0",
    padding: "10px 20px",
    background: "#1976d2",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
  },
  emptyState: {
    padding: "20px",
    textAlign: "center",
    color: "#888",
    fontSize: "14px",
  },
};
