// Клиентская сторона ограничения по устройствам (см. server/deviceSession.js
// за объяснением, почему это POST-AUTH проверка, а не блокировка до входа —
// Firebase Auth аутентифицирует пользователя напрямую с клиента, наш backend
// не видит сам логин).
import { getAuth } from "firebase/auth";

const API_URL = process.env.REACT_APP_CONCRETE_CHAT_API_URL || "http://localhost:4000";

// Не долбим /check на каждый переход между защищёнными страницами (PrivateRoute
// монтируется заново на каждый route) — достаточно проверять не чаще этого
// интервала, реальная защита всё равно только на бэкенде.
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

let lastCheckedAt = 0;
let lastCheckedUid = null;

export class DeviceSlotTakenError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeviceSlotTakenError";
  }
}

const DEFAULT_BLOCK_MESSAGE =
  "Вход с этого устройства невозможен — аккаунт уже используется. Обратитесь к администратору для получения собственной учётной записи.";

async function parseSlotTakenError(res) {
  const data = await res.json().catch(() => ({}));
  return new DeviceSlotTakenError(data.error || DEFAULT_BLOCK_MESSAGE);
}

// Вызывается сразу после успешного входа в Firebase (см. src/LoginPage.jsx) —
// создаёт слот устройства, если он свободен, подтверждает его, если уже наш,
// либо бросает DeviceSlotTakenError, если слот занят другим устройством того
// же типа. Вызывающий код обязан на DeviceSlotTakenError тут же сделать
// signOut(auth) — в приложение пользователя пускать нельзя.
export async function registerDeviceSession() {
  const user = getAuth().currentUser;
  if (!user) return;

  const token = await user.getIdToken();
  const res = await fetch(`${API_URL}/api/session/register`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 409) {
    throw await parseSlotTakenError(res);
  }
  if (!res.ok) return; // сетевая/серверная ошибка — не блокируем пользователя из-за нашей же ошибки

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
  const res = await fetch(`${API_URL}/api/session/check`, {
    method: "GET",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    throw await parseSlotTakenError(res);
  }
  if (!res.ok) return;

  lastCheckedAt = now;
  lastCheckedUid = user.uid;
}
