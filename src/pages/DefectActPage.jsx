import React, { useState } from "react";

const emptyRow = {
  defect: "",
  reason: "",
  responsibleDefect: "",
  responsibleFix: "",
  workMaterial: "",
  requiredWorks: "",
  unit: "",
  quantity: "",
  price: "",
  total: "",
};

export default function DefectActPage() {
  const [rows, setRows] = useState([emptyRow]);

  const addRow = () => {
    setRows([...rows, { ...emptyRow }]);
  };

  const handleChange = (index, field, value) => {
    const updatedRows = [...rows];
    updatedRows[index][field] = value;

    if (field === "quantity" || field === "price") {
      const quantity = parseFloat(updatedRows[index].quantity) || 0;
      const price = parseFloat(updatedRows[index].price) || 0;
      updatedRows[index].total = quantity && price ? (quantity * price).toFixed(2) : "";
    }

    setRows(updatedRows);
  };

  return (
    <div style={styles.page}>
      <div style={styles.sheet}>
        <div style={styles.topRow}>
          <label style={styles.label}>Организация</label>
          <input style={styles.input} />
        </div>

        <h1 style={styles.title}>Дефектная ведомость (дефектный акт)</h1>

        <div style={styles.subtitle}>
          № <input style={styles.numberInput} /> от "
          <input style={styles.dayInput} />"{" "}
          <input style={styles.monthInput} /> 2024 г.
        </div>

        <div style={styles.objectRow}>
          <label style={styles.label}>ОБЪЕКТ:</label>
          <input style={styles.input} placeholder="Наименование" />
        </div>

        <div style={styles.objectRow}>
          <label></label>
          <input style={styles.input} placeholder="Позиция" />
        </div>

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>

            <thead>
              <tr>
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
              {rows.map((row, index) => (
                <tr key={index}>
                  <td style={styles.td}>
                    <textarea
                      style={styles.textarea}
                      value={row.defect}
                      onChange={(e) => handleChange(index, "defect", e.target.value)}
                    />
                  </td>

                  <td style={styles.td}>
                    <textarea
                      style={styles.textarea}
                      value={row.reason}
                      onChange={(e) => handleChange(index, "reason", e.target.value)}
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.responsibleDefect}
                      onChange={(e) =>
                        handleChange(index, "responsibleDefect", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.responsibleFix}
                      onChange={(e) =>
                        handleChange(index, "responsibleFix", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.workMaterial}
                      onChange={(e) =>
                        handleChange(index, "workMaterial", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <textarea
                      style={styles.textarea}
                      value={row.requiredWorks}
                      onChange={(e) =>
                        handleChange(index, "requiredWorks", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      style={styles.cellInput}
                      value={row.unit}
                      onChange={(e) => handleChange(index, "unit", e.target.value)}
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="number"
                      style={styles.cellInput}
                      value={row.quantity}
                      onChange={(e) =>
                        handleChange(index, "quantity", e.target.value)
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="number"
                      style={styles.cellInput}
                      value={row.price}
                      onChange={(e) => handleChange(index, "price", e.target.value)}
                    />
                  </td>

                  <td style={styles.td}>
                    <input style={styles.cellInput} value={row.total} readOnly />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.buttonBlock}>
          <button type="button" style={styles.button} onClick={addRow}>
            Добавить строку
          </button>

          <button type="button" style={styles.button} onClick={() => window.print()}>
            Печать
          </button>
        </div>

        <div style={styles.costRow}>
          <label style={styles.label}>Стоимость работ составит:</label>
          <input style={styles.input} />
        </div>

        <div style={styles.costRow}>
          <label style={styles.label}>Стоимость материалов составит:</label>
          <input style={styles.input} />
        </div>

        <div style={styles.conclusionBlock}>
          <label style={styles.label}>Заключение комиссии</label>
          <textarea style={styles.conclusionTextarea} />
        </div>

        <div style={styles.signatures}>
          <div style={styles.signLeft}>
            <label style={styles.label}>Председатель комиссии</label>
          </div>
          <input style={styles.signatureInput} value="Главный инженер" readOnly />
          <div style={styles.signatureLine}></div>
          <input style={styles.signatureInput} value="Титаренко В.С." readOnly />

          <div style={styles.signLeft}>
            <label style={styles.label}>Члены комиссии</label>
          </div>
          <input style={styles.signatureInput} value="Менеджер проекта" readOnly />
          <div style={styles.signatureLine}></div>
          <input style={styles.signatureInput} />

          <div></div>
          <input
            style={styles.signatureInput}
            value="Начальник строительного участка"
            readOnly
          />
          <div style={styles.signatureLine}></div>
          <input style={styles.signatureInput} />

          <div></div>
          <input style={styles.signatureInput} value="Инженер ПТО" readOnly />
          <div style={styles.signatureLine}></div>
          <input style={styles.signatureInput} />

          <div></div>
          <input style={styles.signatureInput} value="Субподрядчик" readOnly />
          <div style={styles.signatureLine}></div>
          <input style={styles.signatureInput} />
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#f3f3f3",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "Times New Roman, serif",
    color: "#000",
  },

  sheet: {
    background: "#fff",
    padding: "28px 24px",
    maxWidth: 1500,
    margin: "0 auto",
    border: "1px solid #cfcfcf",
  },

  topRow: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 10,
    alignItems: "center",
    marginBottom: 25,
  },

  title: {
    textAlign: "center",
    fontSize: 30,
    fontWeight: "bold",
    margin: "0 0 6px",
  },

  subtitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 30,
  },

  objectRow: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 10,
    alignItems: "center",
    marginBottom: 10,
  },

  label: {
    fontWeight: "bold",
    fontSize: 16,
  },

  input: {
    border: "none",
    borderBottom: "1px solid #000",
    padding: "4px 6px",
    fontSize: 16,
    fontFamily: "Times New Roman, serif",
    outline: "none",
    background: "transparent",
  },

  numberInput: {
    width: 85,
    border: "none",
    borderBottom: "1px solid #000",
    outline: "none",
    fontFamily: "Times New Roman, serif",
    fontSize: 16,
    textAlign: "center",
  },

  dayInput: {
    width: 45,
    border: "none",
    borderBottom: "1px solid #000",
    outline: "none",
    fontFamily: "Times New Roman, serif",
    fontSize: 16,
    textAlign: "center",
  },

  monthInput: {
    width: 180,
    border: "none",
    borderBottom: "1px solid #000",
    outline: "none",
    fontFamily: "Times New Roman, serif",
    fontSize: 16,
    textAlign: "center",
  },

  tableWrapper: {
    overflowX: "auto",
    marginTop: 18,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 14,
  },

  th: {
    border: "1px solid #000",
    padding: "8px 5px",
    background: "#f7f7f7",
    textAlign: "center",
    verticalAlign: "middle",
    fontWeight: "bold",
    lineHeight: 1.15,
  },

  td: {
    border: "1px solid #000",
    padding: 0,
    height: 66,
    verticalAlign: "top",
  },

  textarea: {
    width: "100%",
    height: "100%",
    minHeight: 66,
    border: "none",
    resize: "vertical",
    padding: 5,
    boxSizing: "border-box",
    fontFamily: "Times New Roman, serif",
    fontSize: 14,
    outline: "none",
    background: "transparent",
  },

  cellInput: {
    width: "100%",
    height: "100%",
    border: "none",
    padding: 5,
    boxSizing: "border-box",
    textAlign: "center",
    fontFamily: "Times New Roman, serif",
    fontSize: 14,
    outline: "none",
    background: "transparent",
  },

  buttonBlock: {
    display: "flex",
    gap: 10,
    marginTop: 18,
    marginBottom: 22,
  },

  button: {
    padding: "10px 18px",
    border: "1px solid #333",
    background: "#fff",
    cursor: "pointer",
    fontSize: 15,
    fontFamily: "Times New Roman, serif",
  },

  costRow: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
  },

  conclusionBlock: {
    marginTop: 8,
  },

  conclusionTextarea: {
    width: "100%",
    minHeight: 64,
    marginTop: 4,
    border: "1px solid #000",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "Times New Roman, serif",
    fontSize: 16,
    outline: "none",
  },

  signatures: {
    display: "grid",
    gridTemplateColumns: "190px 1fr 190px 240px",
    gap: "10px 8px",
    alignItems: "end",
    marginTop: 28,
  },

  signLeft: {
    alignSelf: "center",
  },

  signatureInput: {
    border: "none",
    borderBottom: "1px solid #000",
    padding: "4px 4px",
    fontSize: 16,
    fontFamily: "Times New Roman, serif",
    outline: "none",
    background: "transparent",
  },

  signatureLine: {
    borderBottom: "1px solid #000",
    height: 26,
  },
};