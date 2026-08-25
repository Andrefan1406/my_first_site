// Разовый dev-скрипт: заводит в Firebase Authentication 5 тестовых
// аккаунтов, email которых совпадают с seed.js (server/rides/seed.js) —
// роли им подхватятся автоматически, ничего в /rides-admin donастраивать
// не нужно. Идемпотентен: уже существующий email пропускает, а не падает.
//
// Требует service account ключ ИМЕННО проекта my-first-site-16a0c
// (Firebase Console -> Project Settings -> Service accounts -> Generate
// new private key) — projectId-only инициализация, которой достаточно
// для verifyIdToken в остальном коде, для createUser/listUsers не хватает.
// Запуск:
//   GOOGLE_APPLICATION_CREDENTIALS=./путь/к/ключу.json node server/rides/create-test-users.js
const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const FIREBASE_PROJECT_ID = 'my-first-site-16a0c';

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? applicationDefault()
  : (() => {
      throw new Error(
        'Не задан GOOGLE_APPLICATION_CREDENTIALS. Скачайте service account ключ проекта ' +
        FIREBASE_PROJECT_ID + ' (Firebase Console -> Project Settings -> Service accounts -> ' +
        'Generate new private key) и запустите:\n' +
        '  GOOGLE_APPLICATION_CREDENTIALS=./путь/к/ключу.json node server/rides/create-test-users.js'
      );
    })();

initializeApp({ credential, projectId: FIREBASE_PROJECT_ID });

const TEST_USERS = [
  { email: 'dispatcher@example.com', password: 'Dispatcher#2026', displayName: 'Айгуль Диспетчерова' },
  { email: 'employee1@example.com', password: 'Employee1#2026', displayName: 'Сауле Сотрудникова' },
  { email: 'employee2@example.com', password: 'Employee2#2026', displayName: 'Марат Заказчиков' },
  { email: 'driver1@example.com', password: 'Driver1#2026', displayName: 'Ерлан Водителев' },
  { email: 'driver2@example.com', password: 'Driver2#2026', displayName: 'Данияр Шофёров' },
];

async function main() {
  for (const u of TEST_USERS) {
    try {
      await getAuth().createUser(u);
      console.log(`Создан: ${u.email}`);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        console.log(`Уже существует, пропущен: ${u.email}`);
      } else {
        console.error(`Ошибка для ${u.email}:`, err.message);
      }
    }
  }
}

main();
