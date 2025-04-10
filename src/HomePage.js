import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState(null);

  useEffect(() => {
    const alreadyVisited = sessionStorage.getItem('visited_homepage');
  
    const fetchCount = () => {
      fetch("http://localhost:5000/api/visitor-count")
        .then(res => res.json())
        .then(data => setCount(data.count))
        .catch(err => console.error("Ошибка при получении счётчика:", err));
    };
  
    if (alreadyVisited) {
      // Пользователь уже был → просто получаем значение
      fetchCount();
    } else {
      // Первый заход → увеличиваем счётчик
      fetch("http://localhost:5000/api/increment-visitor", {
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
      
      <button 
        onClick={() => navigate('/request')} 
        style={styles.button}
      >
        Заявка на технику
      </button>
      <button 
        onClick={() => navigate('/concrete-request')} 
        style={styles.button}
      >
        Заявка на бетон и раствор
      </button>
      <button 
        onClick={() => navigate('/electricans-request')} 
        style={styles.button}
      >
        Заявка электриков
      </button>
      <button 
        onClick={() => navigate('/geo-request')} 
        style={styles.button}
      >
        Заявка геодезистов
      </button>
      <button 
        onClick={() => navigate('/people-report')} 
        style={styles.button}
      >
        Отчёты по людям
      </button>
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        fontSize: '16px',
        opacity: 0.7
      }}>
        <span role="img" aria-label="eye">👁️</span> {count !== null ? count : '...'}
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
    gap: '20px'
  },
  logo: {
    width: '300px', // Измените размер логотипа, если нужно
    marginBottom: '20px' // Отступ перед заголовком
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
  }
};

export default HomePage;
