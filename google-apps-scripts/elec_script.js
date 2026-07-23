// Google Apps Script для записи заявок электриков
// Автономный скрипт (script.google.com/home) — не привязан к таблице,
// пишет в таблицу "заявка на электриков (Ответы)" по её ID.
// Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
// Полученный URL /exec положить в переменную окружения REACT_APP_ELEC_SCRIPT_URL (Netlify).

const SPREADSHEET_ID = '1XniY3_hC9hdSPllqxLj45JSbKfc3avY0AD49dW0lM_Y';
const SHEET_NAME = 'Заявки';

// Заголовки колонок (вставляются автоматически при создании листа)
const HEADERS = [
  'Отметка времени',     // A
  'Дата работ',          // B
  'Время начала',        // C
  'Категория объекта',   // D
  'Объект',              // E
  'Позиция',             // F
  'Категория работ',     // G
  'Описание работ',      // H
  'ФИО и должность',     // I
  'Телефон',             // J
  'Выполнено',           // K
];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Вставить заголовки если лист пустой
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
        timestamp,                  // A: Отметка времени
        row.date            || '', // B: Дата работ
        row.startTime       || '', // C: Время начала
        row.objectCategory  || '', // D: Категория объекта
        row.object          || '', // E: Объект
        row.position        || '', // F: Позиция
        row.workCategory    || '', // G: Категория работ
        row.workDescription || '', // H: Описание работ
        row.fullName        || '', // I: ФИО и должность
        row.phone           || '', // J: Телефон
        '',                        // K: Выполнено (заполняется вручную)
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
