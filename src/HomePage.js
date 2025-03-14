import React from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

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
