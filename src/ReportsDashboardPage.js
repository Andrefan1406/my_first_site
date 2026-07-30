import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth } from "firebase/auth";

const ReportsDashboardPage = () => {
  const navigate = useNavigate();

  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || "";
  const isAdmin = currentEmail === "admin@vkdev.kz";

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>Направления отчётности</h2>
      <button
        onClick={() => navigate('/concrete-chat')}
        style={styles.smartButton}
      >
        ✦ Чат-аналитика (AI)
      </button>
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
      <button
        onClick={() => navigate('/concrete-daily-report')}
        style={styles.button}
      >
        Ежедневный отчет БРУ
      </button>
      <button
        onClick={() => navigate('/concrete-dashboard')}
        style={{ ...styles.button, background: '#6c3ba3' }}
      >
        Дашборд по бетону и раствору
      </button>
      {isAdmin && (
        <button
          onClick={() => navigate('/admin/people-gaps')}
          style={{ ...styles.button, background: '#444' }}
        >
          ⚙ Пропуски в отчётах по людям
        </button>
      )}
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
  },
  smartButton: {
    display: 'block',
    margin: '10px auto',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #6610f2, #007bff)',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    width: '250px',
    boxShadow: '0 4px 12px rgba(102,16,242,0.35)',
  }
};

export default ReportsDashboardPage;
