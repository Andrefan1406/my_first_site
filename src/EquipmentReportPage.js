import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LabelList,
  Legend
} from "recharts";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_Zm9sn4zf3IrISItk_zym8GLqwdQhwaUV0MV2RyolD5l5woxMo19mpDtQUBXwGyrdA3ZQx2NJ6ze6/pub?gid=0&single=true&output=csv";

const EquipmentReportPage = () => {
  const [data, setData] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const categoryMap = {};

        results.data.forEach((row) => {
          const category = row["Категория техники"]?.trim() || "Не указано";
          const qty = parseInt(row["Количество"], 10);
          const status = row["Отметка о исполнении"]?.trim().toLowerCase();
          const date = row["Дата"]?.trim();

          if (!category || isNaN(qty) || !date) return;
          if (status === "отменено") return;

          // Пропускаем, если дата выбрана и она не совпадает
          if (selectedDate && date !== selectedDate) return;

          const isDone = status === "выполнено";

          if (!categoryMap[category]) {
            categoryMap[category] = { name: category, done: 0, notDone: 0 };
          }

          if (isDone) {
            categoryMap[category].done += qty;
          } else {
            categoryMap[category].notDone += qty;
          }
        });

        const chartData = Object.values(categoryMap).sort(
          (a, b) => b.done + b.notDone - (a.done + a.notDone)
        );

        setData(chartData);
      },
    });
  }, [selectedDate]);

  return (
    <div style={{ padding: "40px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
      Суммарное количество техники по категориям
      </h2>

      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <label style={{ marginRight: "10px" }}>Выберите дату:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <ResponsiveContainer width="100%" height={600}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 20, right: 40, bottom: 20, left: 160 }}
        >
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
    </div>
  );
};

export default EquipmentReportPage;
