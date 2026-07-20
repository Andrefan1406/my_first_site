import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { objectCategoryOptions, objectPositionOptions, equipmentCategoryOptions, positionBlockOptions, blockFloorOptions, floorConstructiveOptions, materialGradeOptions, konstruktivOptions, workTypeForKonstruktiv, workCategoryOptions } from "./data/constructionData";

// Ollama Cloud не отдаёт CORS-заголовки для браузера, поэтому запрос идёт
// через локальный прокси (server/index.js), который держит ключ на сервере.
const SMART_REQUEST_API_URL = process.env.REACT_APP_SMART_REQUEST_API_URL || "http://localhost:4000";

// Модель иногда оборачивает JSON в ```json ... ``` несмотря на format:"json" —
// на всякий случай снимаем обёртку перед парсингом.
const extractJson = (raw) => {
  const trimmed = (raw || "").trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
};

const equipmentCategories = equipmentCategoryOptions;

// Справочники для промпта
const objectsList = Object.values(objectCategoryOptions).flat();
const equipmentList = Object.entries(equipmentCategories)
  .map(([cat, items]) => `${cat}: ${items.join(", ")}`)
  .join("; ");
const positionsList = Object.entries(objectPositionOptions)
  .map(([obj, positions]) => `${obj}: ${positions.join(", ")}`)
  .join("\n");
const blocksList = Object.entries(positionBlockOptions)
  .map(([pos, blocks]) => `${pos}: ${blocks.join(", ")}`)
  .join("\n");
const constructivesList = Object.entries(floorConstructiveOptions)
  .map(([floor, constructives]) => `${floor}: ${constructives.join(", ")}`)
  .join("\n");

const today = new Date();
const todayStr = today.toISOString().split("T")[0];

// Раньше был один промпт на ~10К символов со справочниками всех 7 типов сразу —
// каждый запрос гонял через модель весь этот объём, независимо от того, что
// реально спросили. Теперь запрос разбит на два шага:
// 1) маленький промпт-классификатор — определяет только тип заявки;
// 2) промпт со справочником ТОЛЬКО нужного типа — извлекает поля.
// Это не растёт с добавлением новых объектов/техники других типов.

const CLASSIFY_PROMPT = `Ты — диспетчер строительной компании. Определи ТИП заявки прораба по ключевым словам и верни ТОЛЬКО JSON вида {"type": "..."}, без пояснений.

Типы:
- "техника" — упоминается спецтехника, краны, экскаваторы, самосвалы, погрузчики, бетононасосы, газели, длинномеры, катки, бульдозеры, трактора, манипуляторы
- "бетон" — упоминается бетон, раствор, марка бетона (В15, В25 и т.п.), пескобетон, класс бетона
- "геодезисты" — упоминаются геодезисты, вынос осей, съёмка, геодезия, разбивка, исполнительная
- "электрики" — упоминаются электрики, подключение, отключение, прогрев бетона (электрический), монтаж/демонтаж электрики, электростанция
- "лаборатория" — упоминаются лаборатория, испытание, ИПС, уплотнение грунта, прочность бетона, лабораторные
- "брусчатка" — упоминаются брусчатка, бордюр, лоток, тротуарная плитка
- "жби" — упоминаются железобетонные изделия, ЖБИ, плита, перемычка, фундаментный блок, ФБС, балка, ригель, опора, кольцо, панель ограждения

Если явных ключевых слов нет — выбери наиболее вероятный тип по смыслу.

Верни: {"type": "техника|бетон|геодезисты|электрики|лаборатория|брусчатка|жби"}`;

