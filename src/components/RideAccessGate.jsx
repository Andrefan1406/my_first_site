// Общесайтовый гейт: пользователь системы поездок с full_site_access = 0
// (типично — водитель, заведённый только ради этого приложения) не должен
// видеть остальные страницы сайта — только свою (/driver, /dispatcher,
// /employee, /rides-admin). Оборачивает <Routes> целиком в App.js, а не
// отдельные роуты, поэтому не даёт "убежать" прямым переходом по ссылке.
// Клиентский гейт — как и AdminRoute.jsx, только для UX: настоящая
// проверка роли — на бэкенде, на каждом /api/v1/* эндпоинте отдельно.
import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { ridesApiFetch } from "../rides/api";

const ROLE_HOME = {
  employee: "/employee",
  dispatcher: "/dispatcher",
  driver: "/driver",
  admin: "/rides-admin",
};

export default function RideAccessGate({ children }) {
  const location = useLocation();
  const [user, setUser] = useState(undefined); // undefined = проверяется, null = не залогинен
  const [rideUser, setRideUser] = useState(undefined); // undefined = проверяется, null = не в системе поездок

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user) {
      setRideUser(null);
      return;
    }
    let cancelled = false;
    ridesApiFetch("/api/v1/users/me")
      .then(({ user: ru }) => { if (!cancelled) setRideUser(ru); })
      // Сеть/бэкенд недоступны — fail-open: не запираем весь сайт из-за этого.
      .catch(() => { if (!cancelled) setRideUser(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (user === undefined || (user && rideUser === undefined)) {
    return <div style={{ padding: 30 }}>Проверка доступа...</div>;
  }

  if (rideUser && !rideUser.fullSiteAccess) {
    const home = ROLE_HOME[rideUser.role];
    if (home && location.pathname !== "/login" && !location.pathname.startsWith(home)) {
      return <Navigate to={home} replace />;
    }
  }

  return children;
}
