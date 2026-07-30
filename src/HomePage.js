import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, getAuth } from "firebase/auth";
import { auth } from "./firebase";

// Тестовая группа для «Умной заявки» — пока фича обкатывается, кнопка на
// главной показывается только этим email. Остальные видят обычную главную.
const SMART_REQUEST_TESTERS = [
  "admin@vkdev.kz",
  "adamenko24051991@gmail.com",
  "nach.razv@vkdevgroup.kz",
  "b.azimhan@vkdevgroup.kz",
  "f.bayahmetov_eu@vkdevgroup.kz",
  "a.bizhumanov@vkdevgroup.kz",
  "pom.pto@vkdevgroup.kz",
  "r.jakenulas@vkdevgroup.kz",
  "zhumabaev016@icloud.com",
  "d.kisselev@vkdevgroup.kz",
  "nachit@vkdevgroup.kz",
  "e.makazhanov_eu@vkdevgroup.kz",
  "manarbekovanuar242@gmail.com",
  "b.mashut_eu@vkdevgroup.kz",
  "mendybayev93@mail.ru",
  "d.merzlov@vkdevgroup.kz",
  "vk.master@vkdevgroup.kz",
  "manat.vko.best@gmail.com",
  "d.salangin@vkdevgroup.kz",
  "salauatsamatov84@gmail.com",
  "xaxaxafaf05@gmail.com",
  "stepanenkomikhail0@gmail.com",
  "v.titarenko@vkdevgroup.kz",
  "nach.ovvk@vkdevgroup.kz",
  "geo9@vkdevgroup.kz",
];

const HomePage = () => {
  const navigate = useNavigate();

  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || "";
  const canUseSmartRequest = SMART_REQUEST_TESTERS.includes(currentEmail);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerWrapper}>
        <img src="/Логотип.png" alt="Логотип" style={styles.logo} />

        <span
          onClick={handleLogout}
          style={styles.logoutLink}
        >
          Выход
        </span>
      </div>

      <h1>Добро пожаловать!</h1>

      {canUseSmartRequest && (
        <button onClick={() => navigate('/smart-request')} style={styles.smartButton}>
          ✦ Умная заявка (AI)
        </button>
      )}

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

      <button onClick={() => navigate('/lab-request')} style={styles.button}>
        Лабораторные испытания
      </button>

      <button onClick={() => navigate('/blbrequest')} style={styles.button}>
        Заявка на брусчатку
      </button>

      <button onClick={() => navigate('/znbrequest')} style={styles.button}>
        Заявка на ж/б изделия
      </button>

      <button onClick={() => navigate('/people-report')} style={styles.button}>
        Отчёты по людям
      </button>

      <button
        onClick={() => navigate('/reports-dashboard')}
        style={{ ...styles.button, background: 'red' }}
      >
        Графики и отчёты
      </button>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    textAlign: 'center',
    gap: '20px',
    paddingTop: '40px',
    position: 'relative'
  },

  headerWrapper: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    justifyContent: 'center'
  },

  logo: {
    width: '300px',
    marginBottom: '20px'
  },

  logoutLink: {
    position: 'absolute',
    top: '0',
    right: '40px',
    color: '#007bff',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    borderBottom: '2px solid #007bff',
    lineHeight: '1.0',
    paddingBottom: '1px'
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
  smartButton: {
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #6610f2, #007bff)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    width: '300px',
    boxShadow: '0 4px 12px rgba(102,16,242,0.35)',
  }
};

export default HomePage;