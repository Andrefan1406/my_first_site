import React, { useState, useEffect } from "react";
import styles from './RequestPage.module.css';
import { objectCategoryOptions, objectPositionOptions } from "./data/constructionData";

// Списки категорий техники, объектов, позиций
const categoryOptions = {
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
  "Экскаваторы-Погрузчики": ["Экскаватор-Погрузчик (с ковшом)", "Экскаватор-Погрузчик (с гидромолотом)", "Экскаватор-Погрузчик (с буроямом)"]
};


const hoursOptions = Array.from({ length: 17 }, (_, i) => i + 6);
const quantityOptions = Array.from({ length: 10 }, (_, i) => i + 1);

const RequestPage = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [requests, setRequests] = useState([
    { startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "", note: "" }
  ]);

  // Проверяем размер экрана при загрузке и при изменении размера
  useEffect(() => {
    const checkIfMobile = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isNarrow = window.innerWidth <= 768;
  
      // В вертикальном режиме при узкой ширине — мобильная версия
      // В горизонтальном — десктопная, даже если ширина небольшая
      setIsMobile(isNarrow && isPortrait);
    };
  
    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);
    window.addEventListener("orientationchange", checkIfMobile); // для надёжности
  
    return () => {
      window.removeEventListener("resize", checkIfMobile);
      window.removeEventListener("orientationchange", checkIfMobile);
    };
  }, []);  

  // Загрузка заявки из localStorage
  useEffect(() => {
    const savedRequests = localStorage.getItem("lastRequestData");
    if (savedRequests) {
      try {
        const parsed = JSON.parse(savedRequests);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed.map(({ date, fullName, phone, ...rest }) => rest);
          setRequests(restored);
        }
      } catch (err) {
        console.error("Ошибка при загрузке сохранённой заявки:", err);
      }
    }
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [confirmedResend, setConfirmedResend] = useState(false);


  const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(getCurrentDate());
  
  const handleDateChange = (e) => {
    const newDate = e.target.value;
    if (newDate < getCurrentDate()) {
      alert("Нельзя выбрать дату меньше текущей!");
      return;
    }
    setSelectedDate(newDate);
  }

  const handleChange = (index, field, value) => {
    const newRequests = [...requests];
    newRequests[index][field] = value;

    if (field === "objectCategory") newRequests[index].object = "";
    if (field === "object") newRequests[index].position = "";
    if (field === "category") newRequests[index].equipmentName = "";

    if (field === "startTime" && newRequests[index].endTime <= value) {
      newRequests[index].endTime = "";
    }

    setRequests(newRequests);
  };  
  
  const isRequestComplete = (request) => {
    return Object.entries(request).every(([key, value]) => key === "note" || value !== "");
  };

  const addRequest = () => {
    if (!isRequestComplete(requests[requests.length - 1])) {
      alert("Пожалуйста, заполните все поля перед добавлением новой техники.");
      return;
    }
    setRequests([...requests, { startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "", note: "" }]);
  };

  const removeRequest = (index) => {
    if (requests.length > 1) {
      const newRequests = [...requests];
      newRequests.splice(index, 1);
      setRequests(newRequests);
    }
  };

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
    const lastDate = localStorage.getItem("lastRequestDate");
    if (lastDate === selectedDate) {
      if (lastDate === selectedDate && !confirmedResend) {
        setIsWarningModalOpen(true);
        return;
      }
    }
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (!userFullName || !userPhone) {
      alert("Пожалуйста, заполните ФИО и номер телефона.");
      return;
    }

    setIsSubmitting(true);

    const updatedRequests = requests.map(request => ({
      ...request,
      date: selectedDate,
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
      localStorage.setItem("lastRequestData", JSON.stringify(updatedRequests));
      localStorage.setItem("lastRequestDate", selectedDate);
      alert("Заявка отправлена!");
      setRequests([{ startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "", note: "" }]);
      setSelectedDate(getCurrentDate());
      setUserFullName("");
      setUserPhone("");
      setIsModalOpen(false);
      window.location.href = "https://docs.google.com/spreadsheets/d/1nd1AxUUgxLcd6GYlnY5ZJZ0WYr-qmvrP67CGe1Ut4i8/edit?pli=1&gid=0#gid=0";
    } catch (error) {
      console.error("Ошибка при отправке:", error);
      alert("Ошибка при отправке заявки!");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <h2>Заявка на технику</h2>
        <div className={styles.dateBlock}>
          <label htmlFor="dateInput">Дата:</label>
          <input
            id="dateInput"
            type="date"
            value={selectedDate}
            min={getCurrentDate()}
            onChange={handleDateChange}
          />
        </div>
      </div>

      {isMobile ? (
        // Мобильная версия - вертикальное отображение
        requests.map((request, index) => (
          <div key={index} className={styles.formBlock}>
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
                .filter(hour => hour > request.startTime)
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
            
            <label>Примечание (необязательно):</label>
            <textarea 
              value={request.note} 
              onChange={e => handleChange(index, "note", e.target.value)} 
              placeholder="Введите примечание..." 
            />

            {requests.length > 1 && (
              <button 
                onClick={() => removeRequest(index)}
                className={styles.removeButton}
              >
                Удалить эту технику
              </button>
            )}
          </div>
        ))
      ) : (
        // Десктопная версия - табличное отображение
        <div className={styles.tableContainer}>
          <table className={styles.requestTable}>
            <thead>
              <tr>
                <th>Время начала</th>
                <th>Время окончания</th>
                <th>Категория объекта</th>
                <th>Объект</th>
                <th>Позиция</th>
                <th>Категория техники</th>
                <th>Наименование техники</th>
                <th>Количество</th>
                <th>Примечание</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request, index) => (
                <tr key={index}>
                  <td>
                    <select
                      value={request.startTime}
                      onChange={e => handleChange(index, "startTime", e.target.value)}
                    >
                      <option value="">Выберите</option>
                      {hoursOptions.map(hour => (
                        <option key={hour} value={hour}>{hour}:00</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={request.endTime}
                      onChange={e => handleChange(index, "endTime", e.target.value)}
                      disabled={!request.startTime}
                    >
                      <option value="">Выберите</option>
                      {hoursOptions
                        .filter(hour => hour > request.startTime)
                        .map(hour => (
                          <option key={hour} value={hour}>{hour}:00</option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <select 
                      value={request.objectCategory} 
                      onChange={e => handleChange(index, "objectCategory", e.target.value)}
                    >
                      <option value="">Выберите</option>
                      {Object.keys(objectCategoryOptions).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select 
                      value={request.object} 
                      onChange={e => handleChange(index, "object", e.target.value)}
                      disabled={!request.objectCategory}
                    >
                      <option value="">Выберите</option>
                      {objectCategoryOptions[request.objectCategory]?.map(obj => (
                        <option key={obj} value={obj}>{obj}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={request.position}
                      onChange={e => handleChange(index, "position", e.target.value)}
                      disabled={!request.object}
                    >
                      <option value="">Выберите</option>
                      {(objectPositionOptions[request.object] || []).map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={request.category}
                      onChange={e => handleChange(index, "category", e.target.value)}
                    >
                      <option value="">Выберите</option>
                      {Object.keys(categoryOptions).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={request.equipmentName}
                      onChange={e => handleChange(index, "equipmentName", e.target.value)}
                      disabled={!request.category}
                    >
                      <option value="">Выберите</option>
                      {(categoryOptions[request.category] || []).map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={request.quantity}
                      onChange={e => handleChange(index, "quantity", e.target.value)}
                    >
                      <option value="">Выберите</option>
                      {quantityOptions.map(quantity => (
                        <option key={quantity} value={quantity}>{quantity}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <textarea 
                      value={request.note} 
                      onChange={e => handleChange(index, "note", e.target.value)} 
                      placeholder="Примечание"
                      rows={2} // Количество строк
                      className={styles.tableTextarea}
                      style={{
                        minHeight: '40px',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}
                    />
                  </td>
                  <td>
                    {requests.length > 1 && (
                      <button 
                        onClick={() => removeRequest(index)}
                        className={styles.removeButton}
                      >
                        Удалить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.buttonsContainer}>
        <button onClick={addRequest} className={styles.addButton}>
          {isMobile ? "Добавить технику" : "Добавить строку"}
        </button>
        <button onClick={submitRequest} className={styles.submitButton}>Отправить заявку</button>
        <button 
          onClick={() => {
            localStorage.removeItem("lastRequestData");
            setRequests([{ 
              startTime: "", endTime: "", objectCategory: "", object: "", 
              position: "", category: "", equipmentName: "", quantity: "", note: "" 
            }]);
          }} 
          className={styles.removeButton}
        >
          Очистить заявку
        </button>
      </div>

      {/* Модальное окно остается без изменений */}
      {isWarningModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <span className={styles.modalClose} onClick={() => setIsWarningModalOpen(false)}>&times;</span>
            <h2>Заявка уже отправлена</h2>
            <p>На эту дату вы уже отправляли заявку. Вы уверены, что хотите отправить ещё одну?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                className={styles.removeButton}
                onClick={() => setIsWarningModalOpen(false)}
              >
                Отмена
              </button>
              <button
                className={styles.submitButton}
                onClick={() => {
                  setIsWarningModalOpen(false);
                  setConfirmedResend(true);
                  setIsModalOpen(true); // показываем основную форму с ФИО и телефоном
                }}
              >
                Отправить ещё одну
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <span className={styles.modalClose} onClick={() => setIsModalOpen(false)}>&times;</span>
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
                className={styles.submitButton}
                disabled={isSubmitting}
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

export default RequestPage;