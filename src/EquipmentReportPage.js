// EquipmentReportPage.js - Полный код с фильтрами, графиками и сводной таблицей по неделям и категориям

import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LabelList, Legend
} from "recharts";
import { parse, format, startOfWeek, addDays } from "date-fns";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_Zm9sn4zf3IrISItk_zym8GLqwdQhwaUV0MV2RyolD5l5woxMo19mpDtQUBXwGyrdA3ZQx2NJ6ze6/pub?gid=0&single=true&output=csv";

const EquipmentReportPage = () => {
  const [data, setData] = useState([]);
  const [dateData, setDateData] = useState([]);
  const [weekData, setWeekData] = useState([]);
  const [pivotTable, setPivotTable] = useState({ columns: [], rows: [] });

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [categoryOptions, setCategoryOptions] = useState([]);
  const [objectOptions, setObjectOptions] = useState([]);

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const categoryMap = {}, dateMap = {}, weekMap = {}, pivot = {};
        const allCategories = new Set(), allObjects = new Set();

        results.data.forEach((row) => {
          const category = row["Категория техники"]?.trim() || "Не указано";
          const object = row["Объект"]?.trim() || "Не указан";
          const qty = parseInt(row["Количество"], 10);
          const status = row["Отметка о исполнении"]?.trim().toLowerCase();
          const date = row["Дата"]?.trim();

          if (!category || isNaN(qty) || !date) return;
          if (status === "отменено") return;
          if (startDate && date < startDate) return;
          if (endDate && date > endDate) return;

          allCategories.add(category);
          allObjects.add(object);

          if (selectedCategory && category !== selectedCategory) return;
          if (selectedObject && object !== selectedObject) return;
          if (selectedStatus && status !== selectedStatus.toLowerCase()) return;

          const isDone = status === "выполнено";

          if (!categoryMap[category]) categoryMap[category] = { name: category, done: 0, notDone: 0 };
          if (isDone) categoryMap[category].done += qty;
          else categoryMap[category].notDone += qty;

          if (!dateMap[date]) dateMap[date] = { date, done: 0, notDone: 0 };
          if (isDone) dateMap[date].done += qty;
          else dateMap[date].notDone += qty;

          const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
          const monday = startOfWeek(parsedDate, { weekStartsOn: 1 });
          const sunday = addDays(monday, 6);
          const weekLabel = `${format(monday, 'dd.MM')}–${format(sunday, 'dd.MM')}`;

          if (!weekMap[weekLabel]) weekMap[weekLabel] = { week: weekLabel, done: 0, notDone: 0 };
          if (isDone) weekMap[weekLabel].done += qty;
          else weekMap[weekLabel].notDone += qty;

          if (!pivot[category]) pivot[category] = {};
          if (!pivot[category][weekLabel]) pivot[category][weekLabel] = 0;
          pivot[category][weekLabel] += qty;
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

        setCategoryOptions(Array.from(allCategories).sort());
        setObjectOptions(Array.from(allObjects).sort());
        setData(Object.values(categoryMap).sort((a, b) => b.done + b.notDone - (a.done + a.notDone)));
        setDateData(Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date)));
        setWeekData(Object.values(weekMap).sort((a, b) => {
          const [dayA, monthA] = a.week.split("–")[0].split(".");
          const [dayB, monthB] = b.week.split("–")[0].split(".");
          return new Date(2025, parseInt(monthA) - 1, parseInt(dayA)) - new Date(2025, parseInt(monthB) - 1, parseInt(dayB));
        }));
        setPivotTable({ columns: sortedWeeks, rows: table, max });
      }
    });
  }, [startDate, endDate, selectedCategory, selectedObject, selectedStatus]);

  const getTitle = (base) => selectedCategory ? `${base}: ${selectedCategory}` : `${base} (все категории)`;
  const clearAllFilters = () => {
    setStartDate(""); setEndDate("");
    setSelectedCategory(""); setSelectedObject(""); setSelectedStatus("");
  };

  const getCellColor = (value, max) => {
    const green = Math.round(255 - (value / max) * 200);
    return `rgb(${green},255,${green})`;
  };

  return (
    <div style={{ padding: "40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px", marginBottom: "30px" }}>
        <label>С:</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <label>По:</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

        <label>Категория:</label>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
          <option value="">Все категории</option>
          {categoryOptions.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <label>Объект:</label>
        <select value={selectedObject} onChange={(e) => setSelectedObject(e.target.value)}>
          <option value="">Все объекты</option>
          {objectOptions.map((obj) => (
            <option key={obj} value={obj}>{obj}</option>
          ))}
        </select>

        <label>Статус:</label>
        <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
          <option value="">Все</option>
          <option value="выполнено">Выполнено</option>
          <option value="не выполнено">Не выполнено</option>
        </select>

        <button onClick={clearAllFilters}>Очистить фильтры</button>
      </div>

      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по категориям")}</h2>
      <ResponsiveContainer width="100%" height={600}>
        <BarChart data={data} layout="vertical" margin={{ top: 20, right: 40, bottom: 20, left: 160 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={200} />
          <Tooltip />
          <Legend />
          <Bar dataKey="done" stackId="a" fill="#82ca9d" name="Выполнено">
            <LabelList dataKey="done" position="center" />
          </Bar>
          <Bar dataKey="notDone" stackId="a" fill="#ff9999" name="Не выполнено">
            <LabelList dataKey="notDone" position="outsideLeft" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ textAlign: "center", marginTop: "60px", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по датам")}</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={dateData} margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="done" stackId="a" fill="#82ca9d" name="Выполнено">
            <LabelList dataKey="done" position="center" />
          </Bar>
          <Bar dataKey="notDone" stackId="a" fill="#ff9999" name="Не выполнено">
            <LabelList dataKey="notDone" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ textAlign: "center", marginTop: "60px", marginBottom: "20px" }}>{getTitle("Суммарное количество техники по неделям")}</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={weekData} margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="done" stackId="a" fill="#82ca9d" name="Выполнено">
            <LabelList dataKey="done" position="center" />
          </Bar>
          <Bar dataKey="notDone" stackId="a" fill="#ff9999" name="Не выполнено">
            <LabelList dataKey="notDone" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ textAlign: "center", marginTop: "60px" }}>Сводная таблица по неделям и категориям</h2>
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