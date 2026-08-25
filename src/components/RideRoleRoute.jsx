// Гейт по роли для страниц системы поездок (/employee, /dispatcher,
// /driver, /rides-admin) — как AdminRoute.jsx, только сверяет не один
// захардкоженный email, а роль из rides.users. UX-уровень: настоящая
// проверка — requireRideRole на бэкенде на каждом /api/v1/* эндпоинте.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { ridesApiFetch } from "../rides/api";

export default function RideRoleRoute({ roles, children }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("checking"); // checking | ok | denied

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) { setStatus("denied"); return; }
      ridesApiFetch("/api/v1/users/me")
        .then(({ user: rideUser }) => setStatus(rideUser && roles.includes(rideUser.role) ? "ok" : "denied"))
        .catch(() => setStatus("denied"));
    });
    return () => unsubscribe();
  }, [roles]);

  if (status === "checking") return <div style={{ padding: 30 }}>Проверка доступа...</div>;

  if (status === "denied") {
    return (
      <div style={{ padding: 30, textAlign: "center" }}>
        <p>У вас нет доступа к этому разделу системы поездок.</p>
        <button onClick={() => navigate("/")} style={{ padding: "8px 16px", cursor: "pointer" }}>На главную</button>
      </div>
    );
  }

  return children;
}
