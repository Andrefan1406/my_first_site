// Восстановление статуса ежедневной отчётности по людям (участок, день) с
// учётом решений администратора.
//
// ВАЖНО про архитектуру: обнаружение пропусков и применение решений
// администратора выполняются В ОДНОМ последовательном проходе по датам, а не
// двумя независимыми шагами (как было раньше, пока не появилось решение
// 'work_completed'). Причина: решение "работы завершены" влияет не только на
// день, на котором его приняли, а на ВСЕ последующие дни участка — они
// перестают быть пропусками вообще, пока не появится новый реальный отчёт.
// Чтобы это корректно посчитать, нужно идти по датам по порядку, храня
// текущее состояние "участок активен / не активен".
//
// Правила (по порядку дат, для каждого участка отдельно):
//   1. День с реальным отчётом -> status='real', участок становится/остаётся
//      "активным" (отчёты снова ожидаются) — даже если до этого был закрыт
//      решением 'work_completed' (например, возобновление по гарантии).
//   2. День без отчёта, пока участок "не активен" (после 'work_completed') ->
//      status='inactive'. Это НЕ пропуск: решения не требует, в статистику
//      "ждут решения"/"процент заполненности" не попадает.
//   3. День без отчёта, пока участок "активен" -> кандидат в пропуски:
//      - нет решения -> status='missing', ждёт администратора;
//      - решение 'confirm_no_report' -> status='resolved_no_report';
//      - решение 'copy' (+ source_date) -> status='resolved_copy', данные
//        материализуются копией строк с source_date;
//      - решение 'work_completed' -> status='resolved_completed', И участок
//        становится "не активным" НАЧИНАЯ СО СЛЕДУЮЩЕГО дня.
//   4. Если у участка вообще не было ни одного реального отчёта, ряд для
//      него не строится (начало ряда — первый реальный день).
//
// Как и раньше, модуль не привязан к предметной области "люди": функция
// работает с произвольным groupField/dateField для переиспользования.

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

function makeDayRow(groupField, group, dateField, dateStr, weekend, extra) {
  return {
    [groupField]: group,
    [dateField]: dateStr,
    is_weekend: weekend ? 1 : 0,
    total_headcount: null,
    entries_count: 0,
    decided_by: null,
    decided_at: null,
    source_date: null,
    ...extra,
  };
}

/**
 * @param {object[]} rows входные строки (уже нормализованные, плоские объекты)
 * @param {object[]} decisions решения администратора: объекты с полями
 *   [groupField], [dateField], action ('copy'|'confirm_no_report'|'work_completed'),
 *   source_date, decided_by, decided_at
 * @param {object} options
 * @param {string} options.dateField имя поля с датой 'YYYY-MM-DD'
 * @param {string} options.groupField имя поля, по которому строится независимый ряд (участок)
 * @param {string} [options.seriesEndDate] дата 'YYYY-MM-DD', на которую обрывается ряд для
 *   всех групп (по умолчанию — максимальная дата среди всех строк).
 * @returns {{ dayRows: object[], detailRows: object[] }}
 *   dayRows    — по одной строке на (группа, день) на весь календарный диапазон группы.
 *   detailRows — построчные данные (те же колонки, что и на входе) для дней со статусом
 *     'real' или 'resolved_copy'; для остальных статусов строк нет (данных нет).
 */
function reconstructDailyTimeline(rows, decisions, { dateField, groupField, seriesEndDate } = {}) {
  if (!dateField || !groupField) {
    throw new Error('reconstructDailyTimeline: dateField и groupField обязательны');
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

  const decisionByKey = new Map(
    (decisions || []).map((d) => [`${d[groupField]}::${d[dateField]}`, d])
  );

  const dayRows = [];
  const detailRows = [];

  for (const [group, byDate] of byGroup.entries()) {
    const realDates = [...byDate.keys()].sort();
    if (!realDates.length) continue;

    const firstDate = realDates[0];
    if (!globalMaxDate || firstDate > globalMaxDate) continue;

    let cursor = parseIsoDate(firstDate);
    const end = parseIsoDate(globalMaxDate);

    // Участок стартует "активным" (отчёты ожидаются) с первого реального дня.
    let active = true;

    while (cursor.getTime() <= end.getTime()) {
      const dateStr = formatIsoDate(cursor);
      const weekend = isWeekendDate(cursor);
      const realRowsForDay = byDate.get(dateStr);

      if (realRowsForDay) {
        const total = realRowsForDay.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, {
            status: 'real',
            total_headcount: total,
            entries_count: realRowsForDay.length,
          })
        );
        for (const row of realRowsForDay) {
          detailRows.push({ ...row, is_filled: 0, is_weekend: weekend ? 1 : 0, source_date: null, decided_by: null });
        }
        active = true;
        cursor = addDays(cursor, 1);
        continue;
      }

      if (!active) {
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, { status: 'inactive' })
        );
        cursor = addDays(cursor, 1);
        continue;
      }

      const decision = decisionByKey.get(`${group}::${dateStr}`);

      if (!decision) {
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, { status: 'missing' })
        );
      } else if (decision.action === 'confirm_no_report') {
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, {
            status: 'resolved_no_report',
            decided_by: decision.decided_by,
            decided_at: decision.decided_at,
          })
        );
      } else if (decision.action === 'work_completed') {
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, {
            status: 'resolved_completed',
            decided_by: decision.decided_by,
            decided_at: decision.decided_at,
          })
        );
        // Со следующего дня участок считается закрытым — до нового реального
        // отчёта или до следующего решения 'work_completed' дальше по ряду.
        active = false;
      } else if (decision.action === 'copy' && decision.source_date) {
        const sourceRows = byDate.get(decision.source_date) || [];
        const total = sourceRows.reduce((sum, r) => sum + (Number(r.headcount) || 0), 0);

        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, {
            status: 'resolved_copy',
            total_headcount: total,
            entries_count: sourceRows.length,
            decided_by: decision.decided_by,
            decided_at: decision.decided_at,
            source_date: decision.source_date,
          })
        );
        for (const row of sourceRows) {
          detailRows.push({
            ...row,
            [dateField]: dateStr,
            is_filled: 1,
            is_weekend: weekend ? 1 : 0,
            source_date: decision.source_date,
            decided_by: decision.decided_by,
          });
        }
      } else {
        // Решение есть, но некорректное (например, 'copy' без source_date) —
        // не материализуем данные, день остаётся пропуском.
        dayRows.push(
          makeDayRow(groupField, group, dateField, dateStr, weekend, { status: 'missing' })
        );
      }

      cursor = addDays(cursor, 1);
    }
  }

  return { dayRows, detailRows };
}

// Доменная обёртка: строит временную шкалу для сырых строк people_reports
// (участок/дата/...) и решений people_gap_decisions. seriesEndDate можно
// передать явно — нужно при пересчёте ОДНОГО участка (см. rebuildDerivedTables
// в syncPeople.js), чтобы его ряд по-прежнему обрывался на самой свежей дате
// среди ВСЕХ участков, а не только среди строк одного отфильтрованного участка.
function reconstructPeopleTimeline(rawRows, decisions, { seriesEndDate } = {}) {
  return reconstructDailyTimeline(rawRows, decisions, { dateField: 'report_date', groupField: 'site', seriesEndDate });
}

module.exports = { reconstructDailyTimeline, reconstructPeopleTimeline };
