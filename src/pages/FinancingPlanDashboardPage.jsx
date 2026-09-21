// Модуль «Смета / График / Финплан» — этап 1: карточки категорий, объектов и
// позиций с произвольными (сгенерированными) цифрами для настройки интерфейса.
// Данные сгенерированы детерминированно (без реального источника) — здесь нет
// ни обращения к серверу, ни к Google-таблицам, это макет для отработки UI.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Генерация фиктивных данных (детерминированная — числа не меняются между
// рендерами и перезагрузками страницы).
// ---------------------------------------------------------------------------

const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const TIMELINE_LENGTH = 14;
const TIMELINE_START_MONTH = 2; // март
const TIMELINE_START_YEAR = 2025;
const TODAY_INDEX = 9; // условный «курсор» текущего момента на шкале

const TIMELINE = Array.from({ length: TIMELINE_LENGTH }, (_, i) => {
  const monthIndex = (TIMELINE_START_MONTH + i) % 12;
  const year = TIMELINE_START_YEAR + Math.floor((TIMELINE_START_MONTH + i) / 12);
  return { monthIndex, year, label: MONTHS_RU[monthIndex] };
});

const SECTION_POOL = [
  "Земляные работы",
  "Разработка котлована",
  "Устройство свайного поля",
  "Монолитный каркас",
  "Каменная кладка",
  "Кровля",
  "Фасадные работы",
  "Внутренние инженерные сети",
  "Отделочные работы",
  "Благоустройство территории",
];

const ITEM_POOL = [
  { name: "Бетон товарный B25", unit: "м³" },
  { name: "Арматура А500С", unit: "т" },
  { name: "Кладка из кирпича керамического", unit: "м³" },
  { name: "Утеплитель минераловатный", unit: "м²" },
  { name: "Гидроизоляция рулонная", unit: "м²" },
  { name: "Опалубка щитовая", unit: "м²" },
  { name: "Кровельное покрытие", unit: "м²" },
  { name: "Аренда техники", unit: "маш-смена" },
  { name: "Работы разнорабочих", unit: "чел-смена" },
];

