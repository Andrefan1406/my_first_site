// Обнаружение пропусков в ежедневных отчётах по людям.
//
// ВАЖНО: этот модуль только ОБНАРУЖИВАЕТ пропуски, но НЕ заполняет их
// автоматически. Раньше (см. историю fillPeopleSeries.js) пропущенные рабочие
// дни копировались автоматически методом LOCF — от этого отказались: решение
// о том, чем и как заполнить конкретный пропуск, должен принимать человек
// через админ-панель (см. server/peopleGapsAdmin.js), а не алгоритм.
//
// Правила обнаружения (без заполнения):
//   1. Любой календарный день (включая субботу и воскресенье), за который нет
//      ни одной строки отчёта по участку, — это ПРОПУСК, требующий решения
//      человека: status = 'missing'. Раньше выходные без отчёта считались
//      нормой и пропуском не были — по просьбе пользователя это убрано:
//      теперь и по выходным нужно явное решение администратора (скопировать
//      данные либо подтвердить, что участок не работал).
//   2. День, за который отчёт есть, — status = 'real', заполнять нечего.
//      Флаг is_weekend при этом сохраняется и для 'real', и для 'missing' —
//      это просто информация для администратора при принятии решения, а не
//      признак того, что решение не нужно.
//   3. Если у участка вообще ещё не было ни одного отчёта, до первого
//      реального отчёта пропуски не считаются (ряд начинается с первого
//      реального дня).
//
// Как и раньше, модуль не привязан к предметной области "люди": функция
// работает с произвольным groupField/dateField, чтобы её можно было
// переиспользовать для других ежедневных отчётов.

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
 * @returns {object[]} dayRows — по одной строке на (группа, день) на весь календарный
 *   диапазон группы, включая выходные — они больше не пропускаются автоматически.
 */
function detectDailyGaps(rows, { dateField, groupField, seriesEndDate } = {}) {
  if (!dateField || !groupField) {
    throw new Error('detectDailyGaps: dateField и groupField обязательны');
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

  const dayRows = [];

  for (const [group, byDate] of byGroup.entries()) {
    const realDates = [...byDate.keys()].sort();
    if (!realDates.length) continue;

    const firstDate = realDates[0];
    if (!globalMaxDate || firstDate > globalMaxDate) continue;

    let cursor = parseIsoDate(firstDate);
    const end = parseIsoDate(globalMaxDate);

    while (cursor.getTime() <= end.getTime()) {
      const dateStr = formatIsoDate(cursor);
      const weekend = isWeekendDate(cursor);
      const realRowsForDay = byDate.get(dateStr);

      if (realRowsForDay) {
        const total = realRowsForDay.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);
        dayRows.push({
          [groupField]: group,
          [dateField]: dateStr,
          is_weekend: weekend ? 1 : 0,
          status: 'real',
          total_headcount: total,
          entries_count: realRowsForDay.length,
        });
      } else {
        // Правило 1: любой день без отчёта (в т.ч. выходной) — пропуск, ждущий
        // решения человека. Никаких данных сюда не подставляем.
        dayRows.push({
          [groupField]: group,
          [dateField]: dateStr,
          is_weekend: weekend ? 1 : 0,
          status: 'missing',
          total_headcount: null,
          entries_count: 0,
        });
      }

      cursor = addDays(cursor, 1);
    }
  }

  return dayRows;
}

// Доменная обёртка: обнаруживает пропуски в сырых строках people_reports
// (участок/дата/...), используя общий алгоритм выше.
function detectPeopleGaps(rawRows) {
  return detectDailyGaps(rawRows, { dateField: 'report_date', groupField: 'site' });
}

module.exports = { detectDailyGaps, detectPeopleGaps };
