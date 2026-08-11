import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { checkDeviceSession, DeviceSlotTakenError, RECHECK_INTERVAL_MS } from "../deviceSession";

export default function PrivateRoute({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState("");

  const runCheck = async (currentUser) => {
    // Постоянная проверка слота устройства (см. src/deviceSession.js) —
    // покрывает случай, когда пользователь уже был залогинен в Firebase
    // раньше (например, открыл сайт снова после закрытия браузера) и
    // явного входа через LoginPage.jsx в этот раз не было, а также случай,
    // когда администратор освободил/забрал слот или другое устройство
    // сделало takeover, пока вкладка была открыта.
    try {
      await checkDeviceSession();
    } catch (err) {
      if (err instanceof DeviceSlotTakenError) {
        await signOut(auth).catch(() => {});
        setBlockedMessage(err.message);
        setUser(null);
        setChecking(false);
        return false;
      }
      // Сетевая ошибка проверки — не блокируем пользователя из-за неё.
    }
    setUser(currentUser);
    setChecking(false);
    return true;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        await runCheck(currentUser);
      } else {
        setUser(currentUser);
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Переход между защищёнными страницами пересоздаёт PrivateRoute и сам по
  // себе триггерит проверку выше, но если пользователь просто сидит на одной
  // странице долго — без этого таймера отключение (takeover с другого
  // устройства, сброс админом) осталось бы незамеченным, пока он куда-нибудь
  // не перейдёт. Опрашиваем с тем же интервалом, что и троттлинг в
  // checkDeviceSession, чтобы каждый тик реально доходил до сервера.
  useEffect(() => {
    if (!user) return undefined;
    const interval = setInterval(() => {
      const currentUser = auth.currentUser;
      if (currentUser) runCheck(currentUser);
    }, RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (checking) {
    return <div style={{ padding: 30 }}>Проверка авторизации...</div>;
  }

  if (blockedMessage) {
    return (
      <div style={{ padding: 30, maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <p style={{ color: "#c00", fontSize: 15, lineHeight: 1.5 }}>{blockedMessage}</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}