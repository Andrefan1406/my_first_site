import React, { useState, useEffect, useCallback } from "react";
import styles from './RequestPage.module.css';
import { useNavigate } from "react-router-dom";
import { objectCategoryOptions, objectPositionOptions } from "./data/constructionData";

const siteOptions = [
  "БЦ пр.Победы", "Благоустройство", "Брик Таун, Лицей", "Ветлаборатория",
  "Комфортная школа", "КОС", "Ледовый каток", "Нурлы Жол 3", "ОГЭ стройка", "ОГЭ коммерц.",
  "Развязка", "Разнорабочии", "Сан.тех.участок (внутр.)", "Сан.тех.участок (наруж.)", "Сантехники-подрядчики",
  "СПОРТ", "Уч.монтажа м/к", "Фасадчики", "Royal B"
];

const professionOptions = [
  "каменщики", "монолитчики", "отделочники",  
  "разнорабочие", "сантехники",  
  "фасадчики", "электрики", "прочие"
];

const PeopleReportPage = () => {
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const [requests, setRequests] = useState(() => {
    const saved = localStorage.getItem("peopleReportData");
    return saved ? JSON.parse(saved) : [{
      startTime: "", objectCategory: "", endTime: "", object: "",
      position: "", category: "", equipmentName: ""
    }];
  });
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getCurrentDate());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [invalidFields, setInvalidFields] = useState([]);
  const [dateError, setDateError] = useState("");

  const navigate = useNavigate();

  function getCurrentDate() {
    return new Date().toISOString().slice(0, 10);
  }

  const getTotalCount = () => {
    return requests.reduce((sum, row) => sum + (parseInt(row.equipmentName) || 0), 0);
  };

  const hasEmptyFields = useCallback(() => {
    const emptyFields = [];

    requests.forEach((row, index) => {
      for (const field of ["startTime", "objectCategory", "endTime", "object", "position", "category", "equipmentName"]) {
        if (!row[field]) {
          emptyFields.push({ index, field });
        }
      }
    });

    setInvalidFields(emptyFields);
    return emptyFields.length > 0;
  }, [requests]);

  useEffect(() => {
    localStorage.setItem("peopleReportData", JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    if (wasSubmitted) {
      hasEmptyFields();
    }
  }, [requests, wasSubmitted, hasEmptyFields]);

  useEffect(() => {
    const lastSubmittedDate = localStorage.getItem("lastPeopleReportSubmitDate");
    setIsAlreadySubmitted(lastSubmittedDate === selectedDate);
  }, [selectedDate]);

  const handleChange = (index, field, value) => {
    const newRequests = [...requests];
    newRequests[index][field] = value;

    if (field === "objectCategory") {
      newRequests[index].endTime = "";
      newRequests[index].object = "";
    }
    if (field === "endTime") {
      newRequests[index].object = "";
    }

    setRequests(newRequests);
  };

  const addRequest = (index) => {
    const newRequests = [...requests];
    newRequests.splice(index + 1, 0, {
      startTime: "", objectCategory: "", endTime: "", object: "",
      position: "", category: "", equipmentName: ""
    });
    setRequests(newRequests);
  };

  const removeRequest = (index) => {
    const newRequests = [...requests];
    newRequests.splice(index, 1);
    setRequests(newRequests);
  };

  const isInvalid = (index, field) =>
    wasSubmitted && invalidFields.some(f => f.index === index && f.field === field);

  const handleSubmit = () => {
    setWasSubmitted(true);
    if (hasEmptyFields()) {
      alert("Пожалуйста, заполните все поля перед отправкой отчёта.");
      return;
    }
    setShowModal(true);
  };

  const confirmSubmit = async () => {
    if (!userName.trim() || !userPhone.trim()) {
      alert("Пожалуйста, введите ФИО и номер телефона.");
      return;
    }

    const lastSubmittedDate = localStorage.getItem("lastPeopleReportSubmitDate");
    if (lastSubmittedDate === selectedDate) {
      alert("Вы уже отправляли отчёт на эту дату. Повторная отправка запрещена.");
      return;
    }

    setIsSubmitting(true);
    setShowModal(false);

    const updatedRequests = requests.map(r => ({
      ...r,
      date: selectedDate,
      submittedBy: userName,
      phone: userPhone
    }));

    try {
      await fetch("https://script.google.com/macros/s/AKfycbwuh3ksOR53O039FnsoYsgAfPjhgUAQbbX-EG1mUgmqQXubFwgmDZf0tCBNz23rVomA/exec", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRequests)
      });

      localStorage.setItem("lastPeopleReportSubmitDate", selectedDate);
      setIsAlreadySubmitted(true);
      alert("Отчёт успешно отправлен!");
    } catch (e) {
      console.error("Ошибка при отправке", e);
      alert("Ошибка при отправке!");
    } finally {
      setIsSubmitting(false);
      setUserName("");
      setUserPhone("");
    }
  };

  return (
    <div className={styles.container}>
      <h2>Ежедневный отчёт по людям</h2>
      <label>Дата:
        <input
          type="date"
          value={selectedDate}
          min="2025-01-01"
          max={getCurrentDate()}
          onChange={(e) => {
            const inputDate = e.target.value;
            const today = getCurrentDate();
            if (inputDate > today) {
              setDateError("Нельзя выбрать дату из будущего.");
              setSelectedDate(today);
            } else {
              setDateError("");
              setSelectedDate(inputDate);
            }
          }}
        />
      </label>

      {dateError && <div className={styles.errorText}>{dateError}</div>}

      <table className={styles.requestTable}>
        <thead>
          <tr>
            <th>Участок</th><th>Категория объекта</th><th>Объект</th>
            <th>Позиция</th><th>Наименование работ/подрядчика</th><th>Профессия</th>
            <th>Количество</th><th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((row, index) => (
            <tr key={index}>
              <td>
                <select
                  value={row.startTime}
                  onChange={e => handleChange(index, "startTime", e.target.value)}
                  className={isInvalid(index, "startTime") ? styles.invalidField : ""}
                >
                  <option value="">Выберите</option>
                  {siteOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
              <td>
                <select
                  value={row.objectCategory}
                  onChange={e => handleChange(index, "objectCategory", e.target.value)}
                  className={isInvalid(index, "objectCategory") ? styles.invalidField : ""}
                >
                  <option value="">Выберите</option>
                  {Object.keys(objectCategoryOptions).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </td>
              <td>
                <select
                  value={row.endTime}
                  onChange={e => handleChange(index, "endTime", e.target.value)}
                  disabled={!row.objectCategory}
                  className={isInvalid(index, "endTime") ? styles.invalidField : ""}
                >
                  <option value="">Выберите</option>
                  {(objectCategoryOptions[row.objectCategory] || []).map(obj => <option key={obj} value={obj}>{obj}</option>)}
                </select>
              </td>
              <td>
                <select
                  value={row.object}
                  onChange={e => handleChange(index, "object", e.target.value)}
                  disabled={!row.endTime}
                  className={isInvalid(index, "object") ? styles.invalidField : ""}
                >
                  <option value="">Выберите</option>
                  {(objectPositionOptions[row.endTime] || []).map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </td>
              <td>
                <input
                  value={row.position}
                  onChange={e => handleChange(index, "position", e.target.value)}
                  className={isInvalid(index, "position") ? styles.invalidField : ""}
                />
              </td>
              <td>
                <select
                  value={row.category}
                  onChange={e => handleChange(index, "category", e.target.value)}
                  className={isInvalid(index, "category") ? styles.invalidField : ""}
                >
                  <option value="">Выберите</option>
                  {professionOptions.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.equipmentName}
                  onChange={e => /^\d*$/.test(e.target.value) && handleChange(index, "equipmentName", e.target.value)}
                  className={isInvalid(index, "equipmentName") ? styles.invalidField : ""}
                />
              </td>
              <td>
                <button className={`${styles.iconButton} ${styles.green}`} onClick={() => addRequest(index)}>＋</button>
                {requests.length > 1 && <button className={`${styles.iconButton} ${styles.red}`} onClick={() => removeRequest(index)}>−</button>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan="6" style={{ textAlign: 'right', fontWeight: 'bold' }}>Итого:</td>
            <td style={{ fontWeight: 'bold' }}>{getTotalCount()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.buttonsContainer}>
        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={isSubmitting || isAlreadySubmitted}
        >
          {isAlreadySubmitted
            ? "Отчёт уже отправлен"
            : isSubmitting
            ? "Отправка..."
            : "Отправить отчёт"}
        </button>
        <button className={styles.backButton} onClick={() => navigate("/")}>← Назад</button>
        <button
          className={styles.removeButton}
          onClick={() => setRequests([{
            startTime: "", objectCategory: "", endTime: "", object: "",
            position: "", category: "", equipmentName: ""
          }])}
        >
          Очистить
        </button>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Введите ФИО и номер телефона</h3>
            <input type="text" placeholder="ФИО" value={userName} onChange={e => setUserName(e.target.value)} />
            <input type="tel" placeholder="Телефон" value={userPhone} onChange={e => setUserPhone(e.target.value)} />
            <div className={styles.modalButtons}>
              <button onClick={confirmSubmit}>Подтвердить</button>
              <button onClick={() => setShowModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeopleReportPage;
