const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'visits.json');

// Загружаем данные из файла
let dailyVisits = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    dailyVisits = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Ошибка при чтении visits.json:', err);
  }
}

// Получаем дату в формате YYYY-MM-DD
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Сохраняем данные в файл
function saveToFile() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(dailyVisits, null, 2));
}

// Увеличиваем счётчик за сегодня
app.post('/api/increment-visitor', (req, res) => {
  const today = getTodayDate();
  dailyVisits[today] = (dailyVisits[today] || 0) + 1;
  saveToFile();
  res.json({ count: dailyVisits[today] });
});

// Получить текущее значение счётчика за сегодня
app.get('/api/visitor-count', (req, res) => {
  const today = getTodayDate();
  res.json({ count: dailyVisits[today] || 0 });
});

// Запуск сервера
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
