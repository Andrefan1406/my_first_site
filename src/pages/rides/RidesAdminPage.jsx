// Админка системы поездок (роль admin в rides.users, не путать с общим
// /admin сайта — см. RideAccessGate.jsx): назначение ролей/full_site_access
// всем пользователям сайта и CRUD справочников водителей/машин. Три вкладки
// в одном файле — три относительно небольших списка, не тянут на отдельные
// страницы с общей навигацией.
import React, { useCallback, useEffect, useState } from "react";
import { ridesApiDelete, ridesApiFetch, ridesApiPatch, ridesApiPost, ridesApiPut } from "../../rides/api";

const ROLE_OPTIONS = [
  { value: "", label: "— нет доступа —" },
  { value: "employee", label: "Сотрудник (пассажир)" },
  { value: "dispatcher", label: "Диспетчер" },
  { value: "driver", label: "Водитель" },
  { value: "admin", label: "Админ поездок" },
];

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({}); // email -> {name, phone, role, fullSiteAccess}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingEmail, setSavingEmail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { users: rows } = await ridesApiFetch("/api/v1/users");
      setUsers(rows);
      const nextDrafts = {};
      for (const u of rows) {
        nextDrafts[u.email] = { name: u.name, phone: u.phone, role: u.role || "", fullSiteAccess: u.fullSiteAccess };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err.message || "Не удалось загрузить список пользователей");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDraft = (email, patch) => setDrafts((prev) => ({ ...prev, [email]: { ...prev[email], ...patch } }));

  const save = async (email) => {
    const draft = drafts[email];
    setSavingEmail(email);
    setError("");
    try {
      if (!draft.role) {
        await ridesApiDelete(`/api/v1/users/${encodeURIComponent(email)}`);
      } else {
        if (!draft.name.trim() || !draft.phone.trim()) {
          setError("Укажите имя и телефон перед назначением роли");
          setSavingEmail(null);
          return;
        }
        await ridesApiPut(`/api/v1/users/${encodeURIComponent(email)}`, draft);
      }
      await load();
    } catch (err) {
      setError(err.message || "Не удалось сохранить пользователя");
    } finally {
      setSavingEmail(null);
    }
  };

  if (loading) return <p style={s.muted}>Загрузка...</p>;

  return (
    <div>
      {error && <div style={s.error}>{error}</div>}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Email</th>
            <th style={s.th}>Имя</th>
            <th style={s.th}>Телефон</th>
            <th style={s.th}>Роль в системе поездок</th>
            <th style={s.th}>Доступ ко всему сайту</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const draft = drafts[u.email] || { name: "", phone: "", role: "", fullSiteAccess: false };
            return (
              <tr key={u.email}>
                <td style={s.td}>{u.email}</td>
                <td style={s.td}>
                  <input style={s.inputSmall} value={draft.name} onChange={(e) => setDraft(u.email, { name: e.target.value })} />
                </td>
                <td style={s.td}>
                  <input style={s.inputSmall} value={draft.phone} onChange={(e) => setDraft(u.email, { phone: e.target.value })} />
                </td>
                <td style={s.td}>
                  <select style={s.inputSmall} value={draft.role} onChange={(e) => setDraft(u.email, { role: e.target.value })}>
                    {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td style={{ ...s.td, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={draft.fullSiteAccess}
                    disabled={!draft.role}
                    onChange={(e) => setDraft(u.email, { fullSiteAccess: e.target.checked })}
                  />
                </td>
                <td style={s.td}>
                  <button style={s.secondaryButton} disabled={savingEmail === u.email} onClick={() => save(u.email)}>Сохранить</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VehiclesTab() {
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ plateNumber: "", model: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const { vehicles: rows } = await ridesApiFetch("/api/v1/vehicles");
      setVehicles(rows);
    } catch (err) {
      setError(err.message || "Не удалось загрузить машины");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.plateNumber.trim()) return;
    try {
      await ridesApiPost("/api/v1/vehicles", form);
      setForm({ plateNumber: "", model: "" });
      load();
    } catch (err) {
      setError(err.message || "Не удалось добавить машину");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await ridesApiPatch(`/api/v1/vehicles/${id}`, { status });
      load();
    } catch (err) {
      setError(err.message || "Не удалось обновить статус");
    }
  };

  const remove = async (id) => {
    try {
      await ridesApiDelete(`/api/v1/vehicles/${id}`);
      load();
    } catch (err) {
      setError(err.message || "Не удалось удалить машину");
    }
  };

  return (
    <div>
      {error && <div style={s.error}>{error}</div>}
      <form onSubmit={add} style={s.inlineForm}>
        <input style={s.inputSmall} placeholder="Гос. номер" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
        <input style={s.inputSmall} placeholder="Модель" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        <button type="submit" style={s.primaryButton}>Добавить машину</button>
      </form>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Гос. номер</th>
            <th style={s.th}>Модель</th>
            <th style={s.th}>Статус</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td style={s.td}>{v.plateNumber}</td>
              <td style={s.td}>{v.model}</td>
              <td style={s.td}>
                <select style={s.inputSmall} value={v.status} onChange={(e) => updateStatus(v.id, e.target.value)}>
                  <option value="available">Свободна</option>
                  <option value="busy">Занята</option>
                  <option value="maintenance">На ремонте</option>
                </select>
              </td>
              <td style={s.td}><button style={s.dangerButton} onClick={() => remove(v.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriversTab() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [driverUsers, setDriverUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ userId: "", vehicleId: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const [driversRes, vehiclesRes, usersRes] = await Promise.all([
        ridesApiFetch("/api/v1/drivers"),
        ridesApiFetch("/api/v1/vehicles"),
        ridesApiFetch("/api/v1/users"),
      ]);
      setDrivers(driversRes.drivers);
      setVehicles(vehiclesRes.vehicles);
      setDriverUsers(usersRes.users.filter((u) => u.role === "driver" && u.id));
    } catch (err) {
      setError(err.message || "Не удалось загрузить данные");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unassigned = driverUsers.filter((u) => !drivers.some((d) => d.userId === u.id));

  const add = async (e) => {
    e.preventDefault();
    if (!form.userId) return;
    try {
      await ridesApiPost("/api/v1/drivers", { userId: Number(form.userId), vehicleId: form.vehicleId ? Number(form.vehicleId) : null });
      setForm({ userId: "", vehicleId: "" });
      load();
    } catch (err) {
      setError(err.message || "Не удалось создать карточку водителя");
    }
  };

  const remove = async (id) => {
    try {
      await ridesApiDelete(`/api/v1/drivers/${id}`);
      load();
    } catch (err) {
      setError(err.message || "Не удалось удалить карточку водителя");
    }
  };

  const updateVehicle = async (id, vehicleId) => {
    try {
      await ridesApiPatch(`/api/v1/drivers/${id}`, { vehicleId: vehicleId || null });
      load();
    } catch (err) {
      setError(err.message || "Не удалось закрепить машину");
    }
  };

  return (
    <div>
      {error && <div style={s.error}>{error}</div>}
      <form onSubmit={add} style={s.inlineForm}>
        <select style={s.inputSmall} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
          <option value="">Выберите пользователя с ролью «Водитель»</option>
          {unassigned.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
        </select>
        <select style={s.inputSmall} value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
          <option value="">— без машины —</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
        </select>
        <button type="submit" style={s.primaryButton} disabled={!form.userId}>Создать карточку водителя</button>
      </form>
      {unassigned.length === 0 && driverUsers.length === 0 && (
        <p style={s.muted}>Сначала назначьте кому-нибудь роль «Водитель» на вкладке «Пользователи».</p>
      )}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Имя</th>
            <th style={s.th}>Телефон</th>
            <th style={s.th}>Машина</th>
            <th style={s.th}>Статус</th>
            <th style={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td style={s.td}>{d.name}</td>
              <td style={s.td}>{d.phone}</td>
              <td style={s.td}>
                <select style={s.inputSmall} value={d.vehicleId || ""} onChange={(e) => updateVehicle(d.id, e.target.value ? Number(e.target.value) : "")}>
                  <option value="">— не закреплена —</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber}</option>)}
                </select>
              </td>
              <td style={s.td}>{d.status}</td>
              <td style={s.td}><button style={s.dangerButton} onClick={() => remove(d.id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RidesAdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <div style={s.page}>
      <h1 style={s.title}>Администрирование системы поездок</h1>
      <div style={s.tabs}>
        <button style={tab === "users" ? s.tabActive : s.tab} onClick={() => setTab("users")}>Пользователи и роли</button>
        <button style={tab === "drivers" ? s.tabActive : s.tab} onClick={() => setTab("drivers")}>Водители</button>
        <button style={tab === "vehicles" ? s.tabActive : s.tab} onClick={() => setTab("vehicles")}>Машины</button>
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "drivers" && <DriversTab />}
      {tab === "vehicles" && <VehiclesTab />}
    </div>
  );
}

const s = {
  page: { padding: "24px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: "1100px", margin: "0 auto" },
  title: { fontSize: "22px", marginBottom: "16px" },
  tabs: { display: "flex", gap: "8px", marginBottom: "20px" },
  tab: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px" },
  tabActive: { background: "#1976d2", color: "#fff", border: "1px solid #1976d2", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },

  error: { background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" },
  muted: { color: "#888", fontSize: "13px", marginBottom: "10px" },

  inlineForm: { display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" },

  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "8px", borderBottom: "2px solid #ddd", background: "#fafafa", fontSize: "13px" },
  td: { padding: "8px", borderBottom: "1px solid #eee", fontSize: "13px" },

  inputSmall: { padding: "6px 8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px", width: "100%" },
  primaryButton: { background: "#1976d2", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
  secondaryButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
  dangerButton: { background: "#fff0f0", color: "#c00", border: "1px solid #f5b5b5", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
};
