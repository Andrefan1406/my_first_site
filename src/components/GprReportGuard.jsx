// Блокирует переход НА САМУ страницу заявки (не только отправку формы) для
// пользователя из gprReportGate.js, пока в ГПР (позиция 64) есть незакрытый
// пропуск — прямой аналог PeopleGapsGuard.jsx, только по другому списку
// email и с другим сообщением. Работает и при прямом переходе по ссылке —
// это обёртка вокруг самого роута (см. App.js), а не кнопка на главной.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { fetchGprReportBlock, gprBlockMessage } from '../gprReportGate';

const GprReportGuard = ({ children }) => {
  const navigate = useNavigate();
  const currentEmail = getAuth().currentUser?.email?.toLowerCase() || '';

  // Кого именно проверять, сервер решает сам по gpr_report_check_rules —
  // для email без правил fetchGprReportBlock вернёт blocked:false, страница
  // просто откроется. 'clear' по умолчанию без залогиненного email — им не
  // нужно ждать сетевой запрос, чтобы увидеть страницу.
  const [status, setStatus] = useState(currentEmail ? 'checking' : 'clear');
  const [gaps, setGaps] = useState([]);

  useEffect(() => {
    if (!currentEmail) return;
    let cancelled = false;

    fetchGprReportBlock()
      .then(({ blocked, gaps: gapList }) => {
        if (cancelled) return;
        setGaps(gapList);
        setStatus(blocked ? 'blocked' : 'clear');
      })
      .catch((err) => {
        // Проверка недоступна (сеть/бэкенд) — не блокируем страницу из-за
        // этого, тот же fail-open, что и в остальных местах (gprReportGate.js).
        console.error('Не удалось проверить пропуски в отчётах ГПР:', err);
        if (!cancelled) setStatus('clear');
      });

    return () => {
      cancelled = true;
    };
  }, [currentEmail]);

  if (status === 'checking') {
    return <div style={styles.wrap}>Проверка доступа...</div>;
  }

  if (status === 'blocked') {
    return (
      <div style={styles.wrap}>
        <div style={styles.box}>
          <p style={{ margin: 0 }}>{gprBlockMessage(gaps)}</p>
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

export default GprReportGuard;
