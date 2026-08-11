import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useNavigate } from "react-router-dom";
import { registerDeviceSession, DeviceSlotTakenError } from "./deviceSession";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Ограничение "не более 2 устройств на аккаунт" (одно мобильное, одно
      // десктопное) — проверяется здесь, ПОСЛЕ входа в Firebase, потому что
      // сам логин идёт напрямую в Firebase и наш backend его не видит (см.
      // src/deviceSession.js). Если слот занят другим устройством — тут же
      // разлогиниваем и показываем сообщение без права "попробовать снова"
      // без администратора.
      try {
        await registerDeviceSession();
      } catch (slotErr) {
        if (slotErr instanceof DeviceSlotTakenError) {
          await signOut(auth).catch(() => {});
          setError(slotErr.message);
          return;
        }
        throw slotErr;
      }

      navigate("/");
    } catch (err) {
      setError("Неверный логин или пароль");
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>Вход в систему</h2>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />

          <input
            type={showPassword ? "text" : "password"}
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              style={styles.checkbox}
            />
            Показать пароль
          </label>

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={styles.button}
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f5f5f5"
  },

  card: {
    background: "#fff",
    padding: "40px",
    borderRadius: "12px",
    width: "400px",
    boxShadow: "0 0 20px rgba(0,0,0,0.1)"
  },

  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "15px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    boxSizing: "border-box"
  },

  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "15px",
    fontSize: "14px",
    color: "#333",
    cursor: "pointer",
    userSelect: "none"
  },

  checkbox: {
    width: "16px",
    height: "16px",
    cursor: "pointer"
  },

  button: {
    width: "100%",
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    background: "#1976d2",
    color: "#fff",
    cursor: "pointer",
    fontSize: "16px"
  },

  error: {
    color: "red",
    marginBottom: "15px"
  }
};