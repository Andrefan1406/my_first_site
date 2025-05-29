import React, { useEffect, useState } from "react";
import Papa from "papaparse";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYF7LcaaZJQNEdQ502p8vkRTnvXn2xUHENQdTwRL2zOgM26uAgnyfgxvbzjZVE7eY0W99Somk5FhTd/pub?gid=61989395&single=true&output=csv";

const ConcreteProductionReport = () => {
  const [tableData, setTableData] = useState([]);
  const [totalVolume, setTotalVolume] = useState(0);

  const excludedColumns = ["Дата отгрузки", "Фактический объём", "Отметка о исполнении"];

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const filteredData = results.data
          .filter((row) => Object.values(row).some((value) => value?.trim()))
          .filter((row) => !row["Отметка о исполнении"]?.trim())
          .map((row) => {
            if (row["Объём, м3"]) {
              // Удаляем всё, кроме цифр, запятых и точек
              row["Объём, м3"] = row["Объём, м3"].replace(/[^\d.,]/g, "");
            }
            return row;
          });

        // Считаем сумму (с учетом, что запятая — десятичный разделитель)
        const total = filteredData.reduce((sum, row) => {
          const volumeStr = row["Объём, м3"]?.replace(",", ".") || "0";
          const volume = parseFloat(volumeStr);
          return sum + (isNaN(volume) ? 0 : volume);
        }, 0);

        setTableData(filteredData);
        setTotalVolume(total);
      },
    });
  }, []);

  return (
    <div style={{ padding: "40px" }}>
      <h1 style={{ textAlign: "center" }}>Текущие не исполненные заявки</h1>

      {tableData.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table border="1" cellPadding="5" style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {Object.keys(tableData[0])
                  .filter((header) => !excludedColumns.includes(header))
                  .map((header) => (
                    <th key={header}>{header}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {/* Первая строка - сумма */}
              <tr style={{ fontWeight: "bold" }}>
                {Object.keys(tableData[0])
                  .filter((header) => !excludedColumns.includes(header))
                  .map((header, i) => (
                    <td key={i}>
                      {header === "Объём, м3"
                        ? totalVolume.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
                        : ""}
                    </td>
                  ))}
              </tr>

              {/* Остальные строки */}
              {tableData.map((row, idx) => (
                <tr key={idx}>
                  {Object.entries(row)
                    .filter(([key]) => !excludedColumns.includes(key))
                    .map(([key, value], i) => (
                      <td key={i}>{value}</td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ textAlign: "center" }}>Загрузка данных...</p>
      )}
    </div>
  );
};

export default ConcreteProductionReport;
