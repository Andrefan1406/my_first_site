import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LabelList
} from "recharts";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTSu48SFcG0-dZpjkW3Z3uN3jJF0QPkpFUroD1YHWRj_8jy7ZwND096Rgd60fDiQGPHMOY8TDVy-_fl/pub?gid=949231644&single=true&output=csv";

const ConcreteProductionReport = () => {
  const [tableData, setTableData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  });
  const [concreteData, setConcreteData] = useState([]);
  const [solutionData, setSolutionData] = useState([]);
  const [monthlyConcreteTotal, setMonthlyConcreteTotal] = useState(0);
  const [dailyConcreteTotal, setDailyConcreteTotal] = useState(0);
  const [monthlySolutionTotal, setMonthlySolutionTotal] = useState(0);
  const [dailySolutionTotal, setDailySolutionTotal] = useState(0);
  const [concreteMonthlyData, setConcreteMonthlyData] = useState([]);
  const [solutionMonthlyData, setSolutionMonthlyData] = useState([]);

  const excludedColumns = ["Дата отгрузки", "Фактический объём", "Отметка о исполнении", "Категория"];

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    return dateStr;
  };

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data
          .filter((row) => Object.values(row).some((value) => value?.trim()))
          .map((row) => {
            if (row["Объём, м3"]) {
              row["Объём, м3"] = row["Объём, м3"].replace(/[^\d.,]/g, "");
            }
            return row;
          });
        setTableData(data);
      },
    });
  }, []);

  useEffect(() => {
    if (tableData.length === 0) return;

    const aggregateData = (materialType) => {
      return Object.values(
        tableData
          .filter(
            (row) =>
              row["Материал"]?.trim() === materialType &&
              formatDate(row["Дата отгрузки"]) === selectedDate
          )
          .reduce((acc, row) => {
            const key = `${row["Объект"]}|${row["Блок, позиция"]}|${row["Марка, класс"]}`;
            if (!acc[key]) {
              acc[key] = {
                "Объект": row["Объект"],
                "Блок, позиция": row["Блок, позиция"],
                "Марка, класс": row["Марка, класс"],
                "заявлено; м3": 0,
                "отгружено; м3": 0,
              };
            }
            const planned = parseFloat((row["Объём, м3"] || "0").replace(",", "."));
            const shipped = parseFloat((row["Фактический объём"] || "0").replace(",", "."));
            acc[key]["заявлено; м3"] += isNaN(planned) ? 0 : planned;
            acc[key]["отгружено; м3"] += isNaN(shipped) ? 0 : shipped;
            return acc;
          }, {})
      );
    };

    setConcreteData(aggregateData("Бетон"));
    setSolutionData(aggregateData("Раствор"));

    const calcTotal = (materialType, isDaily) => {
      return tableData
        .filter((row) => {
          if (row["Материал"]?.trim() !== materialType) return false;

          const rowDateParts = row["Дата отгрузки"]?.split(".");
          if (!rowDateParts || rowDateParts.length !== 3) return false;

          const [, month, year] = rowDateParts;
          const rowYear = parseInt(year, 10);
          const rowMonth = parseInt(month, 10);

          const selected = new Date(selectedDate);
          const selectedYear = selected.getFullYear();
          const selectedMonth = selected.getMonth() + 1;

          if (isDaily) {
            return formatDate(row["Дата отгрузки"]) === selectedDate;
          } else {
            return rowYear === selectedYear && rowMonth === selectedMonth;
          }
        })
        .reduce((sum, row) => {
          const shipped = parseFloat((row["Фактический объём"] || "0").replace(",", "."));
          return sum + (isNaN(shipped) ? 0 : shipped);
        }, 0);
    };

    setMonthlyConcreteTotal(calcTotal("Бетон", false));
    setDailyConcreteTotal(calcTotal("Бетон", true));
    setMonthlySolutionTotal(calcTotal("Раствор", false));
    setDailySolutionTotal(calcTotal("Раствор", true));

    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}`,
      "2024": 0,
      "2025": 0,
    }));
    
    tableData.forEach((row) => {
      if (row["Материал"]?.trim() === "Бетон" && row["Дата отгрузки"]) {
        const [, month, year] = row["Дата отгрузки"].split(".");
        const idx = parseInt(month, 10) - 1;
        const shipped = parseFloat((row["Фактический объём"] || "0").replace(",", "."));
        if (!isNaN(shipped)) {
          if (year === "2024") {
            monthlyData[idx]["2024"] += shipped;
          } else if (year === "2025") {
            monthlyData[idx]["2025"] += shipped;
          }
        }
      }
    });
    
    // Итоговая строка (два столбика рядом)
    const scaleFactor = 3;
    const total2024 = monthlyData.reduce((sum, m) => sum + m["2024"], 0);
    const total2025 = monthlyData.reduce((sum, m) => sum + m["2025"], 0);
    
    monthlyData.push({
      month: "Итого",
      "2024": total2024 / scaleFactor, // уменьшаем только визуальную высоту
      "2025": total2025 / scaleFactor,
      display2024: total2024,          // сохраняем для отображения реальной цифры
      display2025: total2025
    });
    
    setConcreteMonthlyData(monthlyData);

    const monthlySolution = Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}`,
      "2024": 0,
      "2025": 0,
    }));
    
    tableData.forEach((row) => {
      if (row["Материал"]?.trim() === "Раствор" && row["Дата отгрузки"]) {
        const [, month, year] = row["Дата отгрузки"].split(".");
        const idx = parseInt(month, 10) - 1;
        const shipped = parseFloat((row["Фактический объём"] || "0").replace(",", "."));
        if (!isNaN(shipped)) {
          if (year === "2024") {
            monthlySolution[idx]["2024"] += shipped;
          } else if (year === "2025") {
            monthlySolution[idx]["2025"] += shipped;
          }
        }
      }
    });
    
    // Добавляем "Итого" (с тем же scaleFactor, чтобы не перегружать)
    const totalSol2024 = monthlySolution.reduce((sum, m) => sum + m["2024"], 0);
    const totalSol2025 = monthlySolution.reduce((sum, m) => sum + m["2025"], 0);
    
    monthlySolution.push({
      month: "Итого",
      "2024": totalSol2024 / scaleFactor,
      "2025": totalSol2025 / scaleFactor,
      display2024: totalSol2024,
      display2025: totalSol2025
    });
    
    setSolutionMonthlyData(monthlySolution);
    
  }, [tableData, selectedDate]);

  const commonColumns = ["Объект", "Блок, позиция", "Марка, класс", "заявлено; м3", "отгружено; м3"];
  const tableStyle = {
    borderCollapse: "collapse",
    width: "100%",
    tableLayout: "fixed",
  };
  const thTdStyle = {
    border: "1px solid #000",
    padding: "5px",
    textAlign: "left",
  };

  const renderTable = (data) => (
    <table style={tableStyle}>
      <thead style={{ background: "#cce5cc" }}>
        <tr>
          {commonColumns.map((header) => (
            <th key={header} style={thTdStyle}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr key={idx} style={{ background: idx % 2 === 0 ? "#eaf3ea" : "white" }}>
            {commonColumns.map((col, i) => (
              <td key={i} style={thTdStyle}>{row[col]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const totalVolume = tableData
    .filter((row) => !row["Отметка о исполнении"]?.trim())
    .reduce((sum, row) => {
      const volume = parseFloat((row["Объём, м3"] || "0").replace(",", "."));
      return sum + (isNaN(volume) ? 0 : volume);
    }, 0);

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ textAlign: "center" }}>Отчетность по бетонно-растворному узлу</h1>

      <h2>Неисполненные заявки</h2>
      <p><b>Общий объем:</b> {totalVolume.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3</p>
      {tableData.length > 0 ? (
        <div style={{ overflowX: "auto", marginBottom: "40px" }}>
          <table style={tableStyle}>
            <thead style={{ background: "#cce5cc" }}>
              <tr>
                {Object.keys(tableData[0])
                  .filter((header) => !excludedColumns.includes(header))
                  .map((header) => (
                    <th key={header} style={thTdStyle}>{header}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {tableData
                .filter((row) => !row["Отметка о исполнении"]?.trim())
                .map((row, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#eaf3ea" : "white" }}>
                    {Object.entries(row)
                      .filter(([key]) => !excludedColumns.includes(key))
                      .map(([key, value], i) => (
                        <td key={i} style={thTdStyle}>{value}</td>
                      ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Загрузка данных...</p>
      )}

      <div style={{ marginTop: "20px" }}>
        <label>Выберите дату: </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
        <div style={{ flex: 1 }}>
          <h2>Бетон</h2>
          <p><b>Отгружено за месяц:</b> {monthlyConcreteTotal.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3</p>
          <p><b>Отгружено {selectedDate}:</b> {dailyConcreteTotal.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3</p>
          {concreteData.length > 0 ? renderTable(concreteData) : <p>Нет данных по бетону</p>}
        </div>
        <div style={{ flex: 1 }}>
          <h2>Раствор</h2>
          <p><b>Отгружено за месяц:</b> {monthlySolutionTotal.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3</p>
          <p><b>Отгружено {selectedDate}:</b> {dailySolutionTotal.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3</p>
          {solutionData.length > 0 ? renderTable(solutionData) : <p>Нет данных по раствору</p>}
        </div>
      </div>

      <h2>График отгрузки бетона по месяцам 2024 и 2025 годов</h2>
      <div style={{ width: "100%", height: 400, background: "#f0f0f0", borderRadius: "8px", padding: "20px" }}>
        <ResponsiveContainer>
          <BarChart
            data={concreteMonthlyData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
            <XAxis
              dataKey="month"
              label={{ value: "Месяц", position: "insideBottom", offset: -5 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{
                value: "Объем отгрузки, м3",
                angle: -90,
                position: "insideLeft",
                offset: 10,
              }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip formatter={(value) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3`} />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey="2024" name="2024" fill="#4caf50" radius={[4,4,0,0]}>
              <LabelList
                dataKey={(entry) => entry.month === "Итого" ? entry.display2024 : entry["2024"]}
                position="top"
                formatter={(value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              />
            </Bar>
            <Bar dataKey="2025" name="2025" fill="#2196f3" radius={[4,4,0,0]}>
              <LabelList
                dataKey={(entry) => entry.month === "Итого" ? entry.display2025 : entry["2025"]}
                position="top"
                formatter={(value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h2>График отгрузки раствора по месяцам 2024 и 2025 годов</h2>
      <div style={{ width: "100%", height: 400, background: "#f0f0f0", borderRadius: "8px", padding: "20px" }}>
        <ResponsiveContainer>
          <BarChart
            data={solutionMonthlyData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
            <XAxis
              dataKey="month"
              label={{ value: "Месяц", position: "insideBottom", offset: -5 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              label={{
                value: "Объем отгрузки, м3",
                angle: -90,
                position: "insideLeft",
                offset: 10,
              }}
              tick={{ fontSize: 12 }}
            />
            <Tooltip formatter={(value) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м3`} />
            <Legend verticalAlign="top" height={36} />
            <Bar dataKey="2024" name="2024" fill="#FF9800" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey={(entry) => entry.month === "Итого" ? entry.display2024 : entry["2024"]}
                position="top"
                formatter={(value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              />
            </Bar>
            <Bar dataKey="2025" name="2025" fill="#9C27B0" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey={(entry) => entry.month === "Итого" ? entry.display2025 : entry["2025"]}
                position="top"
                formatter={(value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default ConcreteProductionReport;
