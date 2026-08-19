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
// Блок (только у "Фасады" — см. SOURCES[].blockMarkerRe) добавляем, только
// если он есть: у позиции может быть несколько блоков с одинаковым
// work_name, без блока сообщение было бы неоднозначным.
const gapLabel = (g) => `${g.position}${g.block ? ` / ${g.block}` : ''} / ${g.work_name}`;

export const gprBlockMessage = (gaps) => {
  const labels = gaps.map(gapLabel);
  if (labels.length > GAP_LIST_THRESHOLD) {
    // labels.length — число строк (конструктивов) с пропуском, не ячеек:
    // gaps — один элемент на (позиция, блок, конструктив), не на дату. Не
    // "позициям" — в проектах компании "позиция" означает строящийся дом,
    // а не строку таблицы, эта формулировка вводила в заблуждение.
    return `В отчёте по ГПР есть пропуски: не заполнено ${labels.length} ${rowsWord(labels.length)} за прошлую пятницу или раньше.`;
  }
  return `Не заполнен отчёт по ГПР. Внесите % готовности за прошлую пятницу или раньше по: ${labels.join(', ')}.`;
};

// Русское склонение "строка/строки/строк" по числу.
function rowsWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'строка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'строки';
  return 'строк';
}

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
