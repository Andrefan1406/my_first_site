/* Ежедневный отчёт БРУ: исполненные заявки за выбранную дату + итоги с начала месяца */
import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

const csvUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTSu48SFcG0-dZpjkW3Z3uN3jJF0QPkpFUroD1YHWRj_8jy7ZwND096Rgd60fDiQGPHMOY8TDVy-_fl/pub?gid=949231644&single=true&output=csv";

const getLocalDateStr = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateStr(d);
};

// Дата отгрузки в таблице хранится как текст "ДД.ММ.ГГГГ"
const formatSheetDate = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return dateStr;
};

const parseVolume = (value) => {
  const num = parseFloat((value || "0").toString().replace(",", "."));
  return isNaN(num) ? 0 : num;
};

const isFulfilled = (row) => !!row["Отметка о исполнении"]?.toString().trim();

// Объём исполненной заявки: фактически отгруженный, а если он не указан — заявленный
const getRowVolume = (row) => {
  const actual = parseVolume(row["Фактический объём"]);
  return actual > 0 ? actual : parseVolume(row["Объём, м3"]);
};

const formatVolume = (value) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const ConcreteDailyReportPage = () => {
  const maxDate = getYesterday();
  const reportRef = useRef(null);

  const [tableData, setTableData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedDate, setSelectedDate] = useState(maxDate);
  const [dateError, setDateError] = useState("");
  const [report, setReport] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data.filter((row) =>
          Object.values(row).some((value) => value?.trim())
        );
        setTableData(data);
        setLoadingData(false);
      },
      error: () => {
        setLoadError("Не удалось загрузить данные из таблицы.");
        setLoadingData(false);
      },
    });
  }, []);

  const handleDateChange = (e) => {
    const value = e.target.value;
    if (value > maxDate) {
      setDateError("Можно выбрать только уже прошедшую дату.");
      setSelectedDate(maxDate);
    } else {
      setDateError("");
      setSelectedDate(value);
    }
  };

  // Строит раздел отчёта для одного материала (Бетон/Раствор):
  // группировка по объекту и марке за выбранную дату + итоги за день и с начала месяца
  const buildMaterialSection = (materialName) => {
    const groups = {};

    tableData.forEach((row) => {
      if (!isFulfilled(row)) return;
      if (row["Материал"]?.trim() !== materialName) return;
      if (formatSheetDate(row["Дата отгрузки"]) !== selectedDate) return;

      const object = row["Объект"]?.trim() || "—";
      const grade = row["Марка, класс"]?.trim() || "—";
      const key = `${object}|${grade}`;

      if (!groups[key]) {
        groups[key] = { object, grade, volume: 0 };
      }
      groups[key].volume += getRowVolume(row);
    });

    const rows = Object.values(groups).sort((a, b) =>
      a.object.localeCompare(b.object, "ru")
    );
    const dailyTotal = rows.reduce((sum, row) => sum + row.volume, 0);

    // Итог с 1-го числа месяца по выбранную дату включительно
    const monthPrefix = selectedDate.slice(0, 7);
    let monthTotal = 0;

    tableData.forEach((row) => {
      if (!isFulfilled(row)) return;
      if (row["Материал"]?.trim() !== materialName) return;
      const rowDate = formatSheetDate(row["Дата отгрузки"]);
      if (!rowDate || !rowDate.startsWith(monthPrefix) || rowDate > selectedDate) return;
      monthTotal += getRowVolume(row);
    });

    return { name: materialName, rows, dailyTotal, monthTotal };
  };

  const handleGenerate = () => {
    setReport({
      date: selectedDate,
      // Бетон всегда первым, затем раствор
      materials: [buildMaterialSection("Бетон"), buildMaterialSection("Раствор")],
    });
    setCopyStatus("");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSavePdf = async () => {
    if (!reportRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Ежедневный_отчет_БРУ_${report.date}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSaveExcel = () => {
    if (!report) return;

    const aoa = [
      ["Ежедневный отчет БРУ"],
      [`Дата: ${report.date}`],
      [],
    ];

    report.materials.forEach((section) => {
      aoa.push([section.name]);
      aoa.push(["Объект", "Марка", "Объем, м³"]);
      if (section.rows.length === 0) {
        aoa.push(["Нет исполненных заявок"]);
      } else {
        section.rows.forEach((row) => {
          aoa.push([row.object, row.grade, row.volume]);
        });
      }
      aoa.push([`Итого за ${report.date}`, "", section.dailyTotal]);
      aoa.push(["Итого с начала месяца", "", section.monthTotal]);
      aoa.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Отчет БРУ");
    XLSX.writeFile(workbook, `Ежедневный_отчет_БРУ_${report.date}.xlsx`);
  };

  const handleCopyToClipboard = async () => {
    if (!report) return;

    let text = `Ежедневный отчет БРУ\nДата: ${report.date}\n\n`;
    let html = `<h2>Ежедневный отчет БРУ</h2><p>Дата: ${report.date}</p>`;

    report.materials.forEach((section) => {
      text += `${section.name}\nОбъект\tМарка\tОбъем, м³\n`;
      html += `<h3>${section.name}</h3><table border="1" cellspacing="0" cellpadding="4"><tr><th>Объект</th><th>Марка</th><th>Объем, м³</th></tr>`;

      section.rows.forEach((row) => {
        text += `${row.object}\t${row.grade}\t${formatVolume(row.volume)}\n`;
        html += `<tr><td>${row.object}</td><td>${row.grade}</td><td>${formatVolume(row.volume)}</td></tr>`;
      });

      html += "</table>";
      text += `Итого за ${report.date}: ${formatVolume(section.dailyTotal)} м³\n`;
      text += `Итого с начала месяца: ${formatVolume(section.monthTotal)} м³\n\n`;
      html += `<p>Итого за ${report.date}: ${formatVolume(section.dailyTotal)} м³</p>`;
      html += `<p>Итого с начала месяца: ${formatVolume(section.monthTotal)} м³</p>`;
    });

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new window.ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopyStatus("Скопировано в буфер обмена!");
    } catch (err) {
      setCopyStatus("Не удалось скопировать в буфер обмена.");
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
        }

        @media print {
          body {
            background: white;
            margin: 0;
          }

          .no-print {
            display: none !important;
          }

          .a4-report {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="no-print" style={styles.sidebar}>
        <h1 style={styles.sidebarTitle}>Ежедневный отчёт БРУ</h1>

        {loadError && <p style={{ color: "red", margin: 0 }}>{loadError}</p>}

        <label style={styles.dateLabel}>
          Дата:
          <input
            type="date"
            value={selectedDate}
            max={maxDate}
            onChange={handleDateChange}
          />
        </label>

        {dateError && <p style={{ color: "red", margin: 0 }}>{dateError}</p>}

        <button onClick={handleGenerate} disabled={loadingData} style={styles.button}>
          {loadingData ? "Загрузка данных..." : "Сформировать отчет"}
        </button>

        {report && (
          <>
            <hr style={styles.divider} />
            <button onClick={handlePrint} style={styles.actionButton}>
              Распечатать
            </button>
            <button onClick={handleSavePdf} disabled={exportingPdf} style={styles.actionButton}>
              {exportingPdf ? "Формирование PDF..." : "Сохранить в PDF"}
            </button>
            <button onClick={handleSaveExcel} style={styles.actionButton}>
              Сохранить в Excel
            </button>
            <button onClick={handleCopyToClipboard} style={styles.actionButton}>
              Скопировать в буфер обмена
            </button>
            {copyStatus && <span style={{ color: "#2e7d32", fontSize: "13px" }}>{copyStatus}</span>}
          </>
        )}
      </div>

      <div style={styles.reportArea}>
        {!report ? (
          <p style={{ color: "#777" }}>Выберите дату и нажмите «Сформировать отчет».</p>
        ) : (
          <div ref={reportRef} className="a4-report" style={styles.a4Report}>
            <div style={styles.reportHeader}>
              <div style={styles.reportOrg}>ТОО "VK development group"</div>
              <h2 style={styles.reportTitle}>Ежедневный отчет БРУ</h2>
              <div style={styles.reportDate}>Дата: {report.date}</div>
            </div>

            {report.materials.map((section) => (
              <div key={section.name} style={{ marginTop: "20px" }}>
                <h3 style={styles.sectionTitle}>{section.name}</h3>

                {section.rows.length === 0 ? (
                  <p>За выбранную дату нет исполненных заявок по материалу «{section.name}».</p>
                ) : (
                  <table style={styles.table}>
                    <thead style={{ background: "#cce5cc" }}>
                      <tr>
                        <th style={styles.th}>Объект</th>
                        <th style={styles.th}>Марка</th>
                        <th style={styles.th}>Объем, м³</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? "#eaf3ea" : "white" }}>
                          <td style={styles.td}>{row.object}</td>
                          <td style={styles.td}>{row.grade}</td>
                          <td style={styles.td}>{formatVolume(row.volume)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <p style={{ marginTop: "10px", marginBottom: "4px" }}>
                  <b>Итого за {report.date}:</b> {formatVolume(section.dailyTotal)} м³
                </p>
                <p style={{ margin: 0 }}>
                  <b>Итого с начала месяца:</b> {formatVolume(section.monthTotal)} м³
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  page: {
    display: "flex",
    alignItems: "flex-start",
    gap: "24px",
    padding: "24px",
    boxSizing: "border-box",
    minHeight: "100vh",
  },
  sidebar: {
    position: "sticky",
    top: "24px",
    flex: "0 0 240px",
    width: "240px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sidebarTitle: {
    fontSize: "20px",
    margin: 0,
  },
  dateLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  divider: {
    width: "100%",
    border: "none",
    borderTop: "1px solid #ddd",
    margin: "4px 0",
  },
  reportArea: {
    flex: 1,
    minWidth: 0,
    maxHeight: "calc(100vh - 48px)",
    overflowY: "auto",
  },
  button: {
    padding: "10px 20px",
    background: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "16px",
  },
  actionButton: {
    padding: "10px 16px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box",
  },
  a4Report: {
    background: "white",
    color: "#000",
    fontFamily: '"Times New Roman", serif',
    width: "210mm",
    maxWidth: "100%",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "15mm",
    boxSizing: "border-box",
    boxShadow: "0 0 8px rgba(0,0,0,0.15)",
  },
  reportHeader: {
    textAlign: "center",
    borderBottom: "2px solid #000",
    paddingBottom: "10px",
  },
  reportOrg: {
    fontSize: "14px",
    fontWeight: "bold",
  },
  reportTitle: {
    margin: "8px 0 4px",
  },
  reportDate: {
    fontSize: "14px",
  },
  sectionTitle: {
    borderBottom: "1px solid #000",
    paddingBottom: "4px",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    tableLayout: "fixed",
  },
  th: {
    border: "1px solid #000",
    padding: "5px",
    textAlign: "left",
  },
  td: {
    border: "1px solid #000",
    padding: "5px",
    textAlign: "left",
  },
};

export default ConcreteDailyReportPage;
