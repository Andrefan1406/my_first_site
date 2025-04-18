/* import React from 'react';
import { useNavigate } from 'react-router-dom'; // Или useHistory для react-router-dom v5

const PeopleReportPage = () => {
  const navigate = useNavigate(); // Для react-router-dom v6
  // const history = useHistory(); // Для react-router-dom v5
  
  // URL с дополнительными параметрами для скрытия интерфейса
  const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSKPriusPx1zZKLa1-wYhi2zJ_HXibB0drsS4_mHcA2-yGjtDH-Lu2XRe7-X0meN18_eUef5vC8IPv_/pubhtml?gid=1723079056&single=true&range=A1:C22&widget=false&headers=false&chrome=false";

  const handleGoBack = () => {
    navigate(-1); // Для react-router-dom v6
    // history.goBack(); // Для react-router-dom v5
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Таблица не сдавших сегодняшний отчёт</h2>
      <div style={styles.tableWrapper}>
        <iframe
          src={sheetUrl}
          width="100%"
          height="500"
          style={styles.iframe}
          frameBorder="0"
          title="Отчёт по сотрудникам"
        />
      </div>
      <button onClick={handleGoBack} style={styles.backButton}>
        ← Назад
      </button>
    </div>
  );
};

const styles = {
  container: {
    width: "100%",
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "10px",
    boxSizing: "border-box",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    position: 'relative',
  },
  backButton: {
    display: 'block',
    margin: '30px auto 0',
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'background-color 0.3s',
  },
  title: {
    textAlign: 'center',
    flex: 1,
    margin: 0,
  },
  tableWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    overflowX: 'auto',
  },
  iframe: {
    width: '100%',
    maxWidth: '600px',
    height: '500px',
    border: 'none',
    background: 'transparent',
  },  
};

export default PeopleReportPage; */
import React, { useState } from 'react';

const PeopleReportForm = () => {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([
    { object: '', position: '', work: '', contractor: '', count: '', note: '' }
  ]);

  const emptyRow = { object: '', position: '', work: '', contractor: '', count: '', note: '' };

  const handleInputChange = (index, field, value) => {
    const updatedRows = [...rows];
    updatedRows[index][field] = value;
    setRows(updatedRows);
  };

  const handleAddRowAt = (index) => {
    const updatedRows = [...rows];
    updatedRows.splice(index + 1, 0, { ...emptyRow });
    setRows(updatedRows);
  };

  const handleClear = () => {
    setRows([{ ...emptyRow }]);
  };

  const handleSubmit = () => {
    const data = rows.map(row => ({ date: reportDate, ...row }));
    console.log("Отправленные данные:", data);
    // Здесь можно добавить fetch() или axios.post() для отправки на сервер
  };

  return (
    <div style={styles.container}>
      <h2>Отчёт по людям</h2>
      <label>
        Дата:
        <input
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
          style={styles.dateInput}
        />
      </label>

      <table style={styles.table}>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Объект</th>
            <th>Позиция</th>
            <th>Наименование работ/профессий</th>
            <th>Подрядчик</th>
            <th>Количество людей</th>
            <th>Примечание</th>
            <th>+</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>{reportDate}</td>
              <td><input value={row.object} onChange={e => handleInputChange(index, 'object', e.target.value)} /></td>
              <td><input value={row.position} onChange={e => handleInputChange(index, 'position', e.target.value)} /></td>
              <td><input value={row.work} onChange={e => handleInputChange(index, 'work', e.target.value)} /></td>
              <td><input value={row.contractor} onChange={e => handleInputChange(index, 'contractor', e.target.value)} /></td>
              <td><input type="number" value={row.count} onChange={e => handleInputChange(index, 'count', e.target.value)} /></td>
              <td><input value={row.note} onChange={e => handleInputChange(index, 'note', e.target.value)} /></td>
              <td>
                <button onClick={() => handleAddRowAt(index)} style={styles.plusButton}>＋</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.buttons}>
        <button style={styles.submitButton} onClick={handleSubmit}>Отправить отчёт</button>
        <button style={styles.clearButton} onClick={handleClear}>Очистить</button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    fontFamily: 'sans-serif',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  dateInput: {
    marginLeft: '10px',
    padding: '5px',
    fontSize: '14px',
  },
  table: {
    width: '100%',
    marginTop: '20px',
    borderCollapse: 'collapse',
  },
  buttons: {
    marginTop: '20px',
    display: 'flex',
    gap: '10px'
  },
  submitButton: {
    padding: '10px',
    backgroundColor: 'dodgerblue',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  clearButton: {
    padding: '10px',
    backgroundColor: 'crimson',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
  },
  plusButton: {
    fontSize: '24px',
    width: '36px',
    height: '36px',
    backgroundColor: '#28a745', // ярко-зелёный
    color: 'white',
    border: 'none',
    borderRadius: '50%', // круглая форма
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 4px rgba(0,0,0,0.2)',
    transition: 'background-color 0.3s',
  },
};

export default PeopleReportForm;
