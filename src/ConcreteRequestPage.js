import React, { useState } from 'react';

// Списки объектов и позиций
const objectCategoryOptions = {
  "Строительство жилых домов": ["Брик таун", "НЖ 3", "СПОРТ 2", "Элитка"],
  "Строительство и ремонт дорог": ["Дороги НЖ 4,5", "Дорога Шале ла Бале", "Развязка"],
  "Строительство и реконструкция коммерческих, частных и туристических объектов": ["Горная Ульбинка", "Зимовьё", "Коммерческие объекты",
     "Коммерческие помещения в жилых домах", "Мелада", "Нуртау", "Орлан", "Урунтаева 12/1", "Черемушки"],
  "Строительство сетей и благоустройство": ["Сети и благоустройство", "Благоустройство", "Инженерные сети"],
  "Строительство объектов инфраструктуры (кроме жилых домов)": ["Бизнес центр пр.Победы", "Ветлаборатория", "Резиденция", "Учебные заведения", "Хилтон"],
  "Строительство производственных объектов": ["База Самарское", "База Эскор", "БРУ", "Кирзавод", "КОС", "Новоявленка", "Парыгино", "Цех брусчатки", "Цех ЖБИ"]
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
  "Инженерные сети": ["Коллектор", "Сети ОВ ВК НЖ 3", "Сети ОВ ВК НЖ 4,5", "Сети ОВ ВК СПОРТ 2", "Сети Эл НЖ 4,5"],
  "Бизнес центр пр.Победы": ["Бизнес центр пр.Победы"],
  "Ветлаборатория": ["Ветлаборатория"],
  "Резиденция": ["Резиденция"],
  "Учебные заведения": [ "Дет.сад НЖ", "Комфортная школа", "Ледовый каток", "Лицей"],
  "Хилтон": ["Хилтон"],
  "База Самарское": ["База Самарское"],
  "База Эскор": ["База Эскор"],
  "БРУ": ["БРУ"],
  "Кирзавод": ["Кирзавод"],
  "КОС": ["КОС"],
  "Новоявленка": ["Комбинат ПГС"],
  "Парыгино": ["БСУ"],  
  "Цех брусчатки": ["Цех брусчатки"],
  "Цех ЖБИ": ["Цех ЖБИ"]
};

const quantityOptions = Array.from({ length: 10 }, (_, i) => i + 1);

