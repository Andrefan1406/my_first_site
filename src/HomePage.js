import React from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
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