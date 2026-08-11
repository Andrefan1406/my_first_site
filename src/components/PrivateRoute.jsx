import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { checkDeviceSession, DeviceSlotTakenError } from "../deviceSession";

export default function PrivateRoute({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Постоянная проверка слота устройства (см. src/deviceSession.js) —
      // покрывает случай, когда пользователь уже был залогинен в Firebase
      // раньше (например, открыл сайт снова после закрытия браузера) и
      // явного входа через LoginPage.jsx в этот раз не было, а также случай,
      // когда администратор освободил/забрал слот, пока вкладка была открыта.
      if (currentUser) {
        try {
          await checkDeviceSession();
        } catch (err) {
          if (err instanceof DeviceSlotTakenError) {
            await signOut(auth).catch(() => {});
            setBlockedMessage(err.message);
            setUser(null);
            setChecking(false);
            return;
          }
          // Сетевая ошибка проверки — не блокируем пользователя из-за неё.
        }
      }
      setUser(currentUser);
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

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