const REFERENCE_BLOCKS = {
  objects: `=== ОБЪЕКТЫ ===\n${objectsList.join(", ")}`,

  positions: `=== ПОЗИЦИИ ПО ОБЪЕКТАМ ===\nВАЖНО: значение поля "position" бери ТОЧНО из справочника ниже, слово в слово. Не сокращай и не переформулируй (например "Экополис поз.103", а не "поз.103").\n${positionsList}`,

  equipment: `=== ТЕХНИКА (категория: наименования) ===\n${equipmentList}`,

  blocks: `=== БЛОКИ ПО ПОЗИЦИЯМ (только для жилых домов) ===\n${blocksList}`,

  constructives: `=== КОНСТРУКТИВЫ ПО ЭТАЖАМ ===\n${constructivesList}`,

  concreteGrades: `=== МАРКИ БЕТОНА ===
Бетон (классы): В 7,5 / В 12,5 / В 15 / В 20 / В 22,5 / В 25 / В 30 / В 7,5 СС / В 12,5 СС / В 15 СС / В 20 СС / В 22,5 СС / В 25 СС / В 30 СС / В 40 F 300
Пескобетон (марки): Пескобетон М100 / Пескобетон М150 / Пескобетон М200 / Пескобетон М250 / Пескобетон М350 / Пескобетон М400
Раствор: М 50 / М 75 / М 100
Подвижность бетона (concreteClass): П3 / П4

ВАЖНО — различай бетон и пескобетон:
- Если сказано "пескобетон" или "пескобетон М..." — material="Бетон", grade="Пескобетон М..."
- Если сказано "бетон" (без слова "пескобетон") — material="Бетон", grade=класс В...
- Если указана марка М (например М300) вместо класса В — переводи по таблице: М100→В 7,5 / М150→В 12,5 / М200→В 15 / М250→В 20 / М300→В 22,5 / М350→В 25 / М400→В 30
- concreteClass (П3/П4) — только для material="Бетон" с классом В... Для пескобетона — null`,

  geoConstructives: `=== КОНСТРУКТИВЫ ДЛЯ ГЕОДЕЗИСТОВ ===\nМонолит, Земляные работы, Благоустройство, Сети, Фасад, Другое`,

  geoWorkTypes: `=== ВИДЫ РАБОТ ДЛЯ ГЕОДЕЗИСТОВ (по конструктиву) ===
Монолит: Вынос осей, Проверка опалубки на вертикальность, Разбивка контура плиты перекрытия, Вынос метровой отметки, Исполнительная съёмка, Другое
Земляные работы: Вынос границ котлована, Вынос высотных отметок, Вынос границ бетонной подготовки, Вынос границ фундамента, Исполнительная съёмка, Другое
Благоустройство: Разбивка бордюр, поребрика, Вынос высотных отметок, Исполнительная съёмка, Топосъёмка, Другое
Сети: Разбивка трассы (колодцы, кабеля, УП), Проверка правильности установки колодцев, трубопроводов, Исполнительная съёмка, Другое
Фасад: Вынос отметок, Другое`,

  electricCategories: `=== КАТЕГОРИИ РАБОТ ДЛЯ ЭЛЕКТРИКОВ ===\nПодключение, Отключение, Монтаж, Демонтаж, Прогрев бетона, Мелкосрочный ремонт, Обход и осмотр оборудования, Проверка, Другое`,

  brusChatka: `=== СПРАВОЧНИК БРУСЧАТКИ ===
Изделия: Брусчатка (ед.изм. м²), Бордюр (ед.изм. м.пог.), Лоток (ед.изм. м.пог.)
Брусчатка — марки и характеристики:
Б.1.П.7: серия Новый город, цвет Серый, размеры 160*160*7 / 160*200*7 / 160*240*7
Б.2.П.7: серия Новый город, цвет Белый, размеры 160*160*7 / 160*200*7 / 160*240*7
Б.3.П.7: серия Новый город, цвет Черный, размеры 160*160*7 / 160*200*7 / 160*240*7
Б.5.П.7: серия Классика, цвет Серый, размеры 100*200*7
Б.6.П.7: серия Крупноформат, цвет Серый, размеры 320*160*7
Б.7.П.7: серия Крупноформат, цвет Белый, размеры 320*160*7
Б.8.П.7: серия Крупноформат, цвет Черный, размеры 320*160*7
Б.9.П.7: серия Крупноформат, цвет Серый, размеры 320*320*7
Б.10.П.7: серия Крупноформат, цвет Белый, размеры 320*320*7
Б.11.П.7: серия Крупноформат, цвет Черный, размеры 320*320*7
Б.12.П.7: серия Крупноформат, цвет Красный, размеры 320*160*7
Б.13.П.7: серия Старый Город, цвет Белый, размеры 120*120*7 / 120*90*7 / 180*120*7
Б.14.П.7: серия Старый Город, цвет Черный, размеры 120*120*7 / 120*90*7 / 180*120*7
Б.15.П.7: серия Старый Город, цвет Серый, размеры 120*120*7 / 120*90*7 / 180*120*7
Бордюр — марка: БР 100.30.15
Лоток — марка: 50.25.9
Дата для брусчатки — не ранее чем через 14 дней от сегодня (${todayStr}).`,

  znbCatalog: `=== СПРАВОЧНИК ЖБИ (изделие: марки) ===
Балка: Б-6, Б-7, Б-8, другое
Блоки бетонные для стен подвалов: ФБС 12.4.6т, ФБС 12.5.6т, ФБС 24.4.6т, ФБС 24.5.6т, ФБС 24.6.6т, ФБС 9.4.6т, ФБС 9.5.6т, ФБС 9.6.6т, ФБС12.6.6т, другое
Ж/б опора для передвижного ограждения: ОП-1, другое
Железобетонный фундамент для опоры наружного освещения: ФН-1, ФН-2, другое
Кабель канал: К 20.6.3, другое
Камни бетонные бортовые: БР100.20.8, другое
Кольцо стеновое цилиндрическое (Технологический бетон): КС 10.3 (КЦ-10-3), КС 10.6 (КЦ-10-6), КС 10.9 (КЦ-10-9), КС 15.6 (КЦ-15-6), КС 15.9 (КЦ-15-9), КС 20.6 (КЦ-20-6), КС 20.9 (КЦ-20-9), КС 7.3 (КЦ-7-3), КС 7.9 (КЦ-7-9), другое
Лоток: Л11-8/2, другое
Лоток водоотводный: Л-100.15.15, Л-100.25.15, Л-150.15.15, другое
Лоток водоотводный (Технологический бетон): Л-100.25.15, другое
Опора освещения: СВ 105-3,5, СВ 95-2а, другое
Опорное кольцо: КО-6 (КЦО-1), другое
Панель ограждения: 3ПБ30.20, ПО1В, ПО1В*, другое
Перемычка плитная: 2ПП17-5, 2ПП18-5, 3ПП16-71, 3ПП18-71, 3ПП27-71, 6ПП16-72, 6ПП21-72, 6ПП27-72, 6ПП30-13, другое
Перемычка брусковая: 1ПБ 13-1п, 1ПБ 16-1п, 2ПБ 10-1п, 2ПБ 13-1п, 2ПБ 16-2п, 2ПБ 17-2п, 2ПБ 19-3п, 2ПБ 25-3п, 2ПБ 29-4п, 3ПБ 13-37п, 3ПБ 16-37п, 3ПБ 18-37п, 3ПБ 30-8п, 4ПБ 44-8п, 5ПБ 18-27п, 5ПБ 21-27п, 5ПБ 25-27п, 5ПБ 27-27п, 5ПБ 27-37п, другое
Плита: ОП 200, ОП 220, П11-8, П-4, ПД 300.150.14-9, ПД 300.240.20-9, ПД 300.300.20-9, ПД 75.240.20-9, ПД 75.300.20-9, ПД43-15, ПТ 300.120.14-9, ПТ 300.150.14-9, ПТ 300.180.14-9, ПТ 300.210.16-9, ПТ 300.300.25-9, ПТ 30-15, ПТ 30-15/2000, ПТ 75.180.14-9, ПТ 75.210.16-9, ПТ 75.300.25-9, ПТ40-12, ПТ40-15, другое
Плита для железнодорожных переездов: ПЖ 03.00.00, ПЖ 04.00.00, другое
Плита днища: ПН10, ПН15, ПН20, ПН7, другое
Плита дорожная: 1П30.18-30, другое
Плита канала: ППк1, ППк1.1, ППк2, ППк2.1, ППк2.2, другое
Плита лотка: П28-15, П28д-15, другое
Плита перекрытия: КЦП 2-7, 1ПП15-1 (КЦП1-15-1), 1ПП15-2 (КЦП1-15-2), 1ПП20-1 (КЦП1-20-1), 1ПП20-2 (КЦП1-20-2), ПП10-1 (КЦП1-10-1), ПП10-2 (КЦП1-10-2), другое
Плита перекрытия лотков: П11д-8а, П12/2-12а, П15д-8а, П18д-8а, П21д-8, ПО-2, ПО-3, ПО-4, другое
Плита переходная: П800.98.40-ТАIII, другое
Противовес: ПР-2, другое
Пртивовес (Технологический бетон): ПР-1, другое
Ригель: Р-5100, другое
Стакан под панель ограждения: ОФ-1а, другое
Другое: (указать в примечании)
Дата для ЖБИ — не ранее чем через 14 дней от сегодня (${todayStr}). Если выбрано "Другое" в изделии или марке — обязательно укажи note.`,
};

