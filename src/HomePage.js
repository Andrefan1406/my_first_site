import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye } from 'react-icons/fa';

const HomePage = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState(null);

  useEffect(() => {
    const alreadyVisited = sessionStorage.getItem('visited_homepage');
    const SERVER_URL = "https://visitor-counter-server.onrender.com";

    const fetchCount = () => {
      fetch(`${SERVER_URL}/api/visitor-count`)
        .then(res => res.json())
        .then(data => setCount(data.count))
        .catch(err => console.error("Ошибка при получении счётчика:", err));
    };

    if (alreadyVisited) {
      fetchCount();
    } else {
      fetch(`${SERVER_URL}/api/increment-visitor`, {
        method: "POST"
      })
        .then(res => res.json())
        .then(data => {
          setCount(data.count);
          sessionStorage.setItem('visited_homepage', 'true');
        })
        .catch(err => console.error("Ошибка при увеличении счётчика:", err));
    }
  }, []);

  return (
    <div style={styles.container}>
      {/* Логотип вверху страницы */}
      <img src="/Логотип.png" alt="Логотип" style={styles.logo} />

      <h1>Добро пожаловать!</h1>

      <button onClick={() => navigate('/request')} style={styles.button}>
        Заявка на технику
      </button>
      <button onClick={() => navigate('/concrete-request')} style={styles.button}>
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
      <button onClick={() => navigate('/concrete-request2')} style={styles.button}>
        В разработке
      </button>

      {/* Счётчик просмотров */}
      <div style={styles.viewCounter}>
        <FaEye style={{ marginRight: '5px' }} /> {count !== null ? count : '...'}
      </div>
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
