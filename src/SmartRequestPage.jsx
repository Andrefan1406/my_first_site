import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { objectCategoryOptions, objectPositionOptions } from "./data/constructionData";
import { objectCategoryOptions2, objectPositionOptions2 } from "./data/constructionData2";

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

// Справочники для промпта
const objectsList = Object.values(objectCategoryOptions).flat();
const objectsList2 = Object.values(objectCategoryOptions2).flat();
const equipmentList = Object.entries(equipmentCategories)
  .map(([cat, items]) => `${cat}: ${items.join(", ")}`)
  .join("; ");

const today = new Date();
const todayStr = today.toISOString().split("T")[0];

const SYSTEM_PROMPT = `Ты — помощник диспетчера строительной компании. Разбери заявку прораба и верни ТОЛЬКО JSON, без пояснений.

Сначала определи ТИП заявки по ключевым словам:
- "техника" — упоминается спецтехника, краны, экскаваторы, самосвалы, погрузчики, бетононасосы, газели, длинномеры, катки, бульдозеры, трактора, манипуляторы
- "бетон" — упоминается бетон, раствор, марка бетона (В15, В25 и т.п.), пескобетон, класс бетона
- "геодезисты" — упоминаются геодезисты, вынос осей, съёмка, геодезия, разбивка, исполнительная
- "электрики" — упоминаются электрики, подключение, отключение, прогрев бетона (электрический), монтаж/демонтаж электрики, электростанция

Сегодня: ${todayStr}. Если "завтра" — прибавь 1 день, "послезавтра" — 2 дня.
Время — целое число часа (6..22). Если не указано — null.
Если количество не указано — 1.

Прораб может запросить несколько позиций — каждая отдельным объектом в items.

=== ОБЪЕКТЫ ДЛЯ ТЕХНИКИ / ГЕОДЕЗИСТОВ / ЭЛЕКТРИКОВ ===
${objectsList.join(", ")}

=== ОБЪЕКТЫ ДЛЯ БЕТОНА/РАСТВОРА ===
${objectsList2.join(", ")}

=== ТЕХНИКА (категория: наименования) ===
${equipmentList}

=== КОНСТРУКТИВЫ ДЛЯ ГЕОДЕЗИСТОВ ===
Монолит, Земляные работы, Благоустройство, Сети, Фасад, Другое

=== ВИДЫ РАБОТ ДЛЯ ГЕОДЕЗИСТОВ (по конструктиву) ===
Монолит: Вынос осей, Проверка опалубки на вертикальность, Разбивка контура плиты перекрытия, Вынос метровой отметки, Исполнительная съёмка, Другое
Земляные работы: Вынос границ котлована, Вынос высотных отметок, Вынос границ бетонной подготовки, Вынос границ фундамента, Исполнительная съёмка, Другое
Благоустройство: Разбивка бордюр, поребрика, Вынос высотных отметок, Исполнительная съёмка, Топосъёмка, Другое
Сети: Разбивка трассы (колодцы, кабеля, УП), Проверка правильности установки колодцев/трубопроводов, Исполнительная съёмка, Другое
Фасад: Вынос отметок, Другое

=== КАТЕГОРИИ РАБОТ ДЛЯ ЭЛЕКТРИКОВ ===
Подключение, Отключение, Монтаж, Демонтаж, Прогрев бетона, Мелкосрочный ремонт, Обход и осмотр оборудования, Проверка, Другое

=== МАРКИ БЕТОНА ===
Бетон: В 7,5 / В 12,5 / В 15 / В 20 / В 22,5 / В 25 / В 30 / В 40 F 300 / Пескобетон М100..М400
Раствор: М 50 / М 75 / М 100

Верни JSON в зависимости от типа:

Для type="техника":
{
  "type": "техника",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "startTime": число|null, "endTime": число|null, "category": "...|null", "equipmentName": "...|null", "quantity": число, "note": "...|null" }]
}

Для type="бетон":
{
  "type": "бетон",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "time": число|null, "material": "Бетон|Раствор|null", "grade": "марка из справочника|null", "quantity": число|null, "note": "...|null" }]
}

Для type="геодезисты":
{
  "type": "геодезисты",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "konstruktiv": "...|null", "workType": "...|null", "workDescription": "...|null" }]
}

Для type="электрики":
{
  "type": "электрики",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "startTime": число|null, "workCategory": "...|null", "workDescription": "...|null" }]
}`;

