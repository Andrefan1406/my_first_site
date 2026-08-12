// Обёртка над Google Sheets API через сервис-аккаунт — нужен именно этот
// способ (а не "опубликовать в вебе" + CSV, как у остальных синков в этом
// проекте — см. syncDefectActs.js/syncObjects.js/syncPeople.js), потому что
// лист ГПР не опубликован в вебе, и доступ к нему уже настроен на
// конкретный сервис-аккаунт (тот же, что использовался в исходном Python-
// парсере на ноутбуке, см. историю задачи). JSON-ключ сервис-аккаунта —
// ЦЕЛИКОМ одной строкой в переменной окружения GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
// (см. .env, gitignored) — ключ НЕЛЬЗЯ коммитить в репозиторий.
const { google } = require('googleapis');

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON не задана на сервере (.env)');
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON содержит невалидный JSON: ' + err.message);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// Аналог worksheet.get(range, value_render_option='UNFORMATTED_VALUE') из
// gspread — сырые значения без форматирования: даты как Excel-serial-числа,
// проценты как доли (0.98, не "98%"), пустые ячейки как null/undefined в
// конце строки (Sheets API обрезает строку до последней непустой ячейки, а
// не дополняет её null'ами — это важно учитывать при разборе, см.
// syncGprReport.js).
async function getUnformattedValues(spreadsheetId, sheetName, range) {
  const sheets = getSheetsClient();
  // Имя листа в одинарных кавычках — обязательно для листов с запятой/
  // пробелом в названии (например "64,72"), иначе Sheets API не распознаёт
  // границу между именем листа и диапазоном.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!${range}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values || [];
}

module.exports = { getSheetsClient, getUnformattedValues };
