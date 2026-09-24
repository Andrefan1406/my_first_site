// Блокирует переход на страницу заявки для пользователя, которого вручную
// заблокировал администратор (см. manualBlockGate.js) — прямой аналог
// GprReportGuard.jsx/PeopleGapsGuard.jsx, стоит снаружи них (App.js), чтобы
// ручная причина показывалась первой. Заявки из Умной заявки
// (location.state.viaSmartRequest) так же пропускаются.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { fetchManualBlock, manualBlockMessage } from '../manualBlockGate';

const ManualBlockGuard = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || '';
  const bypassed = !!location.state?.viaSmartRequest;

  const [status, setStatus] = useState(currentEmail && !bypassed ? 'checking' : 'clear');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!currentEmail || bypassed) return;
    let cancelled = false;

    fetchManualBlock()
      .then(({ blocked, comment: text }) => {
        if (cancelled) return;
        setComment(text);
        setStatus(blocked ? 'blocked' : 'clear');
      })
      .catch((err) => {
        // Fail-open, как и в остальных guard'ах.
        console.error('Не удалось проверить ручную блокировку:', err);
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
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{manualBlockMessage(comment)}</p>
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

export default ManualBlockGuard;
