import React, { useState } from "react";

// Списки категорий, объектов и прочих опций (оставляем без изменений)
const categoryOptions = {
  "Автобетононасосы": ["Автобетононасос (стрела 37м)", "Автобетононасос (стрела 42м)", "Автобетононасос (стрела 50м)"],
  "Автобетоносмесители": ["Автобетоносмеситель (5м3)", "Автобетоносмеситель (7м3)", "Автобетоносмеситель (10м3)", "Автобетоносмеситель (самоходный 2м3)"],
  "Автокраны": ["Автокран (25т)", "Автокран (30т)", "Автокран (70т)"],
  "Газели": ["Газель (грузовая кузов-3м)", "Газель (грузовая кузов-4м)", "Газель (грузовая кузов-6м)", "Газель (грузопассажирская кузов-2м)", "Газель (пассажирская)"],
  "Длинномеры": ["Длинномер (9м)", "Длинномер (12м)", "Длинномер (16м)"],
  "Катки": ["Каток вибрационный (10тн)", "Каток вибрационный (3тн)", "Каток грунтовый (16тн)", "Каток дорожный (4тн)"],
  "Манипуляторы": ["Манипулятор"],
  "Погрузчики": ["Погрузчик 2м3", "Погрузчик 3м3", "Погрузчик (мини)", "Погрузчик (вилочный)"],
  "Самосвалы": ["Самосвал (20т)", "Самосвал (15т)", "Самосвал (5т)"],
  "Спецтехника": ["Автогрейдер", "Асфальтоукладчик", "Бульдозер", "Дизельная электростанция", "Компрессор", "Поливомоечная машина", "Ассенизаторная машина", "Пробивочная установка (для труб)"],
  "Экскаваторы": ["Экскаватор гусеничный (с ковшом)", "Экскаватор гусеничный (с гидромолотом)", "Экскаватор колесный (с ковшом)", "Экскаватор колесный (с гидромолотом)"],
  "Экскаваторы-Погрузчики": ["Экскаватор-Погрузчик (с ковшом)", "Экскаватор-Погрузчик (с гидромолотом)", "Экскаватор-Погрузчик (с буроямом)"]
};

const objectCategoryOptions = {
  "Строительство жилых домов": ["Брик таун", "НЖ 3", "СПОРТ 2", "Элитка"],
  "Строительство и ремонт дорог": ["Дороги НЖ 4,5", "Дорога Шале ла Бале", "Развязка"],
  "Строительство и реконструкция коммерческих, частных и туристических объектов": ["Горная Ульбинка", "Зимовьё", "Коммерческие объекты",
     "Коммерческие помещения в жилых домах", "Мелада", "Нуртау", "Орлан", "Урунтаева 12/1", "Черемушки"],
  "Строительство сетей и благоустройство": ["Сети и благоустройство", "Благоустройство", "Инженерные сети"],
  "Строительство объектов инфраструктуры (кроме жилых домов)": ["Бизнес центр пр.Победы", "Ветлаборатория", "Резиденция", "Учебные заведения", "Хилтон"],
  "Строительство производственных объектов": ["База Самарское", "База Эскор", "БРУ", "Новоявленка", "Парыгино", "Цех брусчатки", "Цех ЖБИ"]
};

const objectPositionOptions = {
  "Брик таун": ["Брик Таун 1", "Брик Таун 2"],
  "НЖ 3": ["поз.56", "поз. 57", "поз. 58", "поз. 59", "поз.60", "поз. 63", "поз. 64", "поз. 65", "поз. 69", "поз. 72", "Стройгородок НЖ3", "Экополис"],
  "СПОРТ 2": ["поз. 100", "поз. 101", "поз. 73-75", "поз. 74", "поз. 76", "поз. 93"],
  "Элитка": ["Элитка"],
  "Дороги НЖ 4,5": ["Дороги НЖ 4,5"],
  "Дорога Шале ла Бале": ["Дорога Шале ла Бале"],
  "Развязка": ["Развязка"],
  "Горная Ульбинка": ["Орленок", "Каменный карьер"],
  "Зимовьё": ["Зимовьё"],
  "Коммерческие объекты": ["ROYAL B", "Автомойка (АТХ)", "Автомойка (Нурлы Жол)", "Кафе Бистро", "Кренделия"],
  "Коммерческие помещения в жилых домах": ["Магазин Жибек Жолы 3", "Медцентр Жибек Жолы", "поз. 107 (Детский сад)", "поз. 107 КП", "поз. 13/1 КП", "поз. 49/1 КП", "поз. 50/1 КП (Салон Красоты)", "поз. 53/2 КП"],
  "Мелада" : ["Мелада"],
  "Нуртау": ["Нуртау"],
  "Орлан" : ["б/о Орлан", "Орлан ИЖД-1", "Орлан ИЖД-1"],
  "Урунтаева 12/1": ["Урунтаева 12/1"],
  "Черемушки" : ["Черемушки"],
  "Сети и благоустройство": ["Н.Бухтарма"],
  "Благоустройство": ["Благоустройство Гребной канал", "Благоустройство НЖ3", "Благоустройство СПОРТ 2"],
  "Инженерные сети": ["Коллектор", "КОС", "Сети ОВ ВК НЖ 3", "Сети ОВ ВК НЖ 4,5", "Сети ОВ ВК СПОРТ 2", "Сети Эл НЖ 4,5"],
  "Бизнес центр пр.Победы": ["Бизнес центр пр.Победы"],
  "Ветлаборатория": ["Ветлаборатория"],
  "Резиденция": ["Резиденция"],
  "Учебные заведения": [ "Дет.сад НЖ", "Комфортная школа", "Ледовый каток", "Лицей"],
  "Хилтон": ["Хилтон"],
  "База Самарское": ["База Самарское"],
  "База Эскор": ["База Эскор"],
  "БРУ": ["БРУ"],
  "Новоявленка": ["Комбинат ПГС"],
  "Парыгино": ["БСУ"],  
  "Цех брусчатки": ["Цех брусчатки"],
  "Цех ЖБИ": ["Цех ЖБИ"]
};

