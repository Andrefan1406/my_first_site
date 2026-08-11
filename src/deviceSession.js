// Клиентская сторона ограничения по устройствам (см. server/deviceSession.js
// за объяснением, почему это POST-AUTH проверка, а не блокировка до входа —
// Firebase Auth аутентифицирует пользователя напрямую с клиента, наш backend
// не видит сам логин).
import { getAuth } from "firebase/auth";

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";

// Как часто реально дёргаем /check (и на переходах между защищёнными
// страницами, и по таймеру внутри одной — см. PrivateRoute.jsx). Раньше было
// 5 минут — при отключении устройства через takeover/админку прежняя вкладка
// могла продолжать работать почти всё это время, что на практике и
// обнаружилось (см. историю правок). 20 секунд — разумный компромисс между
// "быстро замечаем отключение" и "не долбим бэкенд на каждый чих"; полной
// мгновенной защиты это всё равно не даёт — см. комментарий в верхней части
// файла про то, что отправка самих заявок идёт мимо этой проверки.
export const RECHECK_INTERVAL_MS = 20 * 1000;

let lastCheckedAt = 0;
let lastCheckedUid = null;

export class DeviceSlotTakenError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeviceSlotTakenError";
  }
}

const DEFAULT_BLOCK_MESSAGE = "Этот аккаунт уже используется на другом устройстве.";

async function parseSlotTakenError(res) {
  const data = await res.json().catch(() => ({}));
  return new DeviceSlotTakenError(data.error || DEFAULT_BLOCK_MESSAGE);
}

// Вызывается сразу после успешного входа в Firebase (см. src/LoginPage.jsx) —
// создаёт слот устройства, если он свободен, подтверждает его, если уже наш,
// либо бросает DeviceSlotTakenError, если слот занят другим устройством того
// же типа. На DeviceSlotTakenError вызывающий код (LoginPage.jsx) показывает
// диалог "аккаунт уже используется — отключить другое устройство?" (по
// образцу WhatsApp Web) — takeoverDeviceSession() ниже выполняет подтверждённое
// отключение, signOut нужен только если пользователь откажется.
export async function registerDeviceSession() {
  const user = getAuth().currentUser;
  if (!user) return;

  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${API_URL}/api/session/register`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (networkErr) {
    // fetch() сам бросает (не HTTP-статус, а именно исключение) при сетевой
    // ошибке или блокировке CORS — например, если origin не попал в
    // allowlist на бэкенде (см. server/deviceSession.js). Раньше это
    // исключение улетало наверх и в LoginPage.jsx ошибочно показывалось как
    // "Неверный логин или пароль", хотя Firebase-логин уже прошёл успешно.
    // Не блокируем пользователя из-за нашей же инфраструктурной проблемы.
    console.error("Не удалось проверить сессию устройства (сеть/CORS):", networkErr);
    return;
  }

  if (res.status === 409) {
    throw await parseSlotTakenError(res);
  }
  if (!res.ok) return; // сетевая/серверная ошибка — не блокируем пользователя из-за нашей же ошибки

  lastCheckedAt = Date.now();
  lastCheckedUid = user.uid;
}

// Вызывается только после явного подтверждения пользователем в диалоге
// "аккаунт уже используется на другом устройстве — отключить его?" (см.
// src/LoginPage.jsx). Безусловно забирает слот у того устройства, независимо
// от того, кто им владел — валидный Firebase-токен здесь и есть
// подтверждение (человек только что ввёл правильный пароль от ЭТОГО
// аккаунта). Бросает обычную Error (не DeviceSlotTakenError — тут конфликта
// уже нет, только сетевая/серверная ошибка).
export async function takeoverDeviceSession() {
  const user = getAuth().currentUser;
  if (!user) return;

  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${API_URL}/api/session/takeover`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (networkErr) {
    console.error("Не удалось отключить другое устройство (сеть/CORS):", networkErr);
    throw new Error("Не удалось подключиться к серверу. Попробуйте ещё раз.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Не удалось отключить другое устройство. Попробуйте ещё раз.");
  }

  lastCheckedAt = Date.now();
  lastCheckedUid = user.uid;
}

// Вызывается на защищённых страницах (см. PrivateRoute.jsx) для постоянной
// проверки уже открытой сессии — например, если администратор освободил слот
// или с этого браузера успели войти в другой аккаунт. В отличие от
// registerDeviceSession, НИЧЕГО не создаёт: 401 здесь означает "сессия больше
// не активна", а не "слот свободен, можно брать".
export async function checkDeviceSession({ force = false } = {}) {
  const user = getAuth().currentUser;
  if (!user) return;

  const now = Date.now();
  if (!force && user.uid === lastCheckedUid && now - lastCheckedAt < RECHECK_INTERVAL_MS) {
    return;
  }

  const token = await user.getIdToken();
  let res;
  try {
    res = await fetch(`${API_URL}/api/session/check`, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (networkErr) {
    // См. аналогичный catch в registerDeviceSession выше — сетевая/CORS
    // ошибка не должна выкидывать пользователя из уже открытой сессии.
    console.error("Не удалось проверить сессию устройства (сеть/CORS):", networkErr);
    return;
  }

  if (res.status === 401) {
    throw await parseSlotTakenError(res);
  }
  if (!res.ok) return;

  lastCheckedAt = now;
  lastCheckedUid = user.uid;
}
