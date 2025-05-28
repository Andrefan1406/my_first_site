import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LabelList, Legend
} from "recharts";
import { parse, startOfWeek, addDays, format } from "date-fns";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_Zm9sn4zf3IrISItk_zym8GLqwdQhwaUV0MV2RyolD5l5woxMo19mpDtQUBXwGyrdA3ZQx2NJ6ze6/pub?gid=0&single=true&output=csv";

const EquipmentReportPage = () => {
  const [categoryData, setCategoryData] = useState([]);
  const [dateData, setDateData] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [pivotTable, setPivotTable] = useState({ columns: [], rows: [], max: 0 });

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Все');
  const [objectFilter, setObjectFilter] = useState('Все');
  
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableObjects, setAvailableObjects] = useState([]);

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const categorySet = new Set();
        const objectSet = new Set();
  
        const filteredData = results.data.filter(row => {
          const isNotCancelled = row["Отметка о исполнении"]?.trim().toLowerCase() !== "отменено";
  
          const category = row["Категория техники"]?.trim() || "Не указано";
          const object = row["Объект"]?.trim() || "Не указано";
          const date = row["Дата"]?.trim();
  
          // Собираем уникальные категории и объекты
          if (category) categorySet.add(category);
          if (object) objectSet.add(object);
  
          // Применяем фильтры
          const matchesDateFrom = dateFrom ? date >= dateFrom : true;
          const matchesDateTo = dateTo ? date <= dateTo : true;
          const matchesCategory = categoryFilter === "Все" || category === categoryFilter;
          const matchesObject = objectFilter === "Все" || object === objectFilter;
  
          return isNotCancelled && matchesDateFrom && matchesDateTo && matchesCategory && matchesObject;
        });
  
        const categoryMap = {};
        const dateMap = {};
        const weekMap = {};
        const pivot = {};
  
        filteredData.forEach((row) => {
          const category = row["Категория техники"]?.trim() || "Не указано";
          const qty = parseInt(row["Количество"], 10) || 0;
          const provided = parseInt(row["Отметка о исполнении"], 10) || 0;
          const notProvided = qty - provided;
          const dateStr = row["Дата"]?.trim();
  
          // агрегируем по категориям
          if (!categoryMap[category]) categoryMap[category] = { name: category, provided: 0, notProvided: 0 };
          categoryMap[category].provided += provided;
          categoryMap[category].notProvided += notProvided;
  
          // агрегируем по датам
          if (dateStr) {
            if (!dateMap[dateStr]) dateMap[dateStr] = { date: dateStr, provided: 0, notProvided: 0 };
            dateMap[dateStr].provided += provided;
            dateMap[dateStr].notProvided += notProvided;
  
            // агрегируем по неделям
            const parsedDate = parse(dateStr, "yyyy-MM-dd", new Date());
            const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 });
            const weekEnd = addDays(weekStart, 6);
            const weekLabel = `${format(weekStart, "dd.MM")}–${format(weekEnd, "dd.MM")}`;
  
            if (!weekMap[weekLabel]) weekMap[weekLabel] = { week: weekLabel, provided: 0, notProvided: 0 };
            weekMap[weekLabel].provided += provided;
            weekMap[weekLabel].notProvided += notProvided;
  
            // для сводной таблицы
            if (!pivot[category]) pivot[category] = {};
            if (!pivot[category][weekLabel]) pivot[category][weekLabel] = 0;
            pivot[category][weekLabel] += qty;
          }
        });
  
        const categoryData = Object.values(categoryMap).sort((a, b) =>
          b.provided + b.notProvided - (a.provided + a.notProvided)
        );
  
        const dateData = Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date));
  
        const weeklyData = Object.values(weekMap).sort((a, b) => {
          const [dA, mA] = a.week.split("–")[0].split(".");
          const [dB, mB] = b.week.split("–")[0].split(".");
          return new Date(2025, mA - 1, dA) - new Date(2025, mB - 1, dB);
        });
  
        const sortedWeeks = Object.keys(weekMap).sort((a, b) => {
          const [dA, mA] = a.split("–")[0].split(".");
          const [dB, mB] = b.split("–")[0].split(".");
          return new Date(2025, mA - 1, dA) - new Date(2025, mB - 1, dB);
        });
  
        const table = Object.entries(pivot).map(([cat, weeks]) => {
          const row = { category: cat };
          sortedWeeks.forEach((w) => row[w] = weeks[w] || 0);
          return row;
        });
  
        const allValues = table.flatMap(row => sortedWeeks.map(w => row[w]));
        const max = Math.max(...allValues);
  
        // Сохраняем собранные данные
        setCategoryData(categoryData);
        setDateData(dateData);
        setWeeklyData(weeklyData);
        setPivotTable({ columns: sortedWeeks, rows: table, max });
        setAvailableCategories(Array.from(categorySet).sort());
        setAvailableObjects(Array.from(objectSet).sort());
      }
    });
  }, [dateFrom, dateTo, categoryFilter, objectFilter]);

  const getCellColor = (value, max) => {
    const green = Math.round(255 - (value / max) * 200);
    return `rgb(${green},255,${green})`;
  };

  let totalSummary = { provided: 0, notProvided: 0 };
  if (categoryFilter !== "Все") {
    const category = categoryData.find(c => c.name === categoryFilter);
    if (category) {
      totalSummary.provided = category.provided;
      totalSummary.notProvided = category.notProvided;
    }
  }

  const getTitle = (baseTitle) => {
    let title = baseTitle;
    if (categoryFilter !== "Все") {
      title += ` — категория: ${categoryFilter}`;
    }
    if (objectFilter !== "Все") {
      title += ` — объект: ${objectFilter}`;
    }
    return title;
  };

  return (
    <div style={{ padding: "40px" }}>
    {/* 🎯 ВСТАВЛЯЕМ ФИЛЬТРЫ */}
    <div style={{ marginBottom: "20px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
      <label>
        С:
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ marginLeft: "5px" }}
        />
      </label>
      <label>
        По:
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ marginLeft: "5px" }}
        />
      </label>
      <label>
        Категория:
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="Все">Все категории</option>
          {availableCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </label>
      <label>
        Объект:
        <select value={objectFilter} onChange={(e) => setObjectFilter(e.target.value)}>
          <option value="Все">Все объекты</option>
          {availableObjects.map((obj) => (
            <option key={obj} value={obj}>{obj}</option>
          ))}
        </select>
      </label>
      <button onClick={() => {
        setDateFrom('');
        setDateTo('');
        setCategoryFilter('Все');
        setObjectFilter('Все');
      }}>
        Очистить фильтры
      </button>
    </div>
    <h2 style={{ textAlign: "center", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по категориям")}</h2>
    {categoryFilter === "Все" ? (
      <ResponsiveContainer width="100%" height={600}>
        <BarChart data={categoryData} layout="vertical" margin={{ top: 20, right: 40, bottom: 20, left: 160 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={200} />
          <Tooltip />
          <Legend />
          <Bar dataKey="provided" stackId="a" fill="#82ca9d" name="Предоставлено">
            <LabelList dataKey="provided" position="center" />
          </Bar>
          <Bar dataKey="notProvided" stackId="a" fill="#ff9999" name="Не предоставлено">
            <LabelList dataKey="notProvided" position="outsideLeft" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    ) : (
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "400px",
          margin: "0 auto",
          textAlign: "center",
          backgroundColor: "#f9f9f9"
        }}
      >
        <h3>{categoryFilter}</h3>
        <p><strong>Предоставлено:</strong> {totalSummary.provided}</p>
        <p><strong>Не предоставлено:</strong> {totalSummary.notProvided}</p>
      </div>
    )}

      <h2 style={{ textAlign: "center", marginTop: "60px", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по датам")}</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={dateData} margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="provided" stackId="a" fill="#82ca9d" name="Предоставлено">
            <LabelList dataKey="provided" position="center" />
          </Bar>
          <Bar dataKey="notProvided" stackId="a" fill="#ff9999" name="Не предоставлено">
            <LabelList dataKey="notProvided" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ textAlign: "center", marginTop: "60px", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по неделям")}</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={weeklyData} margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="provided" stackId="a" fill="#82ca9d" name="Предоставлено">
            <LabelList dataKey="provided" position="center" />
          </Bar>
          <Bar dataKey="notProvided" stackId="a" fill="#ff9999" name="Не предоставлено">
            <LabelList dataKey="notProvided" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ textAlign: "center", marginTop: "60px" }}>{getTitle("Сводная таблица по неделям и категориям")}</h2>
      <div style={{ overflowX: "auto" }}>
        <table border="1" cellPadding="5" style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th>Категория</th>
              {pivotTable.columns.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {pivotTable.rows.map(row => (
              <tr key={row.category}>
                <td>{row.category}</td>
                {pivotTable.columns.map(col => (
                  <td
                    key={col}
                    style={{
                      textAlign: "center",
                      backgroundColor: getCellColor(row[col], pivotTable.max)
                    }}
                  >
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EquipmentReportPage;
