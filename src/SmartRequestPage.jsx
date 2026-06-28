import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { objectCategoryOptions, objectPositionOptions } from "./data/constructionData";

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY;

const equipmentCategories = {
  "Автобетононасосы": ["Автобетононасос (стрела 37м)", "Автобетононасос (стрела 42м)", "Автобетононасос (стрела 50м)"],
  "Автобетоносмесители": ["Автобетоносмеситель (5м3)", "Автобетоносмеситель (7м3)", "Автобетоносмеситель (10м3)", "Автобетоносмеситель (самоходный 2м3)"],
  "Автокраны": ["Автокран (25т)", "Автокран (30т)", "Автокран (70т)"],
  "Газели": ["Газель (грузовая кузов-3м)", "Газель (грузовая кузов-4м)", "Газель (грузовая кузов-6м)", "Газель (грузопассажирская кузов-2м)", "Газель (пассажирская)"],
  "Длинномеры": ["Длинномер (9м)", "Длинномер (12м)", "Длинномер (16м)", "Трал"],
  "Катки": ["Каток вибрационный (10тн)", "Каток вибрационный (3тн)", "Каток грунтовый (16тн)", "Каток дорожный (4тн)"],
  "Манипуляторы": ["Манипулятор"],
  "Погрузчики": ["Погрузчик 2м3", "Погрузчик 3м3", "Погрузчик (мини)", "Погрузчик (вилочный)"],
  "Самосвалы": ["Самосвал (20т)", "Самосвал (15т)", "Самосвал (5т)"],
  "Спецтехника": ["Автовышка", "Автогрейдер", "Ассенизаторная машина", "Асфальтоукладчик", "Бульдозер", "Дизельная электростанция", "Компрессор", "Поливомоечная машина", "Пробивочная установка (для труб)", "Трактор Белорусь (с щеткой)", "Трактор Белорусь (с прицепом)", "Трактор Белорусь (с отвалом)"],
  "Экскаваторы": ["Экскаватор гусеничный (с ковшом)", "Экскаватор гусеничный (с гидромолотом)", "Экскаватор колесный (с ковшом)", "Экскаватор колесный (с гидромолотом)", "Экскаватор (мини)"],
  "Экскаваторы-Погрузчики": ["Экскаватор-Погрузчик (с ковшом)", "Экскаватор-Погрузчик (с гидромолотом)", "Экскаватор-Погрузчик (с буроямом)"],
};

// Плоские списки для промпта
const objectsList = Object.values(objectCategoryOptions).flat();
const positionsList = Object.values(objectPositionOptions).flat();
const equipmentList = Object.entries(equipmentCategories)
  .map(([cat, items]) => `${cat}: ${items.join(", ")}`)
  .join("; ");

const today = new Date();
const todayStr = today.toISOString().split("T")[0];

const SYSTEM_PROMPT = `Ты — помощник диспетчера строительной компании. Разбери текстовую заявку прораба на технику и верни ТОЛЬКО JSON, без пояснений.

Объекты: ${objectsList.join(", ")}
Позиции: ${positionsList.join(", ")}
Техника (категория: наименования): ${equipmentList}

Сегодня: ${todayStr}. Если написано "завтра" — прибавь 1 день, "послезавтра" — 2 дня и т.д.
Время — только цифра часа (например, "8" для 08:00). startTime и endTime — целые числа от 6 до 22.
Если количество не указано — верни 1.

Для категорий "Длинномеры" и "Манипуляторы" поле note ОБЯЗАТЕЛЬНО — укажи наименование груза, вес и место погрузки/разгрузки из текста. Если пользователь упомянул груз, его вес или место — всё это пиши в note.

Верни JSON:
{
  "object": "название объекта из справочника или null",
  "position": "позиция из справочника или null",
  "date": "YYYY-MM-DD или null",
  "startTime": число или null,
  "endTime": число или null,
  "category": "категория техники из справочника или null",
  "equipmentName": "наименование техники из справочника или null",
  "quantity": число или null,
  "note": "для Длинномеров и Манипуляторов — наименование, вес и место. Для остальных — любые детали из текста не вошедшие в поля выше, или null",
  "summary": "краткое резюме заявки на русском (1 предложение)"
}`;

