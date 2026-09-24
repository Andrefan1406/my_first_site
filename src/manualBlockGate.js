// Ручная блокировка пользователя администратором (см. server/manualBlock.js,
// управляется на /admin/blocked-users) — в дополнение к автоматическим
// блокировкам peopleGapsGate.js/gprReportGate.js. comment — текст от
// администратора, показывается пользователю на главной выше остальных
// причин блокировки.
import { getAuth } from 'firebase/auth';

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || 'http://localhost:4000';

export const manualBlockMessage = (comment) =>
  `Доступ к подаче заявок ограничен администратором${comment ? `: ${comment}` : '.'}`;

// Возвращает { blocked, comment } для текущего залогиненного пользователя.
// Ошибку сети/бэкенда не глотает — тот же fail-open у вызывающего кода, что и
// в peopleGapsGate.js/gprReportGate.js.
export async function fetchManualBlock() {
  const email = getAuth().currentUser?.email;
  if (!email) return { blocked: false, comment: '' };

  const params = new URLSearchParams({ email });
  const res = await fetch(`${API_URL}/api/manual-block/check?${params.toString()}`);
  const data = await res.json();
  return { blocked: !!data.blocked, comment: data.comment || '' };
}