const CATEGORY_CONFIG = [
  {
    id: "zhilye-doma",
    name: "Жилые дома",
    objects: [
      { id: "nz-4", name: "Нурлы Жол 4", shortName: "НЖ 4", positionCount: 9 },
      { id: "nz-5", name: "Нурлы Жол 5", shortName: "НЖ 5", positionCount: 11 },
    ],
  },
  {
    id: "blagoustroystvo",
    name: "Благоустройство",
    objects: [{ id: "skver-abaya", name: "Сквер Абая", shortName: "СА", positionCount: 3 }],
  },
  {
    id: "seti",
    name: "Сети",
    objects: [{ id: "seti-vodo", name: "Сети водоснабжения мкр. Нурлы Жол", shortName: "СВ", positionCount: 2 }],
  },
  {
    id: "kommercheskie",
    name: "Коммерческие объекты",
    objects: [{ id: "tc-silk-way", name: "ТЦ Silk Way", shortName: "ТЦ SW", positionCount: 4 }],
  },
  {
    id: "infrastruktura",
    name: "Объекты инфраструктуры",
    objects: [{ id: "razvyazka-abaya", name: "Транспортная развязка пр. Абая", shortName: "ТР", positionCount: 2 }],
  },
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildItems(sectionCost, rng) {
  const count = 2 + Math.floor(rng() * 2); // 2-3 позиции
  const picks = shuffleDeterministic(ITEM_POOL, rng).slice(0, count);
  const weights = picks.map(() => 0.3 + rng() * 0.7);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const items = picks.map((p, i) => {
    const price = Math.round(500 + rng() * 49500);
    const targetSum = Math.round((sectionCost * weights[i]) / weightSum);
    const qty = Math.max(1, Math.round(targetSum / price));
    return { name: p.name, unit: p.unit, price, qty, sum: qty * price };
  });

  // подгоняем последнюю позицию, чтобы сумма строк совпадала с суммой раздела
  const runningSum = items.slice(0, -1).reduce((s, it) => s + it.sum, 0);
  const last = items[items.length - 1];
  const remain = sectionCost - runningSum;
  const adjQty = Math.max(1, Math.round(remain / last.price));
  items[items.length - 1] = { ...last, qty: adjQty, sum: adjQty * last.price };
  return items;
}

function buildPosition(id, name, area) {
  const rng = mulberry32(hashString(id));
  const sectionCount = 4 + Math.floor(rng() * 3); // 4-6 разделов
  const chosen = shuffleDeterministic(SECTION_POOL, rng).slice(0, sectionCount);

  const sections = chosen.map((sectionName, idx) => {
    const startIdx = Math.floor(rng() * (TIMELINE_LENGTH - 4));
    const duration = 2 + Math.floor(rng() * 4); // 2-5 месяцев
    const endIdx = Math.min(startIdx + duration - 1, TIMELINE_LENGTH - 1);
    const cost = Math.round((30_000_000 + rng() * 120_000_000) / 1_000_000) * 1_000_000;
    return {
      id: `${id}-s${idx}`,
      name: sectionName,
      startIdx,
      endIdx,
      cost,
      items: buildItems(cost, rng),
    };
  });

  const totalCost = sections.reduce((s, x) => s + x.cost, 0);
  const actualSpend = sections.reduce((sum, sec) => {
    if (sec.endIdx < TODAY_INDEX) return sum + sec.cost;
    if (sec.startIdx > TODAY_INDEX) return sum;
    const dur = sec.endIdx - sec.startIdx + 1;
    const elapsed = TODAY_INDEX - sec.startIdx + 1;
    return sum + Math.round(sec.cost * (elapsed / dur));
  }, 0);

  return { id, name, area, sections, totalCost, actualSpend };
}

function buildMockData() {
  const categories = [];
  const objectsById = {};
  const positionsById = {};

  for (const cat of CATEGORY_CONFIG) {
    const objectIds = [];
    for (const obj of cat.objects) {
      const positionIds = [];
      for (let i = 1; i <= obj.positionCount; i++) {
        const posId = `${obj.id}-p${i}`;
        const posName = `${obj.shortName} поз. ${i}`;
        const rngArea = mulberry32(hashString(`${posId}-area`));
        const area = Math.round(3000 + rngArea() * 9000);
        positionsById[posId] = buildPosition(posId, posName, area);
        positionIds.push(posId);
      }
      const totals = positionIds.reduce(
        (acc, pid) => {
          acc.totalCost += positionsById[pid].totalCost;
          acc.actualSpend += positionsById[pid].actualSpend;
          return acc;
        },
        { totalCost: 0, actualSpend: 0 }
      );
      objectsById[obj.id] = { id: obj.id, name: obj.name, categoryId: cat.id, positionIds, ...totals };
      objectIds.push(obj.id);
    }
    const catTotals = objectIds.reduce(
      (acc, oid) => {
        acc.totalCost += objectsById[oid].totalCost;
        acc.actualSpend += objectsById[oid].actualSpend;
        return acc;
      },
      { totalCost: 0, actualSpend: 0 }
    );
    categories.push({ id: cat.id, name: cat.name, objectIds, ...catTotals });
  }

  return { categories, objectsById, positionsById };
}

const MOCK = buildMockData();

// ---------------------------------------------------------------------------
// Форматирование
// ---------------------------------------------------------------------------

function formatMoney(n) {
  return `${Math.round(n).toLocaleString("ru-RU")} ₸`;
}

function formatMoneyM(n) {
  return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₸`;
}

function pct(actual, total) {
  return total ? Math.min(100, Math.round((actual / total) * 100)) : 0;
}

// ---------------------------------------------------------------------------
// Тёмная тема (только для этого модуля)
// ---------------------------------------------------------------------------

const ACCENT = "linear-gradient(135deg, #7c5cff, #33d6c0)";

const s = {
  page: {
    minHeight: "100vh",
    background: "#0b0d12",
    color: "#e8eaf0",
    fontFamily: "'Segoe UI', Roboto, -apple-system, sans-serif",
    padding: "24px 20px 60px",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 1180,
    margin: "0 auto 20px",
  },
  back: {
    background: "transparent",
    border: "1px solid #242835",
    color: "#9aa0b4",
    borderRadius: 8,
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: 14,
  },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  container: { maxWidth: 1180, margin: "0 auto" },
  breadcrumb: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginBottom: 22,
    fontSize: 14,
    color: "#9aa0b4",
  },
  crumbBtn: {
    background: "transparent",
    border: "none",
    color: "#9aa0b4",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 4px",
  },
  crumbCurrent: { color: "#e8eaf0", fontWeight: 600, padding: "2px 4px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#171a21",
    border: "1px solid #242835",
    borderRadius: 14,
    padding: "18px 20px",
    cursor: "pointer",
    transition: "border-color .15s, transform .15s",
  },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: "#9aa0b4", marginBottom: 14 },
  cardRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9aa0b4", marginBottom: 4 },
  cardValue: { color: "#e8eaf0", fontWeight: 600 },
  progressTrack: { height: 6, borderRadius: 4, background: "#242835", marginTop: 10, overflow: "hidden" },
  progressFill: { height: "100%", background: ACCENT, borderRadius: 4 },
  progressLabel: { fontSize: 12, color: "#57d9c6", marginTop: 6, textAlign: "right" },

  detailHeader: {
    background: "#171a21",
    border: "1px solid #242835",
    borderRadius: 14,
    padding: "22px 24px",
    marginBottom: 20,
  },
  detailTitle: { fontSize: 20, fontWeight: 700, marginBottom: 10 },
  detailStats: { display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 10 },
  statLabel: { fontSize: 12, color: "#9aa0b4" },
  statValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },

  tabs: { display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  tabBtn: (active) => ({
    background: active ? ACCENT : "transparent",
    border: active ? "none" : "1px solid #242835",
    color: active ? "#0b0d12" : "#9aa0b4",
    fontWeight: active ? 700 : 500,
    borderRadius: 10,
    padding: "10px 18px",
    cursor: "pointer",
    fontSize: 14,
  }),

  tableWrap: {
    background: "#171a21",
    border: "1px solid #242835",
    borderRadius: 14,
    overflow: "auto",
    padding: 4,
  },
  table: { borderCollapse: "collapse", width: "100%", fontSize: 13 },
  th: {
    position: "sticky",
    top: 0,
    background: "#1c2029",
    color: "#9aa0b4",
    fontWeight: 600,
    padding: "10px 12px",
    textAlign: "center",
    whiteSpace: "nowrap",
    borderBottom: "1px solid #242835",
  },
  thFirst: {
    position: "sticky",
    left: 0,
    top: 0,
    zIndex: 2,
    background: "#1c2029",
    textAlign: "left",
    minWidth: 220,
  },
  tdFirst: {
    position: "sticky",
    left: 0,
    background: "#171a21",
    padding: "10px 12px",
    borderBottom: "1px solid #1e222b",
    minWidth: 220,
  },
  td: {
    padding: "10px 8px",
    textAlign: "center",
    borderBottom: "1px solid #1e222b",
    whiteSpace: "nowrap",
  },
  ganttCellOn: { background: ACCENT, borderRadius: 4, height: 18, margin: "0 3px" },
  ganttCellOff: { height: 18, margin: "0 3px" },
  todayCol: { boxShadow: "inset 1px 0 0 #57d9c6, inset -1px 0 0 #57d9c6" },

  estimateRow: { cursor: "pointer" },
  itemsSubtable: { background: "#12141a" },
};

// ---------------------------------------------------------------------------
// Мелкие переиспользуемые блоки
// ---------------------------------------------------------------------------

function StatCard({ title, subtitle, totalCost, actualSpend, onClick }) {
  return (
    <div
      style={s.card}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#57d9c6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#242835")}
    >
      <div style={s.cardTitle}>{title}</div>
      <div style={s.cardSubtitle}>{subtitle}</div>
      <div style={s.cardRow}>
        <span>Общая стоимость</span>
        <span style={s.cardValue}>{formatMoneyM(totalCost)}</span>
      </div>
      <div style={s.cardRow}>
        <span>Освоено факт.</span>
        <span style={s.cardValue}>{formatMoneyM(actualSpend)}</span>
      </div>
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${pct(actualSpend, totalCost)}%` }} />
      </div>
      <div style={s.progressLabel}>{pct(actualSpend, totalCost)}%</div>
    </div>
  );
}