const SCHEMAS = {
  техника: `Верни JSON:
{
  "type": "техника",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "startTime": число|null, "endTime": число|null, "category": "...|null", "equipmentName": "...|null", "quantity": число, "note": "...|null" }]
}`,

  бетон: `Верни JSON:
{
  "type": "бетон",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "time": число|null, "block": "блок из справочника|null", "floor": "этаж из справочника|null", "constructive": "конструктив из справочника|null", "material": "Бетон|Раствор|null", "grade": "марка из справочника|null", "concreteClass": "П3|П4|null", "quantity": число|null, "note": "...|null" }]
}
Примечание: block/floor/constructive заполняй только если позиция есть в справочнике блоков. Для остальных объектов (дороги, сети, производственные) — оставь null. material для каменной кладки = "Раствор", для остальных конструктивов = "Бетон". concreteClass только для material="Бетон".`,

  геодезисты: `Верни JSON:
{
  "type": "геодезисты",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "konstruktiv": "...|null", "workType": "...|null", "workDescription": "...|null" }]
}`,

  электрики: `Верни JSON:
{
  "type": "электрики",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "startTime": число|null, "workCategory": "...|null", "workDescription": "...|null" }]
}`,

  лаборатория: `Верни JSON:
{
  "type": "лаборатория",
  "summary": "...",
  "items": [{ "test": "Степень уплотнения грунта|Прочность бетона с помощью ИПС|null", "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "block": "блок из справочника|null", "floor": "этаж из справочника|null", "constructive": "конструктив из справочника|null", "note": "...|null" }]
}
Примечание: для test="Степень уплотнения грунта" — block/floor всегда null, constructive всегда "Основание". Для test="Прочность бетона с помощью ИПС" — block/floor/constructive по справочникам (только если позиция есть в справочнике блоков). Если объект "Инженерные сети" — обязательно укажи note с деталями.`,

  брусчатка: `Верни JSON:
{
  "type": "брусчатка",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "block": "блок из справочника|null", "product": "Брусчатка|Бордюр|Лоток|null", "brand": "марка из справочника|null", "series": "серия|null", "color": "цвет|null", "dimensions": "размеры|null", "quantity": число|null, "note": "...|null" }]
}
Примечание: дата не раньше чем через 14 дней от сегодня. block — только если позиция есть в справочнике блоков.`,

  жби: `Верни JSON:
{
  "type": "жби",
  "summary": "...",
  "items": [{ "object": "...|null", "position": "...|null", "date": "YYYY-MM-DD|null", "block": "блок из справочника|null", "product": "изделие из справочника|null", "brand": "марка из справочника|null", "quantity": число|null, "note": "...|null" }]
}
Примечание: дата не раньше чем через 14 дней от сегодня. block — только если позиция есть в справочнике блоков. Если изделие или марка не из справочника — используй "Другое" и укажи детали в note.`,
};

