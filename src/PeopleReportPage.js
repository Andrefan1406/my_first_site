import React from 'react';
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

export default PeopleReportPage;