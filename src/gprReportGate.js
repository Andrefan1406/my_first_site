// Общая логика блокировки подачи заявок для пользователей, у которых есть
// незакрытый пропуск в ГПР — сразу по нескольким источникам (см. SOURCES в
// server/syncGprReport.js: лист "64,72" — только поз.64, лист "НЖ3" — все
// его позиции). Тот же принцип, что и src/peopleGapsGate.js, только по
// своему списку email (server/db.js: gpr_report_check_rules, управляется
// через /admin/users, см. server/gprReportAdmin.js: /check-rules). Для
// email без правил fetchGprReportBlock просто вернёт blocked:false —
// проверка прозрачна для всех остальных пользователей.
import { getAuth } from 'firebase/auth';

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || 'http://localhost:4000';

const GAP_LIST_THRESHOLD = 5;

// "поз.64 / Витражи" — work_name один и тот же может встречаться у разных
// позиций и источников (например, "Отопление" почти у каждой позиции НЖ3),
// поэтому в сообщении всегда указываем позицию, а не только конструктив.
const gapLabel = (g) => `${g.position} / ${g.work_name}`;

export const gprBlockMessage = (gaps) => {
  const labels = gaps.map(gapLabel);
  if (labels.length > GAP_LIST_THRESHOLD) {
    return `Не заполнен отчёт по ГПР. Не хватает данных по ${labels.length} позициям/конструктивам за прошлую пятницу или раньше.`;
  }
  return `Не заполнен отчёт по ГПР. Внесите % готовности за прошлую пятницу или раньше по: ${labels.join(', ')}.`;
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