const ConcreteRequestPage = () => {
  const [requests, setRequests] = useState([
    { deliveryTime: "", material: "", materialClass: "", objectCategory: "", object: "", position: "", quantity: "", note: "" } // поля заявки
  ]);

  // Состояния для даты, модального окна и данных пользователя
  const [selectedDate, setSelectedDate] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Списки классов и марок для бетона и раствора
  const concreteClasses = [
    "В 7,5", "В 12,5", "В 15", "В 20", "В 22,5", "В 25", "В 30",
    "В 7,5 СС", "В 12,5 СС", "В 15 СС", "В 20 СС", "В 22,5 СС", "В 25 СС", "В 30 СС",
    "B 40 F 300", "Пескобетон М100", "Пескобетон М150", "Пескобетон М200", "Пескобетон М250", "Пескобетон М350", "Пескобетон М400"
  ];

  const mortarClasses = ["М 50", "М 75", "М 100"];

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

    if (field === "material") newRequests[index].materialClass = ""; // Сброс класса при смене материала
    if (field === "objectCategory") newRequests[index].object = "";
    if (field === "object") newRequests[index].position = "";

    setRequests(newRequests);
  };  
  
  const isRequestComplete = (request) => {
    return Object.entries(request).every(([key, value]) => key === "note" || value !== "");
  };

  const addRequest = () => {
    if (!isRequestComplete(requests[requests.length - 1])) {
      alert("Пожалуйста, заполните все поля перед добавлением новой заявки.");
      return;
    }
    setRequests([...requests, { deliveryTime: "", material: "", materialClass: "", objectCategory: "", object: "", position: "", quantity: "", note: "" }]);
  };

  const removeLastRequest = () => {
    if (requests.length > 1) {
      setRequests(requests.slice(0, -1));
    }
  };

  // При клике на кнопку «Отправить заявку» проверяем заполненность и открываем модальное окно
  const submitRequest = () => {
    if (!selectedDate) {
      alert("Пожалуйста, выберите дату.");
      return;
    }

    for (let request of requests) {
      if (!isRequestComplete(request)) {
        alert("Пожалуйста, заполните все обязательные поля.");
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

    // Добавляем данные пользователя и дату к каждой заявке
    const updatedRequests = requests.map(request => ({
      ...request,
      date: selectedDate, // добавляем выбранную дату
      fullName: userFullName,
      phone: userPhone
    }));

    console.log("Отправляемые данные:", updatedRequests);

    try {
      await fetch("https://script.google.com/macros/s/AKfycbyyXRi_lPGYJZI-C1uHmqRhlIOtKQtkrFW7-ha772JZbMxP3oXwcsH5QvHAprH-4fnL/exec", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRequests),
      });
      alert("Заявка отправлена!");
      // Сброс состояния
      setRequests([{ deliveryTime: "", material: "", materialClass: "", objectCategory: "", object: "", position: "", quantity: "", note: "" }]);
      setSelectedDate("");
      setUserFullName("");
      setUserPhone("");
      setIsModalOpen(false);
      // Перенаправление на Google Таблицу
      window.location.href = "https://docs.google.com/spreadsheets/d/1nd1AxUUgxLcd6GYlnY5ZJZ0WYr-qmvrP67CGe1Ut4i8/edit?pli=1&gid=0#gid=0";
    } catch (error) {
      console.error("Ошибка при отправке:", error);
      alert("Ошибка при отправке заявки!");
    } finally {
      setIsSubmitting(false); // разблокируем кнопку, когда запрос завершится
    }
  };

    return (
        <div style={styles.container}>
          <h2>Заявка на бетон и раствор</h2>
          <label>Введите дату:</label>
          <input
            type="date"
            value={selectedDate}
            min={getCurrentDate()} // Устанавливаем минимальную дату как текущую
            onChange={e => setSelectedDate(e.target.value)}
          />
    
          {requests.map((request, index) => (
            <div key={index} style={styles.formBlock}>
              <label>Время доставки:</label>
              <input
                type="time"
                value={request.deliveryTime}
                onChange={e => handleChange(index, "deliveryTime", e.target.value)}
                step="600" // Шаг в 10 минут (600 секунд)
                style={styles.timeInput}
              />
    
              <label>Материал:</label>
              <select
                value={request.material}
                onChange={e => handleChange(index, "material", e.target.value)}
              >
                <option value="">Выберите материал</option>
                <option value="Бетон">Бетон</option>
                <option value="Раствор">Раствор</option>
              </select>

              {/* Поле выбора класса или марки материала */}
          {request.material && (
            <><label>Класс/Марка:</label><select
                          value={request.materialClass}
                          onChange={e => handleChange(index, "materialClass", e.target.value)}
                      >
                          <option value="">Выберите класс/марку</option>
                          {request.material === "Бетон"
                              ? concreteClasses.map((concreteClass) => (
                                  <option key={concreteClass} value={concreteClass}>
                                      {concreteClass}
                                  </option>
                              ))
                              : mortarClasses.map((mortarClass) => (
                                  <option key={mortarClass} value={mortarClass}>
                                      {mortarClass}
                                  </option>
                              ))}
                      </select></>
          )}
              
                  
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
          <label>Примечание (необязательно):</label>
          <textarea value={request.note} onChange={e => handleChange(index, "note", e.target.value)} placeholder="Введите примечание..." />
        </div>
      ))}

      <button onClick={addRequest} style={styles.addButton}>Добавить заявку</button>
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
  timeInput: {
    padding: "8px",
    fontSize: "16px",
    borderRadius: "5px",
    border: "1px solid #ccc",
    width: "100%"
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

export default ConcreteRequestPage;