// Блокирует переход НА САМУ страницу заявки (а не только отправку формы —
// см. проверки внутри ConcreteRequestPage.js) для пользователя из
// peopleGapsGate.js, пока по его участку есть неподтверждённые пропуски
// отчётности за последние дни. Работает и при прямом переходе по ссылке —
// это не кнопка на главной, а обёртка вокруг самого роута (см. App.js).
// Исключение: заявки, пришедшие из Умной заявки (SmartRequestPage.jsx
// передаёт location.state.viaSmartRequest), блокировку не проходят —
// пользователь уже осознанно подаёт заявку через AI-помощника.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { fetchMissingGapDates, gapWarningMessage } from '../peopleGapsGate';

const PeopleGapsGuard = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || '';
  const bypassed = !!location.state?.viaSmartRequest;

  // Кого именно проверять, сервер решает сам по people_gap_check_rules (см.
  // peopleGapsGate.js) — для email без правил fetchMissingGapDates вернёт
  // пустой список, страница просто откроется. 'clear' по умолчанию без
  // залогиненного email (или при обходе через Умную заявку) — им не нужно
  // ждать сетевой запрос, чтобы увидеть страницу.
  const [status, setStatus] = useState(currentEmail && !bypassed ? 'checking' : 'clear');
  const [missingDates, setMissingDates] = useState([]);

  useEffect(() => {
    if (!currentEmail || bypassed) return;
    let cancelled = false;

    fetchMissingGapDates()
      .then((dates) => {
        if (cancelled) return;
        setMissingDates(dates);
        setStatus(dates.length ? 'blocked' : 'clear');
      })
      .catch((err) => {
        // Проверка недоступна (сеть/бэкенд) — не блокируем страницу из-за
        // этого, тот же fail-open, что и в остальных местах (peopleGapsGate.js).
        console.error('Не удалось проверить пропуски в отчётах по людям:', err);
        if (!cancelled) setStatus('clear');
      });

    return () => {
      cancelled = true;
    };
  }, [currentEmail, bypassed]);

  if (status === 'checking') {
    return <div style={styles.wrap}>Проверка доступа...</div>;
  }

  if (status === 'blocked') {
    return (
      <div style={styles.wrap}>
        <div style={styles.box}>
          <p style={{ margin: 0 }}>{gapWarningMessage(missingDates)}</p>
          <button style={styles.button} onClick={() => navigate('/')}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  return children;
};

const styles = {
  wrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    padding: '20px',
    textAlign: 'center',
  },
  box: {
    maxWidth: '480px',
    background: '#fff0f0',
    border: '1px solid #f5b5b5',
    borderRadius: '10px',
    padding: '24px',
    color: '#c00',
    fontWeight: 600,
  },
  button: {
    marginTop: '16px',
    padding: '10px 20px',
    background: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
};

export default PeopleGapsGuard;
