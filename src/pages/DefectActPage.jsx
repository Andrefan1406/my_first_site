import React, { useState } from "react";
import { defectsDictionary } from "../data/defect";

const FIRST_PAGE_WITH_SUMMARY_ROWS = 3;
const FIRST_PAGE_ONLY_TABLE_ROWS = 9;
const MIDDLE_PAGE_ROWS = 12;
const LAST_PAGE_WITH_SUMMARY_ROWS = 6;

const createEmptyRow = () => ({
  defect: "",
  locationBlock: "",
  locationFloor: "",
  reason: "",
  responsibleDefect: "",
  responsibleFix: "",
  workMaterial: "",
  requiredWorks: "",
  unit: "",
  quantity: "",
  price: "",
  total: "",
  isMaterial: false,
  groupId: crypto.randomUUID(),
  materialRate: "",
  rowSpan: 1,
});

const today = new Date();

const currentDay = today.getDate();
const currentMonth = today.toLocaleString("ru-RU", {
  month: "long",
});
const currentYear = today.getFullYear();

export default function DefectActPage() {
  const [rows, setRows] = useState([createEmptyRow()]);

  const calculateTotal = (quantity, price) => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(price) || 0;

    return q && p ? (q * p).toFixed(2) : "";
  };

  const addRow = () => {
    setRows([...rows, createEmptyRow()]);
  };

  const deleteLastRow = () => {
    setRows((prevRows) => {
      if (prevRows.length <= 1) {
        return [createEmptyRow()];
      }

      const lastRow = prevRows[prevRows.length - 1];

      if (lastRow.isMaterial) {
        const lastGroupId = lastRow.groupId;
        return prevRows.filter((row) => row.groupId !== lastGroupId);
      }

      return prevRows.slice(0, -1);
    });
  };

  const recalculateMaterialRows = (updatedRows, groupId, workQuantity) => {
    return updatedRows.map((row) => {
      if (row.isMaterial && row.groupId === groupId) {
        const rate = parseFloat(row.materialRate) || 0;
        const price = parseFloat(row.price) || 0;
        const quantity = workQuantity * rate;

        return {
          ...row,
          quantity: quantity ? quantity.toFixed(2) : "",
          total: quantity && price ? (quantity * price).toFixed(2) : "",
        };
      }

      return row;
    });
  };

  const handleChange = (index, field, value) => {
    let updatedRows = [...rows];

    updatedRows[index] = {
      ...updatedRows[index],
      [field]: value,
    };

    if (field === "quantity" || field === "price") {
      updatedRows[index].total = calculateTotal(
        updatedRows[index].quantity,
        updatedRows[index].price
      );
    }

    if (!updatedRows[index].isMaterial && field === "quantity") {
      const workQuantity = parseFloat(value) || 0;
      const groupId = updatedRows[index].groupId;

      updatedRows = recalculateMaterialRows(
        updatedRows,
        groupId,
        workQuantity
      );
    }

    setRows(updatedRows);
  };

  const handleDefectChange = (index, selectedDefect) => {
    const defectData = defectsDictionary[selectedDefect];
    let updatedRows = [...rows];

    const oldGroupId = updatedRows[index].groupId;

    updatedRows = updatedRows.filter((row, rowIndex) => {
      if (rowIndex === index) return true;
      return row.groupId !== oldGroupId;
    });

    if (!defectData) {
      updatedRows[index] = createEmptyRow();
      setRows(updatedRows);
      return;
    }

    const materials = defectData.materials || [];
    const workQuantity = 1;
    const groupId = crypto.randomUUID();

    updatedRows[index] = {
      ...updatedRows[index],
      defect: selectedDefect,
      locationBlock: updatedRows[index].locationBlock || "",
      locationFloor: updatedRows[index].locationFloor || "",
      reason: defectData.reason || "",
      workMaterial: "работа",
      requiredWorks: defectData.work?.name || "",
      unit: defectData.work?.unit || "",
      quantity: workQuantity,
      price: defectData.work?.price || "",
      total: calculateTotal(workQuantity, defectData.work?.price || ""),
      isMaterial: false,
      groupId,
      rowSpan: materials.length + 1,
    };

    const materialRows = materials.map((material) => {
      const materialQuantity =
        workQuantity * (parseFloat(material.quantity) || 0);

      return {
        ...createEmptyRow(),
        workMaterial: "материал",
        requiredWorks: material.name || "",
        unit: material.unit || "",
        quantity: materialQuantity ? materialQuantity.toFixed(2) : "",
        price: material.price || "",
        total: calculateTotal(materialQuantity, material.price),
        isMaterial: true,
        groupId,
        materialRate: material.quantity || "",
        rowSpan: 1,
      };
    });

    updatedRows.splice(index + 1, 0, ...materialRows);
    setRows(updatedRows);
  };

  const groupRowsIntoBlocks = (rows) => {
    const blocks = [];
    let currentBlock = [];

    rows.forEach((row, index) => {
      if (!row.isMaterial) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
        }

        currentBlock = [{ row, globalIndex: index }];
      } else {
        currentBlock.push({ row, globalIndex: index });
      }
    });

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    return blocks;
  };

  const getBlocksRowsCount = (blocks) => {
    return blocks.reduce((sum, block) => sum + block.length, 0);
  };

  const takeBlocksByLimit = (blocks, limit) => {
    const pageBlocks = [];
    let rowsCount = 0;
    let index = 0;

    while (index < blocks.length) {
      const block = blocks[index];
      const blockSize = block.length;

      if (rowsCount + blockSize <= limit || pageBlocks.length === 0) {
        pageBlocks.push(block);
        rowsCount += blockSize;
        index += 1;
      } else {
        break;
      }
    }

    return {
      pageBlocks,
      restBlocks: blocks.slice(index),
    };
  };

  const splitBlocksToPages = (rows) => {
    const blocks = groupRowsIntoBlocks(rows);
    const totalRowsCount = getBlocksRowsCount(blocks);

    if (totalRowsCount <= FIRST_PAGE_WITH_SUMMARY_ROWS) {
      return [
        {
          blocks,
          showDocumentHeader: true,
          showSummary: true,
        },
      ];
    }

    const pages = [];

    const firstPageResult = takeBlocksByLimit(
      blocks,
      FIRST_PAGE_ONLY_TABLE_ROWS
    );

    pages.push({
      blocks: firstPageResult.pageBlocks,
      showDocumentHeader: true,
      showSummary: false,
    });

    let restBlocks = firstPageResult.restBlocks;

    if (restBlocks.length === 0) {
      pages.push({
        blocks: [],
        showDocumentHeader: false,
        showSummary: true,
      });

      return pages;
    }

    while (getBlocksRowsCount(restBlocks) > LAST_PAGE_WITH_SUMMARY_ROWS) {
      const middlePageResult = takeBlocksByLimit(restBlocks, MIDDLE_PAGE_ROWS);

      pages.push({
        blocks: middlePageResult.pageBlocks,
        showDocumentHeader: false,
        showSummary: false,
      });

      restBlocks = middlePageResult.restBlocks;
    }

    pages.push({
      blocks: restBlocks,
      showDocumentHeader: false,
      showSummary: true,
    });

    return pages;
  };

  const pages = splitBlocksToPages(rows);

  const totalWorks = rows
    .filter((row) => row.workMaterial === "работа")
    .reduce((sum, row) => sum + (parseFloat(row.total) || 0), 0);

  const totalMaterials = rows
    .filter((row) => row.workMaterial === "материал")
    .reduce((sum, row) => sum + (parseFloat(row.total) || 0), 0);

  const renderDocumentHeader = () => {
    return (
      <>
        <div style={styles.topRow}>
          <label style={styles.label}>Организация</label>
          <label style={styles.label}>ТОО "VK INVEST COMPANY"</label>
        </div>

        <h1 style={styles.title}>Дефектная ведомость (дефектный акт)</h1>

        <div style={styles.subtitle}>
          № <input style={styles.numberInput} /> от "
          <input style={styles.dayInput} value={currentDay} readOnly />"{" "}
          <input style={styles.monthInput} value={currentMonth} readOnly />{" "}
          {currentYear} г.
        </div>

        <div style={styles.objectRow}>
          <label style={styles.label}>ОБЪЕКТ:</label>
          <label style={styles.label}>Нурлы жол 4</label>
        </div>

        <div style={styles.objectRow}>
          <label></label>

          <select style={styles.select}>
            <option value="">Выберите позицию</option>
            <option value="поз.1.1">поз.1.1</option>
            <option value="поз.1.2">поз.1.2</option>
            <option value="поз.1.3">поз.1.3</option>
            <option value="поз.1.4">поз.1.4</option>
            <option value="поз.1.5">поз.1.5</option>
            <option value="поз.1.6">поз.1.6</option>
            <option value="поз.1.7">поз.1.7</option>
            <option value="поз.1.8">поз.1.8</option>
            <option value="поз.1.9">поз.1.9</option>
          </select>
        </div>
      </>
    );
  };

  const renderTable = (pageBlocks) => {
    return (
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
          </colgroup>

          <thead>
            <tr>
              <th style={styles.th}>Расположение</th>
              <th style={styles.th}>Перечень выявленных дефектов</th>
              <th style={styles.th}>Причина возникновения дефекта</th>
              <th style={styles.th}>Ответственный за возникновение дефекта</th>
              <th style={styles.th}>Ответственный за устранение дефекта</th>
              <th style={styles.th}>Работа/материал</th>
              <th style={styles.th}>
                Перечень работ/материалов, необходимых для устранения дефектов
              </th>
              <th style={styles.th}>Ед.изм.</th>
              <th style={styles.th}>Кол-во</th>
              <th style={styles.th}>Стоимость за ед.изм.</th>
              <th style={styles.th}>Всего, тг</th>
            </tr>
          </thead>

          <tbody>
            {pageBlocks.map((block) =>
              block.map(({ row, globalIndex }) => (
                <tr key={globalIndex}>
                  {!row.isMaterial && (
                    <>
                      <td style={styles.td} rowSpan={row.rowSpan}>
                        <select
                          style={styles.locationSelect}
                          value={row.locationBlock}
                          onChange={(e) =>
                            handleChange(
                              globalIndex,
                              "locationBlock",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Блок</option>
                          <option value="Блок 1">Блок 1</option>
                          <option value="Блок 2">Блок 2</option>
                        </select>

                        <select
                          style={styles.locationSelect}
                          value={row.locationFloor}
                          onChange={(e) =>
                            handleChange(
                              globalIndex,
                              "locationFloor",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Этаж</option>

                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((floor) => (
                            <option key={floor} value={`${floor} этаж`}>
                              {floor} этаж
                            </option>
                          ))}

                          <option value="тех.этаж">тех.этаж</option>
                          <option value="тех.подполье">тех.подполье</option>
                          <option value="кровля">кровля</option>
                        </select>
                      </td>

                      <td style={styles.td} rowSpan={row.rowSpan}>
                        <select
                          className="no-print"
                          style={styles.defectSelect}
                          value={row.defect}
                          onChange={(e) =>
                            handleDefectChange(globalIndex, e.target.value)
                          }
                        >
                          <option value="">Выберите дефект</option>

                          {Object.keys(defectsDictionary).map((defect) => (
                            <option key={defect} value={defect}>
                              {defect}
                            </option>
                          ))}
                        </select>

                        {row.defect && (
                          <div style={styles.defectDisplay}>{row.defect}</div>
                        )}
                      </td>

                      <td style={styles.centerTd} rowSpan={row.rowSpan}>
                        <div style={styles.centerText}>{row.reason}</div>
                      </td>

                      <td style={styles.centerSelectTd} rowSpan={row.rowSpan}>
                        <select
                          style={styles.responseSelect}
                          value={row.responsibleDefect}
                          onChange={(e) =>
                            handleChange(
                              globalIndex,
                              "responsibleDefect",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Выберите</option>
                          <option value="Худабердиев Ш.">Худабердиев Ш.</option>
                          <option value="Раджапов А.">Раджапов А.</option>
                          <option value="Тайлиев Б.">Тайлиев Б.</option>
                          <option value="Нурматов С.">Нурматов С.</option>
                          <option value="Курбанмухамедов О.">
                            Курбанмухамедов О.
                          </option>
                          <option value="---">---</option>
                        </select>
                      </td>

                      <td style={styles.centerSelectTd} rowSpan={row.rowSpan}>
                        <select
                          style={styles.responseSelect}
                          value={row.responsibleFix}
                          onChange={(e) =>
                            handleChange(
                              globalIndex,
                              "responsibleFix",
                              e.target.value
                            )
                          }
                        >
                          <option value="">Выберите</option>
                          <option value="Худабердиев Ш.">Худабердиев Ш.</option>
                          <option value="Раджапов А.">Раджапов А.</option>
                          <option value="Тайлиев Б.">Тайлиев Б.</option>
                          <option value="Нурматов С.">Нурматов С.</option>
                          <option value="Курбанмухамедов О.">
                            Курбанмухамедов О.
                          </option>
                        </select>
                      </td>
                    </>
                  )}

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.workMaterial}
                      readOnly
                    />
                  </td>

                  <td style={styles.td}>
                    <textarea
                      style={styles.textarea}
                      value={row.requiredWorks}
                      onChange={(e) =>
                        handleChange(
                          globalIndex,
                          "requiredWorks",
                          e.target.value
                        )
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.unit}
                      onChange={(e) =>
                        handleChange(globalIndex, "unit", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="number"
                      style={styles.cellInput}
                      value={row.quantity}
                      readOnly={row.isMaterial}
                      onChange={(e) =>
                        handleChange(globalIndex, "quantity", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="number"
                      style={styles.cellInput}
                      value={row.price}
                      onChange={(e) =>
                        handleChange(globalIndex, "price", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input style={styles.cellInput} value={row.total} readOnly />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSummaryBlock = () => {
    return (
      <>
        <div className="no-print" style={styles.buttonBlock}>
          <button type="button" style={styles.button} onClick={addRow}>
            Добавить строку
          </button>

          <button type="button" style={styles.button} onClick={deleteLastRow}>
            Удалить строку
          </button>

          <button
            type="button"
            style={styles.button}
            onClick={() => window.print()}
          >
            Сохранить в PDF
          </button>
        </div>

        <div style={styles.costRow}>
          <label style={styles.label}>Стоимость работ составит:</label>

          <input style={styles.input} value={totalWorks.toFixed(2)} readOnly />
        </div>

        <div style={styles.costRow}>
          <label style={styles.label}>Стоимость материалов составит:</label>

          <input
            style={styles.input}
            value={totalMaterials.toFixed(2)}
            readOnly
          />
        </div>

        <div style={styles.costRow}>
          <label style={styles.label}>Общая стоимость составит:</label>

          <input
            style={styles.input}
            value={(totalWorks + totalMaterials).toFixed(2)}
            readOnly
          />
        </div>

        <div style={styles.conclusionBlock}>
          <label style={styles.label}>Заключение комиссии</label>

          <textarea style={styles.conclusionTextarea} />
        </div>

        <div style={styles.signatures}>
          <div style={styles.signLeft}>
            <label style={styles.label}>Председатель комиссии</label>
          </div>

          <input
            style={styles.signatureInput}
            value="Главный инженер"
            readOnly
          />

          <div style={styles.signatureLine}></div>

          <input
            style={styles.signatureInput}
            value="Титаренко В.С."
            readOnly
          />

          <div style={styles.signLeft}>
            <label style={styles.label}>Члены комиссии</label>
          </div>

          <input
            style={styles.signatureInput}
            value="Начальник строительного участка"
            readOnly
          />

          <div style={styles.signatureLine}></div>

          <input
            style={styles.signatureInput}
            value="Адаменко О.Ю."
            readOnly
          />

          <div></div>

          <input style={styles.signatureInput} value="Инженер ПТО" readOnly />

          <div style={styles.signatureLine}></div>

          <input
            style={styles.signatureInput}
            value="Төлеуғалиқызы Г."
            readOnly
          />

          <div></div>

          <input style={styles.signatureInput} value="Субподрядчик" readOnly />

          <div style={styles.signatureLine}></div>

          <select style={styles.responseSelect}>
            <option value="">Выберите</option>
            <option>Худабердиев Ш.</option>
            <option>Раджапов А.</option>
            <option>Тайлиев Б.</option>
            <option>Нурматов С.</option>
            <option>Курбанмухамедов О.</option>
          </select>
        </div>
      </>
    );
  };

  return (
    <div style={styles.page}>
      <style>{`
        body {
          background: #d9d9d9;
        }

        @page {
          size: A4 landscape;
          margin: 0;
        }

        @media print {
          body {
            background: white;
            margin: 0;
          }

          .no-print {
            display: none !important;
          }

          .a4-page {
            width: 297mm !important;
            height: 210mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
            overflow: hidden !important;
          }

          .a4-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>

      {pages.map((page, pageIndex) => (
        <div className="a4-page" style={styles.sheet} key={pageIndex}>
          {page.showDocumentHeader && renderDocumentHeader()}

          {page.blocks.length > 0 && renderTable(page.blocks)}

          {page.showSummary && renderSummaryBlock()}
        </div>
      ))}
    </div>
  );
}

const styles = {
  page: {
    background: "#d9d9d9",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "Times New Roman, serif",
  },

  sheet: {
    background: "#fff",
    width: "297mm",
    height: "210mm",
    margin: "0 auto 20px auto",
    padding: "10mm",
    boxSizing: "border-box",
    boxShadow: "0 0 10px rgba(0,0,0,0.15)",
    overflow: "hidden",
  },

  topRow: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 10,
    marginBottom: 16,
  },

  title: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "bold",
    margin: "8px 0 12px",
  },

  subtitle: {
    textAlign: "center",
    marginBottom: 16,
    fontWeight: "bold",
  },

  objectRow: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 10,
    marginBottom: 10,
  },

  tableWrapper: {
    overflowX: "hidden",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 11,
  },

  th: {
    border: "1px solid #000",
    padding: 3,
    textAlign: "center",
    background: "#f5f5f5",
    verticalAlign: "middle",
    lineHeight: 1.15,
  },

  td: {
    border: "1px solid #000",
    verticalAlign: "top",
    padding: 0,
  },

  textarea: {
    width: "100%",
    minHeight: 44,
    border: "none",
    resize: "vertical",
    padding: 4,
    boxSizing: "border-box",
    fontFamily: "Times New Roman, serif",
    fontSize: 11,
    outline: "none",
    background: "transparent",
  },

  cellInput: {
    width: "100%",
    border: "none",
    padding: 4,
    boxSizing: "border-box",
    fontFamily: "Times New Roman, serif",
    fontSize: 11,
    outline: "none",
    background: "transparent",
  },

  buttonBlock: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },

  button: {
    padding: "8px 14px",
    border: "1px solid #000",
    background: "#fff",
    cursor: "pointer",
    fontFamily: "Times New Roman, serif",
  },

  label: {
    fontWeight: "bold",
  },

  input: {
    border: "none",
    borderBottom: "1px solid #000",
    width: "100%",
    fontFamily: "Times New Roman, serif",
    background: "transparent",
  },

  costRow: {
    display: "grid",
    gridTemplateColumns: "250px 1fr",
    gap: 10,
    marginTop: 8,
  },

  conclusionBlock: {
    marginTop: 10,
  },

  conclusionTextarea: {
    width: "100%",
    minHeight: 45,
    border: "1px solid #000",
    padding: 6,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "Times New Roman, serif",
    fontSize: 12,
  },

  signatures: {
    display: "grid",
    gridTemplateColumns: "190px 1fr 190px 240px",
    gap: "8px 8px",
    marginTop: 14,
  },

  signLeft: {
    alignSelf: "center",
  },

  signatureInput: {
    border: "none",
    borderBottom: "1px solid #000",
    padding: 3,
    fontFamily: "Times New Roman, serif",
    background: "transparent",
  },

  signatureLine: {
    borderBottom: "1px solid #000",
  },

  select: {
    border: "none",
    borderBottom: "1px solid #000",
    padding: 4,
    fontFamily: "Times New Roman, serif",
    background: "transparent",
  },

  locationSelect: {
    width: "100%",
    border: "none",
    borderBottom: "1px solid #ccc",
    padding: 3,
    fontFamily: "Times New Roman, serif",
    fontSize: 11,
    outline: "none",
    background: "transparent",
  },

  defectSelect: {
    width: "100%",
    border: "none",
    borderBottom: "1px solid #ccc",
    padding: 3,
    fontFamily: "Times New Roman, serif",
    fontSize: 11,
    outline: "none",
    background: "transparent",
  },

  responseSelect: {
    width: "100%",
    border: "none",
    borderBottom: "1px solid #ccc",
    padding: 3,
    fontFamily: "Times New Roman, serif",
    fontSize: 11,
    outline: "none",
    background: "transparent",
  },

  defectDisplay: {
    padding: 4,
    lineHeight: 1.25,
    fontSize: 11,
  },

  centerTd: {
    border: "1px solid #000",
    verticalAlign: "middle",
  },

  centerText: {
    padding: 4,
    fontSize: 11,
    lineHeight: 1.25,
  },

  centerSelectTd: {
    border: "1px solid #000",
    verticalAlign: "middle",
  },

  numberInput: {
    width: 70,
    border: "none",
    borderBottom: "1px solid #000",
    fontFamily: "Times New Roman, serif",
    background: "transparent",
  },

  dayInput: {
    width: 40,
    border: "none",
    borderBottom: "1px solid #000",
    fontFamily: "Times New Roman, serif",
    background: "transparent",
    textAlign: "center",
  },

  monthInput: {
    width: 140,
    border: "none",
    borderBottom: "1px solid #000",
    fontFamily: "Times New Roman, serif",
    background: "transparent",
    textAlign: "center",
  },
};