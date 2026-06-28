// Google Apps Script для записи заявок геодезистов
// Вставьте этот код в Apps Script редактор Google Таблицы

const SHEET_NAME = 'Заявки';

// Заголовки колонок (вставляются автоматически если таблица пустая)
const HEADERS = [
  'Отметка времени',   // A
  'Дата работ',        // B
  'Объект',            // C
  'Блок / Позиция',    // D
  'Конструктив',       // E
  'Вид работы',        // F
  'Описание работ',    // G
  'ФИО и должность',   // H
  'Телефон',           // I
  'Выполнено',         // J
];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    // Вставить заголовки если таблица пустая
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length)
        .setFontWeight('bold')
        .setBackground('#4a86e8')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    const data = JSON.parse(e.postData.contents);
    const rows = Array.isArray(data) ? data : [data];

    const now = new Date();
    const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');

    rows.forEach(row => {
      sheet.appendRow([
        timestamp,               // A: Отметка времени
        row.date          || '', // B: Дата работ
        row.object        || '', // C: Объект
        row.blockPosition || '', // D: Блок / Позиция
        row.konstruktiv   || '', // E: Конструктив
        row.workType      || '', // F: Вид работы
        row.workDescription || '', // G: Описание работ
        row.fullName      || '', // H: ФИО и должность
        row.phone         || '', // I: Телефон
        '',                      // J: Выполнено (заполняется вручную)
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', added: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
