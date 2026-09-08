// Модалка отмены заявки сотрудником — причина обязательна: либо выбор из
// готового списка, либо "Другая причина" со своим текстом. Бэкенд
// (server/rides/requestsRouter.js, POST /:id/cancel-mine) проверяет
// только "строка не пустая" — сам список вариантов существует только
// здесь, на фронте.
import React, { useState } from "react";

const PRESET_REASONS = [
  "Планы изменились — поездка больше не нужна",
  "Ошибка в заявке (адрес, время или число пассажиров)",
  "Долго нет водителя",
  "Добрался другим способом",
];
const OTHER = "__other__";

export default function CancelRequestModal({ onConfirm, onClose }) {
  const [selected, setSelected] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reason = selected === OTHER ? customReason.trim() : selected;
  const canConfirm = reason.length > 0;

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Отменить заявку</h3>
        <p style={s.hint}>Укажите причину отмены:</p>
        {PRESET_REASONS.map((r) => (
          <label key={r} style={s.radioRow}>
            <input type="radio" name="cancel-reason" checked={selected === r} onChange={() => setSelected(r)} />
            {r}
          </label>
        ))}
        <label style={s.radioRow}>
          <input type="radio" name="cancel-reason" checked={selected === OTHER} onChange={() => setSelected(OTHER)} />
          Другая причина
        </label>
        {selected === OTHER && (
          <input
            style={s.input}
            placeholder="Опишите причину"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            autoFocus
          />
        )}
        <div style={s.actions}>
          <button type="button" style={s.secondaryButton} onClick={onClose}>Не отменять</button>
          <button type="button" style={s.dangerButton} disabled={!canConfirm || submitting} onClick={confirm}>
            Отменить заявку
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modal: { background: "#fff", borderRadius: "10px", padding: "20px", width: "420px", maxWidth: "92vw", boxSizing: "border-box" },
  hint: { fontSize: "13px", color: "#555", marginTop: 0 },
  radioRow: { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "14px", color: "#222", padding: "6px 0", cursor: "pointer" },
  input: { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box", marginTop: "6px" },
  actions: { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "8px", marginTop: "16px" },
  secondaryButton: { background: "#fff", border: "1px solid #ccc", borderRadius: "6px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" },
  dangerButton: { background: "#c0392b", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600 },
};
