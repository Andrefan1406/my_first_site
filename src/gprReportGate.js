// Общая логика блокировки подачи заявок для пользователей, у которых есть
// незакрытый пропуск в ГПР (позиция 64, см. server/gprReportCheck.js) —
// тот же принцип, что и src/peopleGapsGate.js, только по своему списку
// email (server/db.js: gpr_report_check_rules, управляется через
// /admin/users, см. server/gprReportAdmin.js: /check-rules). Для email без
// правил fetchGprReportBlock просто вернёт blocked:false — проверка
// прозрачна для всех остальных пользователей.
import { getAuth } from 'firebase/auth';

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || 'http://localhost:4000';

const GAP_LIST_THRESHOLD = 5;

export const gprBlockMessage = (gaps) => {
  const names = gaps.map((g) => g.work_name);
  if (names.length > GAP_LIST_THRESHOLD) {
    return `Не заполнен отчёт по ГПР 64. Не хватает данных по ${names.length} конструктивам за прошлую пятницу или раньше.`;
  }
  return `Не заполнен отчёт по ГПР 64. Внесите % готовности за прошлую пятницу или раньше по: ${names.join(', ')}.`;
};

// Возвращает { blocked, gaps } для текущего залогиненного пользователя.
// Без залогиненного email не запрашивает ничего — вернёт blocked:false.
// Ошибку сети/бэкенда не глотает — обработку решает вызывающий код (тот же
// fail-open, что и в peopleGapsGate.js: при сбое проверки страницу/кнопку
// не блокируем).
export async function fetchGprReportBlock() {
  const email = getAuth().currentUser?.email;
  if (!email) return { blocked: false, gaps: [] };

  const params = new URLSearchParams({ email });
  const res = await fetch(`${API_URL}/api/gpr-report/check?${params.toString()}`);
  const data = await res.json();
  return { blocked: !!data.blocked, gaps: data.gaps || [] };
}
