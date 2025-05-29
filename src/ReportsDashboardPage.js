import React from 'react';
import { useNavigate } from 'react-router-dom';

const ReportsDashboardPage = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Направления отчётности</h2>
      <button 
        onClick={() => navigate('/people-dashboard')} 
        style={styles.button}
      >
        Отчётность по людям
      </button>
      <button 
        onClick={() => navigate('/equipment-report')} 
        style={styles.button}
      >
        Отчётность по технике
      </button>
      <button 
        onClick={() => navigate('/concrete-report')} 
        style={styles.button}
      >
        Отчётность БРУ
      </button>
    </div>
    
  );
};

const styles = {
  button: {
    display: 'block',
    margin: '10px auto',
    padding: '10px 20px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    width: '250px'
  }
};

export default ReportsDashboardPage;