function GanttTable({ sections }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, ...s.thFirst }}>Раздел работ</th>
            {TIMELINE.map((m, i) => (
              <th key={i} style={{ ...s.th, ...(i === TODAY_INDEX ? s.todayCol : {}) }}>
                {m.label}
                {m.monthIndex === 0 ? ` ${String(m.year).slice(2)}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <tr key={sec.id}>
              <td style={s.tdFirst}>
                {sec.name}
                <div style={{ fontSize: 11, color: "#9aa0b4" }}>
                  {TIMELINE[sec.startIdx].label} {TIMELINE[sec.startIdx].year} — {TIMELINE[sec.endIdx].label}{" "}
                  {TIMELINE[sec.endIdx].year}
                </div>
              </td>
              {TIMELINE.map((_, i) => {
                const active = i >= sec.startIdx && i <= sec.endIdx;
                return (
                  <td key={i} style={{ ...s.td, ...(i === TODAY_INDEX ? s.todayCol : {}) }}>
                    <div style={active ? s.ganttCellOn : s.ganttCellOff} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinPlanTable({ sections }) {
  const monthly = TIMELINE.map((_, i) =>
    sections.reduce((sum, sec) => {
      if (i < sec.startIdx || i > sec.endIdx) return sum;
      const dur = sec.endIdx - sec.startIdx + 1;
      return sum + sec.cost / dur;
    }, 0)
  );
  const grandTotal = monthly.reduce((a, b) => a + b, 0);

  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, ...s.thFirst }}>Раздел работ</th>
            {TIMELINE.map((m, i) => (
              <th key={i} style={{ ...s.th, ...(i === TODAY_INDEX ? s.todayCol : {}) }}>
                {m.label}
                {m.monthIndex === 0 ? ` ${String(m.year).slice(2)}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const dur = sec.endIdx - sec.startIdx + 1;
            const perMonth = sec.cost / dur;
            return (
              <tr key={sec.id}>
                <td style={s.tdFirst}>{sec.name}</td>
                {TIMELINE.map((_, i) => {
                  const active = i >= sec.startIdx && i <= sec.endIdx;
                  return (
                    <td key={i} style={{ ...s.td, ...(i === TODAY_INDEX ? s.todayCol : {}) }}>
                      {active ? (perMonth / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <td style={{ ...s.tdFirst, fontWeight: 700, background: "#1c2029" }}>Итого за месяц, млн ₸</td>
            {monthly.map((v, i) => (
              <td key={i} style={{ ...s.td, fontWeight: 700, background: "#1c2029", ...(i === TODAY_INDEX ? s.todayCol : {}) }}>
                {(v / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div style={{ padding: "12px 16px", color: "#9aa0b4", fontSize: 13 }}>
        Итого по году: <span style={{ color: "#e8eaf0", fontWeight: 700 }}>{formatMoney(grandTotal)}</span>
      </div>
    </div>
  );
}

function EstimateView({ position }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, ...s.thFirst }}>Раздел работ</th>
            <th style={s.th}>Сумма</th>
            <th style={s.th}>₸ / м²</th>
          </tr>
        </thead>
        <tbody>
          {position.sections.map((sec) => (
            <React.Fragment key={sec.id}>
              <tr style={s.estimateRow} onClick={() => setExpandedId(expandedId === sec.id ? null : sec.id)}>
                <td style={s.tdFirst}>{expandedId === sec.id ? "▾ " : "▸ "}{sec.name}</td>
                <td style={s.td}>{formatMoney(sec.cost)}</td>
                <td style={s.td}>{Math.round(sec.cost / position.area).toLocaleString("ru-RU")}</td>
              </tr>
              {expandedId === sec.id &&
                sec.items.map((it, idx) => (
                  <tr key={idx} style={s.itemsSubtable}>
                    <td style={{ ...s.tdFirst, paddingLeft: 32, color: "#9aa0b4", fontSize: 12 }}>{it.name}</td>
                    <td style={{ ...s.td, fontSize: 12, color: "#9aa0b4" }}>
                      {it.qty} {it.unit} × {formatMoney(it.price)} = {formatMoney(it.sum)}
                    </td>
                    <td style={s.td} />
                  </tr>
                ))}
            </React.Fragment>
          ))}
          <tr>
            <td style={{ ...s.tdFirst, fontWeight: 700, background: "#1c2029" }}>Итого</td>
            <td style={{ ...s.td, fontWeight: 700, background: "#1c2029" }}>{formatMoney(position.totalCost)}</td>
            <td style={{ ...s.td, fontWeight: 700, background: "#1c2029" }}>
              {Math.round(position.totalCost / position.area).toLocaleString("ru-RU")}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Основной компонент
// ---------------------------------------------------------------------------

const TABS = [
  { id: "schedule", label: "График производства работ" },
  { id: "estimate", label: "Коммерческая смета" },
  { id: "finplan", label: "План финансирования" },
];

const FinancingPlanDashboardPage = () => {
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState(null);
  const [objectId, setObjectId] = useState(null);
  const [positionId, setPositionId] = useState(null);
  const [activeTab, setActiveTab] = useState("schedule");

  const category = useMemo(() => MOCK.categories.find((c) => c.id === categoryId) || null, [categoryId]);
  const object = useMemo(() => (objectId ? MOCK.objectsById[objectId] : null), [objectId]);
  const position = useMemo(() => (positionId ? MOCK.positionsById[positionId] : null), [positionId]);

  const selectCategory = (id) => {
    setCategoryId(id);
    setObjectId(null);
    setPositionId(null);
  };
  const selectObject = (id) => {
    setObjectId(id);
    setPositionId(null);
  };
  const selectPosition = (id) => {
    setPositionId(id);
    setActiveTab("schedule");
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.back} onClick={() => navigate("/reports-dashboard")}>← Назад</button>
        <h2 style={s.title}>Смета · График · Финплан</h2>
        <div style={{ width: 90 }} />
      </div>

      <div style={s.container}>
        <div style={s.breadcrumb}>
          <button
            style={categoryId ? s.crumbBtn : { ...s.crumbBtn, ...s.crumbCurrent }}
            onClick={() => selectCategory(null)}
          >
            Все категории
          </button>
          {category && (
            <>
              <span>/</span>
              <button
                style={objectId ? s.crumbBtn : { ...s.crumbBtn, ...s.crumbCurrent }}
                onClick={() => selectObject(null)}
              >
                {category.name}
              </button>
            </>
          )}
          {object && (
            <>
              <span>/</span>
              <button
                style={positionId ? s.crumbBtn : { ...s.crumbBtn, ...s.crumbCurrent }}
                onClick={() => selectPosition(null)}
              >
                {object.name}
              </button>
            </>
          )}
          {position && (
            <>
              <span>/</span>
              <span style={s.crumbCurrent}>{position.name}</span>
            </>
          )}
        </div>

        {!category && (
          <div style={s.grid}>
            {MOCK.categories.map((cat) => (
              <StatCard
                key={cat.id}
                title={cat.name}
                subtitle={`${cat.objectIds.length} объект(ов)`}
                totalCost={cat.totalCost}
                actualSpend={cat.actualSpend}
                onClick={() => selectCategory(cat.id)}
              />
            ))}
          </div>
        )}

        {category && !object && (
          <div style={s.grid}>
            {category.objectIds.map((oid) => {
              const obj = MOCK.objectsById[oid];
              return (
                <StatCard
                  key={oid}
                  title={obj.name}
                  subtitle={`${obj.positionIds.length} позиций`}
                  totalCost={obj.totalCost}
                  actualSpend={obj.actualSpend}
                  onClick={() => selectObject(oid)}
                />
              );
            })}
          </div>
        )}

        {object && !position && (
          <div style={s.grid}>
            {object.positionIds.map((pid) => {
              const pos = MOCK.positionsById[pid];
              return (
                <StatCard
                  key={pid}
                  title={pos.name}
                  subtitle={`${pos.area.toLocaleString("ru-RU")} м²`}
                  totalCost={pos.totalCost}
                  actualSpend={pos.actualSpend}
                  onClick={() => selectPosition(pid)}
                />
              );
            })}
          </div>
        )}

        {position && (
          <>
            <div style={s.detailHeader}>
              <div style={s.detailTitle}>{position.name}</div>
              <div style={s.detailStats}>
                <div>
                  <div style={s.statLabel}>Площадь</div>
                  <div style={s.statValue}>{position.area.toLocaleString("ru-RU")} м²</div>
                </div>
                <div>
                  <div style={s.statLabel}>Общая стоимость (смета)</div>
                  <div style={s.statValue}>{formatMoney(position.totalCost)}</div>
                </div>
                <div>
                  <div style={s.statLabel}>Освоено фактически</div>
                  <div style={s.statValue}>{formatMoney(position.actualSpend)}</div>
                </div>
                <div>
                  <div style={s.statLabel}>% освоения</div>
                  <div style={s.statValue}>{pct(position.actualSpend, position.totalCost)}%</div>
                </div>
              </div>
              <div style={s.progressTrack}>
                <div
                  style={{ ...s.progressFill, width: `${pct(position.actualSpend, position.totalCost)}%` }}
                />
              </div>
            </div>

            <div style={s.tabs}>
              {TABS.map((t) => (
                <button key={t.id} style={s.tabBtn(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "schedule" && <GanttTable sections={position.sections} />}
            {activeTab === "estimate" && <EstimateView position={position} />}
            {activeTab === "finplan" && <FinPlanTable sections={position.sections} />}
          </>
        )}
      </div>
    </div>
  );
};

export default FinancingPlanDashboardPage;