// Какие справочники реально нужны для извлечения полей каждого типа —
// остальные (например каталог ЖБИ при заявке на технику) в промпт не идут.
const TYPE_BLOCKS = {
  техника: ["objects", "positions", "equipment"],
  бетон: ["objects", "positions", "blocks", "constructives", "concreteGrades"],
  геодезисты: ["objects", "positions", "geoConstructives", "geoWorkTypes"],
  электрики: ["objects", "positions", "electricCategories"],
  лаборатория: ["objects", "positions", "blocks", "constructives"],
  брусчатка: ["objects", "positions", "blocks", "brusChatka"],
  жби: ["objects", "positions", "blocks", "znbCatalog"],
};

const buildExtractionPrompt = (type) => {
  const blockKeys = TYPE_BLOCKS[type] || TYPE_BLOCKS.техника;
  const blocks = blockKeys.map((key) => REFERENCE_BLOCKS[key]).join("\n\n");
  const schema = SCHEMAS[type] || SCHEMAS.техника;

  return `Ты — помощник диспетчера строительной компании. Тип заявки уже определён: "${type}". Разбери заявку прораба и верни ТОЛЬКО JSON, без пояснений.

Сегодня: ${todayStr}. Если "завтра" — прибавь 1 день, "послезавтра" — 2 дня.
Время — целое число часа (6..22). Если не указано — null.
Если количество не указано — 1.

Прораб может запросить несколько позиций — каждая отдельным объектом в items.

${blocks}

${schema}`;
};

