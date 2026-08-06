import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, getAuth } from "firebase/auth";
import { auth } from "./firebase";
import { fetchMissingGapDates, gapWarningMessage } from './peopleGapsGate';

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

const ADMIN_EMAIL = "admin@vkdev.kz";

const HomePage = () => {
  const navigate = useNavigate();

  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || "";
  const canUseSmartRequest = SMART_REQUEST_TESTERS.includes(currentEmail);
  const isAdmin = currentEmail === ADMIN_EMAIL;

  // Показываем предупреждение сразу на главной (а не только в момент
  // отправки заявки на бетон/раствор — см. ConcreteRequestPage.js), чтобы
  // пользователь не тратил время на заполнение формы, которую всё равно
  // не даст отправить.
  const [missingGapDates, setMissingGapDates] = useState([]);

  useEffect(() => {
    if (!currentEmail) return;
    fetchMissingGapDates()
      .then(setMissingGapDates)
      .catch((err) => console.error('Не удалось проверить пропуски в отчётах по людям:', err));
  }, [currentEmail]);

  const isRequestsBlocked = missingGapDates.length > 0;

  const handleLogout = async () => {
    if (!window.confirm('Вы уверены, что хотите выйти?')) return;
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      {/* Обычный поток (не absolute), одна короткая строка над логотипом —
          так блок с email/выходом физически не может наложиться на логотип
          ни на какой ширине экрана и не тянет за собой вертикальный скролл
          (в отличие от прежнего варианта с absolute-позиционированием). */}
      <div style={styles.accountBar}>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            style={styles.adminLink}
            title="Личный кабинет"
          >
            {currentEmail.split('@')[0]}
          </button>
        ) : (
          <span style={styles.accountEmail}>{currentEmail.split('@')[0]}</span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          style={styles.logoutIconBtn}
          title="Выход"
          aria-label="Выход"
        >
          ➤
        </button>
      </div>

      <img src="/Логотип.png" alt="Логотип" style={styles.logo} />

      <h1>Добро пожаловать!</h1>

      {missingGapDates.length > 0 && (
        <div style={styles.gapWarning}>{gapWarningMessage(missingGapDates)}</div>
      )}

      {canUseSmartRequest && (
        <button onClick={() => navigate('/smart-request')} style={styles.smartButton}>
          ✦ Умная заявка (AI)
        </button>
      )}

      <button
        onClick={() => navigate('/request')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Заявка на технику
      </button>

      <button
        onClick={() => navigate('/concrete-request')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Заявка на бетон и раствор
      </button>

      <button
        onClick={() => navigate('/electricans-request')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Заявка электриков
      </button>

      <button
        onClick={() => navigate('/geo-request')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Заявка геодезистов
      </button>

      <button
        onClick={() => navigate('/lab-request')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Лабораторные испытания
      </button>

      <button
        onClick={() => navigate('/blbrequest')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
        Заявка на брусчатку
      </button>

      <button
        onClick={() => navigate('/znbrequest')}
        disabled={isRequestsBlocked}
        style={isRequestsBlocked ? styles.buttonDisabled : styles.button}
        title={isRequestsBlocked ? gapWarningMessage(missingGapDates) : undefined}
      >
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

  logo: {
    width: '300px',
    maxWidth: '80%'
  },

  accountBar: {
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '8px',
    padding: '0 20px',
    boxSizing: 'border-box'
  },

  accountEmail: {
    color: '#666',
    fontSize: '12px',
    fontWeight: '500'
  },

  adminLink: {
    background: 'none',
    border: 'none',
    color: '#6610f2',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '600',
    padding: '0',
    textDecoration: 'underline',
  },

  logoutIconBtn: {
    background: 'none',
    border: 'none',
    color: '#007bff',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: '1',
    padding: '2px'
  },

  gapWarning: {
    background: '#fff0f0',
    color: '#c00',
    border: '1px solid #f5b5b5',
    borderRadius: '8px',
    padding: '12px 18px',
    maxWidth: '420px',
    fontSize: '14px',
    fontWeight: '600',
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
  buttonDisabled: {
    padding: '10px 20px',
    background: '#b0b0b0',
    color: '#e8e8e8',
    border: 'none',
    borderRadius: '5px',
    cursor: 'not-allowed',
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