const hoursOptions = Array.from({ length: 17 }, (_, i) => i + 6);
const quantityOptions = Array.from({ length: 10 }, (_, i) => i + 1);

const App = () => {
  const [requests, setRequests] = useState([
    { date: "", startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "" }
  ]);

  // Состояния для модального окна и данных пользователя
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Функция для получения текущей даты в формате YYYY-MM-DD
  const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0"); // Месяцы начинаются с 0
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleChange = (index, field, value) => {
    const newRequests = [...requests];
    newRequests[index][field] = value;

    if (field === "objectCategory") newRequests[index].object = "";
    if (field === "object") newRequests[index].position = "";
    if (field === "category") newRequests[index].equipmentName = "";

    // Если изменяется время начала, сбрасываем время окончания, если оно меньше или равно
    if (field === "startTime" && newRequests[index].endTime <= value) {
      newRequests[index].endTime = "";
    }

    setRequests(newRequests);
  };  
    const isRequestComplete = (request) => {
      return Object.values(request).every(value => value !== "");
    };
  
    const addRequest = () => {
      if (!isRequestComplete(requests[requests.length - 1])) {
        alert("Пожалуйста, заполните все поля перед добавлением новой техники.");
        return;
      }
      setRequests([...requests, { date: "", startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "" }]);
    };
  
    const removeLastRequest = () => {
      if (requests.length > 1) {
        setRequests(requests.slice(0, -1));
      }
    };
  
    // При клике на кнопку «Отправить заявку» проверяем заполненность и открываем модальное окно
    const submitRequest = () => {
      for (let request of requests) {
        if (!isRequestComplete(request)) {
          alert("Пожалуйста, заполните все поля перед отправкой заявки.");
          return;
        }
      }
      setIsModalOpen(true);
    };
  
    // Обработка отправки данных из модального окна
    const handleModalSubmit = async (e) => {
      e.preventDefault();
  
      if (isSubmitting) return; // если запрос уже отправляется, не выполняем повторно
      if (!userFullName || !userPhone) {
        alert("Пожалуйста, заполните ФИО и номер телефона.");
        return;
      }
  
      setIsSubmitting(true); // блокируем кнопку до завершения отправки
  
      // Добавляем данные пользователя к каждой заявке
      const updatedRequests = requests.map(request => ({
        ...request,
        fullName: userFullName,
        phone: userPhone
      }));
  
      console.log("Отправляемые данные:", updatedRequests);
  
      try {
        await fetch("https://script.google.com/macros/s/AKfycbxf5vPbxx2RQM9g2DmuD2TZCAWXmiPxVLY3bEeIFTF2tJc7CLUR2YV-cv82mgNWKqTI/exec", {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedRequests),
        });
        alert("Заявка отправлена!");
        // Сброс состояния
        setRequests([{ date: "", startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "" }]);
        setUserFullName("");
        setUserPhone("");
        setIsModalOpen(false);
      } catch (error) {
        console.error("Ошибка при отправке:", error);
        alert("Ошибка при отправке заявки!");
      } finally {
        setIsSubmitting(false); // разблокируем кнопку, когда запрос завершится
      }
    };
  
    return (
      <div style={styles.container}>
        <h2>Заявка на технику</h2>
        {requests.map((request, index) => (
          <div key={index} style={styles.formBlock}>
            <label>Введите дату:</label>
            <input
              type="date"
              value={request.date}
              min={getCurrentDate()} // Устанавливаем минимальную дату как текущую
              onChange={e => handleChange(index, "date", e.target.value)}
            />
  
            <label>Укажите время начала работы:</label>
            <select
              value={request.startTime}
              onChange={e => handleChange(index, "startTime", e.target.value)}
            >
              <option value="">Выберите время</option>
              {hoursOptions.map(hour => (
                <option key={hour} value={hour}>{hour}:00</option>
              ))}
            </select>
  
            <label>Укажите время окончания работы:</label>
            <select
              value={request.endTime}
              onChange={e => handleChange(index, "endTime", e.target.value)}
              disabled={!request.startTime}
            >
              <option value="">Выберите время</option>
              {hoursOptions
                .filter(hour => hour > request.startTime) // Фильтруем часы, чтобы они были больше времени начала
                .map(hour => (
                  <option key={hour} value={hour}>{hour}:00</option>
                ))}
            </select>
  
            <label>Категория объекта:</label>
            <select 
              value={request.objectCategory} 
              onChange={e => handleChange(index, "objectCategory", e.target.value)}
            >
              <option value="">Выберите категорию объекта</option>
              {Object.keys(objectCategoryOptions).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
  
            <label>Объект:</label>
            <select 
              value={request.object} 
              onChange={e => handleChange(index, "object", e.target.value)}
              disabled={!request.objectCategory}
            >
              <option value="">Выберите объект</option>
              {objectCategoryOptions[request.objectCategory]?.map(obj => (
                <option key={obj} value={obj}>{obj}</option>
              ))}
            </select>
  
            <label>Позиция или строение:</label>
            <select
              value={request.position}
              onChange={e => handleChange(index, "position", e.target.value)}
              disabled={!request.object}
            >
              <option value="">Выберите позицию</option>
              {(objectPositionOptions[request.object] || []).map(pos => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
  
            <label>Выберите категорию техники:</label>
            <select
              value={request.category}
              onChange={e => handleChange(index, "category", e.target.value)}
            >
              <option value="">Выберите категорию</option>
              {Object.keys(categoryOptions).map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
  
            <label>Выберите наименование техники:</label>
            <select
              value={request.equipmentName}
              onChange={e => handleChange(index, "equipmentName", e.target.value)}
              disabled={!request.category}
            >
              <option value="">Выберите наименование</option>
              {(categoryOptions[request.category] || []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
  
            <label>Количество:</label>
            <select
              value={request.quantity}
              onChange={e => handleChange(index, "quantity", e.target.value)}
            >
              <option value="">Выберите количество</option>
              {quantityOptions.map(quantity => (
                <option key={quantity} value={quantity}>{quantity}</option>
              ))}
            </select>
          </div>
        ))}
  
        <button onClick={addRequest} style={styles.addButton}>Добавить технику</button>
        {requests.length > 1 && (
          <button onClick={removeLastRequest} style={styles.backButton}>Назад</button>
        )}
        <button onClick={submitRequest} style={styles.submitButton}>Отправить заявку</button>
  
        {/* Модальное окно для ввода ФИО и номера телефона */}
        {isModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <span style={styles.modalClose} onClick={() => setIsModalOpen(false)}>&times;</span>
              <h2>Ответственный</h2>
              <form onSubmit={handleModalSubmit}>
                <label>ФИО:</label>
                <input
                  type="text"
                  value={userFullName}
                  onChange={e => setUserFullName(e.target.value)}
                  required
                />
                <br />
                <label>Номер телефона:</label>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={e => setUserPhone(e.target.value)}
                  required
                />
                <br />
                <button 
                  type="submit" 
                  style={styles.submitButton}
                  disabled={isSubmitting}  // блокировка кнопки во время отправки
                >
                  {isSubmitting ? "Отправка..." : "Отправить заявку"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const styles = {
    container: {
      maxWidth: "600px",
      margin: "20px auto",
      padding: "20px",
      border: "1px solid #ddd",
      borderRadius: "10px",
      textAlign: "center"
    },
    formBlock: {
      marginBottom: "15px",
      padding: "10px",
      border: "1px solid #ccc",
      borderRadius: "5px",
      display: "flex",
      flexDirection: "column",
      gap: "5px",
      textAlign: "left"
    },
    addButton: {
      marginRight: "10px",
      padding: "10px",
      background: "#007bff",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer"
    },
    backButton: {
      marginRight: "10px",
      padding: "10px",
      background: "#dc3545",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer"
    },
    submitButton: {
      padding: "10px",
      background: "green",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer"
    },
    modalOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    modalContent: {
      background: "#fff",
      padding: "20px",
      borderRadius: "5px",
      position: "relative",
      width: "90%",
      maxWidth: "400px"
    },
    modalClose: {
      position: "absolute",
      top: "10px",
      right: "10px",
      cursor: "pointer",
      fontSize: "24px"
    }
  };
  
  export default App;