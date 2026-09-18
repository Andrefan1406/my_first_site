// Разовая загрузка свода расценок в Qdrant НАПРЯМУЮ из локального xlsx —
// пока Google Таблица со сводом не опубликована как CSV
// (RASCENKI_SYNC_CSV_URL). Использует тот же нормализатор и индексатор, что и
// плановый синк (server/syncRascenki.js), поэтому результат идентичен.
//
//   npm run rascenki:seed -- "G:\\Мой диск\\...\\rascenki_2026_svod.xlsx"
//   node server/rascenkiSeedXlsx.js "<путь к xlsx>"
require('dotenv').config();
const XLSX = require('xlsx');
const { initSchema } = require('./db');
const { normalizeMatrix, reindexRascenki, setLastSynced, QDRANT_COLLECTION } = require('./syncRascenki');

async function main() {
  const file = process.argv[2] || process.env.RASCENKI_XLSX_PATH;
  if (!file) {
    console.error('Использование: node server/rascenkiSeedXlsx.js "<путь к rascenki_2026_svod.xlsx>"');
    process.exit(1);
  }

  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });

  const rows = normalizeMatrix(matrix);
  console.log(`Прочитано строк расценок из «${wb.SheetNames[0]}»: ${rows.length}`);

  const n = await reindexRascenki(rows);
  // Отметка времени в sync_meta — по ней chatHandler понимает, что домен
  // «Поиск по расценкам» готов отвечать (guard «данные ещё загружаются»).
  initSchema();
  setLastSynced();
  console.log(`Проиндексировано в Qdrant (${QDRANT_COLLECTION}): ${n}`);
  console.log('Готово. Плановый синк подхватит данные из CSV, как только будет задан RASCENKI_SYNC_CSV_URL.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
