import React  from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      {/* Логотип вверху страницы */}
      <img src="/Логотип.png" alt="Логотип" style={styles.logo} />

      <h1>Добро пожаловать!</h1>

      <button onClick={() => navigate('/request')} style={styles.button}>
        Заявка на технику
      </button>
      <button onClick={() => navigate('/concrete-request2')} style={styles.button}>
        Заявка на бетон и раствор
      </button>
      <button onClick={() => navigate('/electricans-request')} style={styles.button}>
        Заявка электриков
      </button>
      <button onClick={() => navigate('/geo-request')} style={styles.button}>
        Заявка геодезистов
      </button>
      <button onClick={() => navigate('/people-report')} style={styles.button}>
        Отчёты по людям
      </button>
      <button onClick={() => navigate('/reports-dashboard')} style={{ ...styles.button, background: 'red' }}>
        Графики и отчёты
      </button>
      <button onClick={() => navigate('/blbrequest')} style={styles.button}>
        Заявка на брусчатку (Тестирование)
      </button>
      <button onClick={() => navigate('/znbrequest')} style={styles.button}>
        Заявка на ж/б изделия (Тестирование)
      </button>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    textAlign: 'center',
    gap: '20px',
    position: 'relative'
  },
  logo: {
    width: '300px',
    marginBottom: '20px'
  },
  button: {
    padding: '10px 20px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    width: '300px'
  },
  viewCounter: {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    fontSize: '16px',
    opacity: 0.7,
    display: 'flex',
    alignItems: 'center'
  }
};

export default HomePage;