// Иконки и названия типов
const TYPE_META = {
  техника:     { label: "Техника",      color: "#007bff", bg: "#e8f0fe", route: "/request" },
  бетон:       { label: "Бетон/Раствор", color: "#e65100", bg: "#fff3e0", route: "/concrete-request" },
  геодезисты:  { label: "Геодезисты",   color: "#388e3c", bg: "#e8f5e9", route: "/geo-request" },
  электрики:   { label: "Электрики",    color: "#7b1fa2", bg: "#f3e5f5", route: "/electricans-request" },
  лаборатория: { label: "Лаборатория",  color: "#00796b", bg: "#e0f2f1", route: "/lab-request" },
  брусчатка:   { label: "Брусчатка/БЛБ", color: "#795548", bg: "#efebe9", route: "/blbrequest" },
  жби:         { label: "ЖБИ",           color: "#546e7a", bg: "#eceff1", route: "/znbrequest" },
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
  const [loadingStage, setLoadingStage] = useState(""); // "classify" | "extract"
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

  const askLLM = async (systemPrompt) => {
    const res = await fetch(`${SMART_REQUEST_API_URL}/api/smart-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error(`Smart Request API ${res.status}: ${t}`); }
    const data = await res.json();
    return JSON.parse(extractJson(data.message?.content));
  };

  const analyze = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // 1) Дешёвая классификация типа — маленький промпт без справочников.
      setLoadingStage("classify");
      const classified = await askLLM(CLASSIFY_PROMPT);
      const type = TYPE_META[classified.type] ? classified.type : "техника";

      // 2) Извлечение полей — промпт только со справочником этого типа.
      setLoadingStage("extract");
      const json = await askLLM(buildExtractionPrompt(type));
      if (!json.type) json.type = type;
      if (!json.items) { const { summary, type: _t, ...item } = json; json.items = [item]; }
      setResult(json);
    } catch (e) {
      setError(e.message || "Ошибка при анализе");
    } finally {
      setLoading(false);
      setLoadingStage("");
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
      const rows = items.map((item) => {
        const objectCategory = findCategory(item.object, objectCategoryOptions);
        const validPos = objectPositionOptions[item.object] || [];
        const position = validPos.includes(item.position) ? item.position : "";

        if (type === "бетон") {
          const validBlocks = positionBlockOptions[position] || [];
          const block = validBlocks.includes(item.block) ? item.block : "";
          const validFloors = blockFloorOptions[block] || [];
          const floor = validFloors.includes(item.floor) ? item.floor : "";
          const validConstructives = floorConstructiveOptions[floor] || [];
          const constructive = validConstructives.includes(item.constructive) ? item.constructive : "";

          // Для позиций с блоками поле "Материал" в самой форме — не свободный
          // выбор, а всегда выводится из "Конструктива" (селект задизейблен).
          // Если конструктив не подтверждён справочником, material/grade/class
          // подставлять нельзя — иначе на форме они "фантомно" пропадут при
          // первом же выборе блока/этажа, хотя выглядели заполненными.
          const hasBlocks = !!positionBlockOptions[position];
          let material;
          if (hasBlocks) {
            material = constructive ? (constructive === "каменная кладка" ? "Раствор" : "Бетон") : "";
          } else {
            material = ["Бетон", "Раствор"].includes(item.material) ? item.material : "";
          }
          const concreteGrade = (materialGradeOptions[material] || []).includes(item.grade) ? item.grade : "";
          const concreteClass = material === "Бетон" && ["П3", "П4"].includes(item.concreteClass) ? item.concreteClass : "";

          return {
            category: objectCategory,
            object: item.object || "",
            position,
            date: item.date || "",
            time: item.time != null ? String(item.time) : "",
            block,
            floor,
            constructive,
            material,
            concreteGrade,
            concreteClass,
            quantity: item.quantity != null ? String(item.quantity) : "",
            note: item.note || "",
          };
        }
        if (type === "геодезисты") {
          const konstruktiv = konstruktivOptions.includes(item.konstruktiv) ? item.konstruktiv : "";
          const validWorkTypes = konstruktiv ? (workTypeForKonstruktiv[konstruktiv] || []) : [];
          const workType = validWorkTypes.includes(item.workType) ? item.workType : "";
          return {
            objectCategory,
            object: item.object || "",
            position,
            konstruktiv,
            workType,
            workDescription: item.workDescription || "",
          };
        }
        if (type === "электрики") {
          return {
            objectCategory,
            object: item.object || "",
            position,
            startTime: item.startTime != null ? String(item.startTime) : "",
            workCategory: workCategoryOptions.includes(item.workCategory) ? item.workCategory : "",
            workDescription: item.workDescription || "",
          };
        }
        if (type === "лаборатория") {
        const isSoil = item.test === "Степень уплотнения грунта";
        const validBlocks = !isSoil ? (positionBlockOptions[position] || []) : [];
        const block = validBlocks.includes(item.block) ? item.block : "";
        const validFloors = block ? (blockFloorOptions[block] || []) : [];
        const floor = validFloors.includes(item.floor) ? item.floor : "";
        const validConstructives = floor ? (floorConstructiveOptions[floor] || []) : [];
        const constructive = isSoil ? "Основание" : (validConstructives.includes(item.constructive) ? item.constructive : "");
        return {
          objectCategory,
          object: item.object || "",
          position,
          test: item.test || "",
          date: item.date || "",
          block,
          floor,
          constructive,
          note: item.note || "",
        };
        }
        if (type === "брусчатка") {
        const blbBlock = (positionBlockOptions[position] || []).includes(item.block) ? item.block : "";
        return {
          objectCategory,
          object: item.object || "",
          position,
          block: blbBlock,
          date: item.date || "",
          product: item.product || "",
          brand: item.brand || "",
          series: item.series || "",
          color: item.color || "",
          dimensions: item.dimensions || "",
          quantity: item.quantity != null ? String(item.quantity) : "",
          note: item.note || "",
        };
        }
        // жби
        const znbBlock = (positionBlockOptions[position] || []).includes(item.block) ? item.block : "";
        return {
          objectCategory,
          object: item.object || "",
          position,
          block: znbBlock,
          date: item.date || "",
          product: item.product || "",
          brand: item.brand || "",
          quantity: item.quantity != null ? String(item.quantity) : "",
          note: item.note || "",
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
      ["Блок", item.block],
      ["Этаж", item.floor],
      ["Конструктив", item.constructive],
      ["Материал", item.material],
      ["Марка", item.grade],
      ["Подвижность", item.concreteClass],
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

    if (type === "электрики") return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Начало", item.startTime != null ? `${item.startTime}:00` : null],
      ["Категория работ", item.workCategory],
      ["Описание", item.workDescription],
    ].filter(([, v]) => v != null && v !== "");

    if (type === "лаборатория") return [
      ["Испытание", item.test],
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Дата", item.date],
      ["Блок", item.block],
      ["Этаж", item.floor],
      ["Конструктив", item.constructive],
      ["Примечание", item.note],
    ].filter(([, v]) => v != null && v !== "");

    if (type === "брусчатка") return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Блок", item.block],
      ["Дата", item.date],
      ["Изделие", item.product],
      ["Марка", item.brand],
      ["Серия", item.series],
      ["Цвет", item.color],
      ["Размеры", item.dimensions],
      ["Кол-во", item.quantity],
      ["Примечание", item.note],
    ].filter(([, v]) => v != null && v !== "");

    // жби
    return [
      ["Объект", item.object],
      ["Позиция", item.position],
      ["Блок", item.block],
      ["Дата", item.date],
      ["Изделие", item.product],
      ["Марка", item.brand],
      ["Кол-во", item.quantity],
      ["Примечание", item.note],
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
          {loading
            ? (loadingStage === "extract" ? "Заполняю поля..." : "Определяю тип заявки...")
            : "Заполнить форму"}
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
