// Общая логика ограничения подачи заявок для пользователей, у которых есть
// ЛЮБОЙ незакрытый пропуск отчётности по людям (за всю историю их участка,
// кроме сегодняшнего дня) по закреплённому за ними участку — см.
// server/peopleGapsCheck.js. Кто именно проверяется и по какому участку
// теперь настраивается через админ-панель /admin/users (people_gap_check_rules
// в БД, см. server/peopleGapsAdmin.js: /check-rules), а не захардкожено —
// для email без правил fetchMissingGapDates просто вернёт пустой список, то
// есть проверка прозрачна для всех остальных пользователей. Используется и
// на главной (HomePage.js — чтобы предупредить сразу при входе, не дожидаясь
// заполнения формы), и в самой форме заявки на бетон/раствор
// (ConcreteRequestPage.js — как последний рубеж перед фактической отправкой).
import { getAuth } from 'firebase/auth';

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || 'http://localhost:4000';

const formatDate = (date) => date.toISOString().split('T')[0];

// Склонение "дата/даты/дат" по числу — при сотнях пропущенных дней (см.
// computeMissingDates на сервере — это вся история участка) полный список
// в баннере/алерте нечитаем, поэтому свыше GAP_LIST_THRESHOLD показываем
// только количество и самую раннюю дату, а не все даты подряд.
function pluralDates(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'дата';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'даты';
  return 'дат';
}

const GAP_LIST_THRESHOLD = 5;

export const gapWarningMessage = (missingDates) => {
  const count = missingDates.length;
  if (count > GAP_LIST_THRESHOLD) {
    const first = missingDates[0];
    return `Подача заявок недоступна. Не хватает отчётов по людям: ${count} ${pluralDates(count)}, первая — ${first}.`;
  }
  return `Подача заявок недоступна. Сначала необходимо предоставить отчёт по людям за следующие даты: ${missingDates.join(', ')}.`;
};

// Возвращает ВСЕ даты (за всю историю участка(ов), закреплённых за текущим
// пользователем в people_gap_check_rules), за которые нет отчёта — кроме
// сегодняшней (она ещё не закончилась, отчёт может быть просто пока не
// подан) — пустой массив, если пропусков нет ИЛИ если за этим email вообще
// не закреплено ни одного правила (значит, проверка на него не
// распространяется). Ошибку сети/бэкенда не глотает — обработку решает
// вызывающий код (см. использование ниже: на главной просто не показываем
// баннер, в форме — не блокируем отправку). Без залогиненного пользователя
// не запрашивает ничего — вернёт пустой список.
export async function fetchMissingGapDates() {
  const email = getAuth().currentUser?.email;
  if (!email) return [];

  const today = formatDate(new Date());
  const params = new URLSearchParams({ email, today });
  const res = await fetch(`${API_URL}/api/people-gaps/check?${params.toString()}`);
  const data = await res.json();
  return data.missingDates || [];
}