const SmartRequestPage = () => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const startListening = () => {
    if (!SpeechRecognition) {
      setError("Голосовой ввод не поддерживается в этом браузере. Используйте Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setText(transcript);
    };

    recognition.onerror = (e) => {
      setError("Ошибка микрофона: " + e.error);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const analyze = async () => {
    if (!text.trim()) return;
    if (!GROQ_API_KEY) {
      setError("Не задан REACT_APP_GROQ_API_KEY в .env");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0,
          max_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Groq ${res.status}: ${t}`);
      }

      const data = await res.json();
      const json = JSON.parse(data.choices[0].message.content);
      setResult(json);
    } catch (e) {
      setError(e.message || "Ошибка при анализе");
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (!result) return;

    // Ищем objectCategory по точному совпадению object в справочнике
    let objectCategory = "";
    if (result.object) {
      for (const [cat, objs] of Object.entries(objectCategoryOptions)) {
        if (objs.includes(result.object)) {
          objectCategory = cat;
          break;
        }
      }
    }

    // Проверяем что position валидна для данного object
    const validPositions = objectPositionOptions[result.object] || [];
    const position = validPositions.includes(result.position) ? result.position : "";

    const prefill = [
      {
        objectCategory,
        object: result.object || "",
        position,
        category: result.category || "",
        equipmentName: result.equipmentName || "",
        quantity: result.quantity ? String(result.quantity) : "",
        startTime: result.startTime ? String(result.startTime) : "",
        endTime: result.endTime ? String(result.endTime) : "",
        note: result.note || "",
      },
    ];

    localStorage.setItem("lastRequestData", JSON.stringify(prefill));
    if (result.date) localStorage.setItem("smartRequestDate", result.date);

    navigate("/request");
  };

  const fields = result
    ? [
        ["Объект", result.object],
        ["Позиция", result.position],
        ["Дата", result.date],
        ["Начало", result.startTime != null ? `${result.startTime}:00` : null],
        ["Конец", result.endTime != null ? `${result.endTime}:00` : null],
        ["Техника", result.equipmentName],
        ["Кол-во", result.quantity],
        ["Примечание", result.note],
      ].filter(([, v]) => v != null && v !== "")
    : [];

  return (
    <div style={s.page}>
      <div style={s.card}>
        <button onClick={() => navigate("/")} style={s.back}>← Назад</button>

        <h2 style={s.title}>Умная заявка на технику</h2>
        <p style={s.hint}>
          Опишите что нужно — система заполнит форму автоматически.
        </p>

        {/* Кнопка микрофона */}
        <div style={s.micWrapper}>
          <button
            style={{ ...s.micBtn, ...(listening ? s.micBtnActive : {}) }}
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            title={listening ? "Остановить запись" : "Нажмите и говорите"}
          >
            {listening ? "⏹" : "🎤"}
          </button>
          <div style={s.micLabel}>
            {listening ? "Говорите... (нажмите чтобы остановить)" : "Нажмите и скажите заявку"}
          </div>
        </div>

        {/* Распознанный текст — редактируемый */}
        {text && (
          <div style={s.transcriptBox}>
            <div style={s.transcriptLabel}>Распознанный текст:</div>
            <textarea
              style={s.textarea}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}

        <button
          style={{ ...s.btn, opacity: loading || !text.trim() ? 0.6 : 1 }}
          onClick={analyze}
          disabled={loading || !text.trim()}
        >
          {loading ? "Анализирую..." : "Заполнить форму"}
        </button>

        {error && <div style={s.error}>{error}</div>}

        {result && (
          <div style={s.result}>
            <p style={s.summary}>{result.summary}</p>

            {fields.length > 0 && (
              <table style={s.table}>
                <tbody>
                  {fields.map(([label, value]) => (
                    <tr key={label}>
                      <td style={s.tdLabel}>{label}</td>
                      <td style={s.tdValue}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={s.actions}>
              <button style={s.btnGo} onClick={handleProceed}>
                Перейти к форме →
              </button>
              <button style={s.btnReset} onClick={() => { setResult(null); setText(""); }}>
                Ввести заново
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const s = {
  page: {
    minHeight: "100vh",
    background: "#f0f2f5",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "30px 16px",
  },
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "28px 24px",
    width: "100%",
    maxWidth: "520px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
  },
  back: {
    background: "none",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "14px",
    padding: 0,
    marginBottom: "16px",
    display: "block",
  },
  title: {
    margin: "0 0 6px",
    fontSize: "21px",
    fontWeight: 700,
  },
  hint: {
    color: "#666",
    fontSize: "14px",
    margin: "0 0 14px",
  },
  micWrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    padding: "28px 0 20px",
  },
  micBtn: {
    width: "90px",
    height: "90px",
    borderRadius: "50%",
    border: "none",
    background: "#007bff",
    fontSize: "36px",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,123,255,0.35)",
    transition: "transform 0.1s, box-shadow 0.1s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnActive: {
    background: "#dc3545",
    boxShadow: "0 0 0 8px rgba(220,53,69,0.2), 0 4px 16px rgba(220,53,69,0.4)",
    animation: "pulse 1.2s infinite",
  },
  micLabel: {
    color: "#666",
    fontSize: "14px",
    textAlign: "center",
  },
  transcriptBox: {
    marginBottom: "4px",
  },
  transcriptLabel: {
    fontSize: "12px",
    color: "#999",
    marginBottom: "6px",
  },
  textarea: {
    width: "100%",
    borderRadius: "8px",
    border: "1.5px solid #ddd",
    padding: "12px",
    fontSize: "15px",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  },
  btn: {
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "15px",
    cursor: "pointer",
    marginTop: "10px",
    width: "100%",
    fontWeight: 600,
  },
  error: {
    marginTop: "12px",
    background: "#fff0f0",
    color: "#c00",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "13px",
  },
  result: {
    marginTop: "20px",
    borderTop: "1.5px solid #eee",
    paddingTop: "18px",
  },
  summary: {
    fontSize: "15px",
    fontWeight: 600,
    margin: "0 0 14px",
    color: "#222",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "16px",
    fontSize: "14px",
  },
  tdLabel: {
    color: "#999",
    padding: "5px 12px 5px 0",
    verticalAlign: "top",
    whiteSpace: "nowrap",
    width: "100px",
  },
  tdValue: {
    color: "#222",
    padding: "5px 0",
    fontWeight: 500,
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  btnGo: {
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  btnReset: {
    background: "#f0f2f5",
    color: "#555",
    border: "none",
    borderRadius: "8px",
    padding: "10px",
    fontSize: "14px",
    cursor: "pointer",
    width: "100%",
  },
};

export default SmartRequestPage;