// Иконки и названия типов
const TYPE_META = {
  техника:     { label: "Техника",      color: "#007bff", bg: "#e8f0fe", route: "/request" },
  бетон:       { label: "Бетон/Раствор", color: "#e65100", bg: "#fff3e0", route: "/concrete-request2" },
  геодезисты:  { label: "Геодезисты",   color: "#388e3c", bg: "#e8f5e9", route: "/geo-request" },
  электрики:   { label: "Электрики",    color: "#7b1fa2", bg: "#f3e5f5", route: "/electricans-request" },
};

// Функция поиска категории объекта
const findCategory = (obj, catOptions) => {
  if (!obj) return "";
  for (const [cat, objs] of Object.entries(catOptions)) {
    if (objs.includes(obj)) return cat;
  }
  return "";
};

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
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setText(transcript);
    };
    recognition.onerror = (e) => { setError("Ошибка микрофона: " + e.error); setListening(false); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };

  const analyze = async () => {
    if (!text.trim()) return;
    if (!GROQ_API_KEY) { setError("Не задан REACT_APP_GROQ_API_KEY в .env"); return; }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0,
          max_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
        }),
      });

      if (!res.ok) { const t = await res.text(); throw new Error(`Groq ${res.status}: ${t}`); }

      const data = await res.json();
      const json = JSON.parse(data.choices[0].message.content);
      if (!json.type) json.type = "техника";
      if (!json.items) { const { summary, type, ...item } = json; json.items = [item]; }
      setResult(json);
    } catch (e) {
      setError(e.message || "Ошибка при анализе");
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    if (!result) return;
    const { type, items } = result;
    const firstDate = items.find((i) => i.date)?.date;
    const meta = TYPE_META[type] || TYPE_META.техника;

    if (type === "техника") {
      const prefill = items.map((item) => ({
        objectCategory: findCategory(item.object, objectCategoryOptions),
        object: item.object || "",
        position: (objectPositionOptions[item.object] || []).includes(item.position) ? item.position : "",
        category: item.category || "",
        equipmentName: item.equipmentName || "",
        quantity: item.quantity ? String(item.quantity) : "",
        startTime: item.startTime != null ? String(item.startTime) : "",
        endTime: item.endTime != null ? String(item.endTime) : "",
        note: item.note || "",
      }));
      localStorage.setItem("lastRequestData", JSON.stringify(prefill));
      if (firstDate) localStorage.setItem("smartRequestDate", firstDate);
      navigate("/request");

    } else {
      // Для бетона, геодезистов, электриков — через router state
      const catOptions = type === "бетон" ? objectCategoryOptions2 : objectCategoryOptions;
      const posOptions = type === "бетон" ? objectPositionOptions2 : objectPositionOptions;

      const rows = items.map((item) => {
        const objectCategory = findCategory(item.object, catOptions);
        const validPos = posOptions[item.object] || [];
        const position = validPos.includes(item.position) ? item.position : "";

        if (type === "бетон") {
          return {
            objectCategory,
            object: item.object || "",
            position,
            date: item.date || "",
            time: item.time != null ? String(item.time) : "",
            material: item.material || "",
            concreteGrade: item.grade || "",
            quantity: item.quantity != null ? String(item.quantity) : "",
            note: item.note || "",
          };
        }
        if (type === "геодезисты") {
          return {
            objectCategory,
            object: item.object || "",
            position,
            konstruktiv: item.konstruktiv || "",
            workType: item.workType || "",
            workDescription: item.workDescription || "",
          };
        }
        // электрики
        return {
          objectCategory,
          object: item.object || "",
          position,
          startTime: item.startTime != null ? String(item.startTime) : "",
          workCategory: item.workCategory || "",
          workDescription: item.workDescription || "",
        };
      });

      navigate(meta.route, { state: { prefill: { date: firstDate || "", rows } } });
    }
  };

  const itemFields = (item, type) => {
    if (type === "техника") return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Начало", item.startTime != null ? `${item.startTime}:00` : null],
      ["Конец", item.endTime != null ? `${item.endTime}:00` : null],
      ["Техника", item.equipmentName],
      ["Кол-во", item.quantity],
      ["Примечание", item.note],
    ].filter(([, v]) => v != null && v !== "");

    if (type === "бетон") return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Время", item.time != null ? `${item.time}:00` : null],
      ["Материал", item.material],
      ["Марка", item.grade],
      ["Кол-во", item.quantity],
      ["Примечание", item.note],
    ].filter(([, v]) => v != null && v !== "");

    if (type === "геодезисты") return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Конструктив", item.konstruktiv],
      ["Вид работ", item.workType],
      ["Описание", item.workDescription],
    ].filter(([, v]) => v != null && v !== "");

    // электрики
    return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Начало", item.startTime != null ? `${item.startTime}:00` : null],
      ["Категория работ", item.workCategory],
      ["Описание", item.workDescription],
    ].filter(([, v]) => v != null && v !== "");
  };

  const meta = result ? (TYPE_META[result.type] || TYPE_META.техника) : null;
  const cnt = result?.items?.length || 0;
  const cntLabel = cnt === 1 ? "строка" : cnt < 5 ? "строки" : "строк";

  return (
    <div style={s.page}>
      <div style={s.card}>
        <button onClick={() => navigate("/")} style={s.back}>← Назад</button>

        <h2 style={s.title}>Умная заявка</h2>
        <p style={s.hint}>Опишите что нужно — система определит тип и заполнит форму автоматически.</p>

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

        {result && meta && (
          <div style={s.result}>
            <div style={{ ...s.typeBadge, color: meta.color, background: meta.bg }}>
              Тип заявки: <strong>{meta.label}</strong>
            </div>
            <p style={s.summary}>{result.summary}</p>

            {result.items.map((item, idx) => {
              const fields = itemFields(item, result.type);
              if (!fields.length) return null;
              return (
                <div key={idx} style={s.itemCard}>
                  {result.items.length > 1 && (
                    <div style={{ ...s.itemNum, color: meta.color }}>Строка {idx + 1}</div>
                  )}
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
                </div>
              );
            })}

            <div style={s.actions}>
              <button style={{ ...s.btnGo, background: meta.color }} onClick={handleProceed}>
                Перейти к форме «{meta.label}» ({cnt} {cntLabel}) →
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
  page: { minHeight: "100vh", background: "#f0f2f5", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px" },
  card: { background: "#fff", borderRadius: "12px", padding: "28px 24px", width: "100%", maxWidth: "520px", boxShadow: "0 2px 16px rgba(0,0,0,0.10)" },
  back: { background: "none", border: "none", color: "#007bff", cursor: "pointer", fontSize: "14px", padding: 0, marginBottom: "16px", display: "block" },
  title: { margin: "0 0 6px", fontSize: "21px", fontWeight: 700 },
  hint: { color: "#666", fontSize: "14px", margin: "0 0 14px" },
  micWrapper: { display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "28px 0 20px" },
  micBtn: { width: "90px", height: "90px", borderRadius: "50%", border: "none", background: "#007bff", fontSize: "36px", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,123,255,0.35)", transition: "transform 0.1s, box-shadow 0.1s", display: "flex", alignItems: "center", justifyContent: "center" },
  micBtnActive: { background: "#dc3545", boxShadow: "0 0 0 8px rgba(220,53,69,0.2), 0 4px 16px rgba(220,53,69,0.4)" },
  micLabel: { color: "#666", fontSize: "14px", textAlign: "center" },
  transcriptBox: { marginBottom: "4px" },
  transcriptLabel: { fontSize: "12px", color: "#999", marginBottom: "6px" },
  textarea: { width: "100%", borderRadius: "8px", border: "1.5px solid #ddd", padding: "12px", fontSize: "15px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", outline: "none" },
  btn: { background: "#007bff", color: "#fff", border: "none", borderRadius: "8px", padding: "12px 24px", fontSize: "15px", cursor: "pointer", marginTop: "10px", width: "100%", fontWeight: 600 },
  error: { marginTop: "12px", background: "#fff0f0", color: "#c00", borderRadius: "8px", padding: "10px 14px", fontSize: "13px" },
  result: { marginTop: "20px", borderTop: "1.5px solid #eee", paddingTop: "18px" },
  typeBadge: { display: "inline-block", borderRadius: "20px", padding: "4px 14px", fontSize: "13px", fontWeight: 600, marginBottom: "10px" },
  summary: { fontSize: "15px", fontWeight: 600, margin: "0 0 14px", color: "#222" },
  table: { width: "100%", borderCollapse: "collapse", marginBottom: "0", fontSize: "14px" },
  tdLabel: { color: "#999", padding: "5px 12px 5px 0", verticalAlign: "top", whiteSpace: "nowrap", width: "120px" },
  tdValue: { color: "#222", padding: "5px 0", fontWeight: 500 },
  actions: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" },
  btnGo: { color: "#fff", border: "none", borderRadius: "8px", padding: "12px", fontSize: "15px", fontWeight: 600, cursor: "pointer", width: "100%" },
  btnReset: { background: "#f0f2f5", color: "#555", border: "none", borderRadius: "8px", padding: "10px", fontSize: "14px", cursor: "pointer", width: "100%" },
  itemCard: { background: "#f8f9fa", borderRadius: "8px", padding: "10px 14px", marginBottom: "10px", border: "1px solid #e9ecef" },
  itemNum: { fontSize: "12px", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" },
};

export default SmartRequestPage;
