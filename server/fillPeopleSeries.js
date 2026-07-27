// Восстановление непрерывного временного ряда ежедневных отчётов по людям.
//
// Проблема: начальники участков иногда забывают сдать отчёт за день. В исходной
// таблице (people_reports) при этом просто нет строк за этот день по этому
// участку — визуально таблица "без дыр", но временной ряд по участку рвётся.
//
// Правила восстановления (см. ТЗ):
//   1. Рабочий день (Пн-Пт) без отчёта -> считается ЗАБЫТЫМ отчётом: строка
//      создаётся автоматически, все показатели копируются с ближайшего
//      предыдущего дня этого же участка (LOCF, Last Observation Carried
//      Forward), запись помечается is_filled = true.
//   2. Суббота/воскресенье без отчёта -> это НЕ ошибка (участок мог не
//      работать), запись не создаётся вообще.
//   3. Выходной, за который отчёт всё же есть, — обычная реальная запись
//      (is_filled = false), просто с is_weekend = true.
//   4. Если у участка вообще ещё не было ни одного отчёта, восстанавливать
//      нечего — ряд начинается с первого реального отчёта.
//
// Модуль написан без привязки к предметной области "люди": он реконструирует
// подневной ряд для набора строк, сгруппированных по произвольному ключу
// (groupField) и дате (dateField). Это сделано специально, чтобы ту же
// функцию можно было переиспользовать для других ежедневных отчётов
// (например, аналитики по бетону/технике), если там возникнет та же проблема
// пропущенных дней — доменная обёртка (buildFilledPeopleSeries) лишь
// прописывает конкретные поля.
//
// Вывод:
//   - detailRows  — построчные данные (те же колонки, что и на входе) на
//     каждый день ряда, кроме "нормальных" пропущенных выходных. Это основа
//     для аналитики по составу (объект/профессия/подрядчик и т.п.).
//   - dayRows     — по одной строке на (группа, день) на ВЕСЬ календарный
//     диапазон, включая пропущенные выходные (со статусом weekend_no_report).
//     Это основа для аналитики по полноте/своевременности отчётности.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isWeekendDate(date) {
  const day = date.getUTCDay(); // 0 = вс, 6 = сб
  return day === 0 || day === 6;
}

/**
 * @param {object[]} rows входные строки (уже нормализованные, плоские объекты)
 * @param {object} options
 * @param {string} options.dateField имя поля с датой 'YYYY-MM-DD'
 * @param {string} options.groupField имя поля, по которому строится независимый ряд (участок)
 * @param {string} [options.seriesEndDate] дата 'YYYY-MM-DD', на которую обрывается ряд для
 *   всех групп (по умолчанию — максимальная дата среди всех строк). Общая для всех групп,
 *   чтобы участок, переставший сдавать отчёты, показывал реальные пропуски вплоть до
 *   последней известной даты, а не "заканчивал" ряд на своей последней реальной записи.
 * @returns {{ detailRows: object[], dayRows: object[] }}
 */
function reconstructDailySeries(rows, { dateField, groupField, seriesEndDate } = {}) {
  if (!dateField || !groupField) {
    throw new Error('reconstructDailySeries: dateField и groupField обязательны');
  }

  const validRows = rows.filter((r) => r[dateField] && r[groupField]);

  const globalMaxDate = seriesEndDate || validRows.reduce(
    (max, r) => (!max || r[dateField] > max ? r[dateField] : max),
    null
  );

  const byGroup = new Map();
  for (const row of validRows) {
    const group = row[groupField];
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const byDate = byGroup.get(group);
    if (!byDate.has(row[dateField])) byDate.set(row[dateField], []);
    byDate.get(row[dateField]).push(row);
  }

  const detailRows = [];
  const dayRows = [];

  for (const [group, byDate] of byGroup.entries()) {
    const realDates = [...byDate.keys()].sort();
    if (!realDates.length) continue;

    const firstDate = realDates[0];
    if (!globalMaxDate || firstDate > globalMaxDate) continue;

    let cursor = parseIsoDate(firstDate);
    const end = parseIsoDate(globalMaxDate);

    // "Последний известный день" для LOCF: обновляется и на реальных, и на
    // восстановленных днях, что и есть стандартное поведение LOCF — значение
    // переносится вперёд, пока не встретится новое реальное наблюдение.
    let lastKnownRows = null;
    let lastRealDate = null;

    while (cursor.getTime() <= end.getTime()) {
      const dateStr = formatIsoDate(cursor);
      const weekend = isWeekendDate(cursor);
      const realRowsForDay = byDate.get(dateStr);

      if (realRowsForDay) {
        for (const row of realRowsForDay) {
          detailRows.push({ ...row, is_filled: 0, is_weekend: weekend ? 1 : 0, source_date: null });
        }
        lastKnownRows = realRowsForDay;
        lastRealDate = dateStr;

        const total = realRowsForDay.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);
        dayRows.push({
          [groupField]: group,
          [dateField]: dateStr,
          is_weekend: weekend ? 1 : 0,
          status: 'real',
          is_filled: 0,
          source_date: null,
          total_headcount: total,
          entries_count: realRowsForDay.length,
        });
      } else if (weekend) {
        // Правило 2: пропущенный выходной — норма, строк не создаём вообще.
        dayRows.push({
          [groupField]: group,
          [dateField]: dateStr,
          is_weekend: 1,
          status: 'weekend_no_report',
          is_filled: 0,
          source_date: null,
          total_headcount: null,
          entries_count: 0,
        });
      } else {
        // Правило 1: пропущенный рабочий день — восстанавливаем через LOCF.
        // lastKnownRows гарантированно заполнен, т.к. цикл стартует с firstDate,
        // которая по определению реальна (правило 3 — "начало ряда").
        for (const row of lastKnownRows) {
          detailRows.push({
            ...row,
            [dateField]: dateStr,
            is_filled: 1,
            is_weekend: 0,
            source_date: lastRealDate,
          });
        }
        const total = lastKnownRows.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);
        dayRows.push({
          [groupField]: group,
          [dateField]: dateStr,
          is_weekend: 0,
          status: 'filled',
          is_filled: 1,
          source_date: lastRealDate,
          total_headcount: total,
          entries_count: lastKnownRows.length,
        });
      }

      cursor = addDays(cursor, 1);
    }
  }

  return { detailRows, dayRows };
}

// Доменная обёртка: превращает сырые строки people_reports (участок/дата/...)
// в восстановленный ряд, используя общий алгоритм выше.
function buildFilledPeopleSeries(rawRows) {
  return reconstructDailySeries(rawRows, { dateField: 'report_date', groupField: 'site' });
}

module.exports = { reconstructDailySeries, buildFilledPeopleSeries };
