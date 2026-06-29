import React, { useState, useEffect } from 'react';
import styles from './RequestPage.module.css';
import { getAuth } from 'firebase/auth';
import { objectCategoryOptions, objectPositionOptions } from './data/constructionData';

const workCategoryOptions = [
  'Подключение',
  'Отключение',
  'Монтаж',
  'Демонтаж',
  'Прогрев бетона',
  'Мелкосрочный ремонт',
  'Обход и осмотр оборудования',
  'Проверка',
  'Другое',
];

// Скрипт Google Apps Script для записи в таблицу
const SCRIPT_URL = process.env.REACT_APP_ELEC_SCRIPT_URL || '';

// ─── Вспомогательные ────────────────────────────────────────────────────────

const getCurrentDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const hoursOptions = Array.from({ length: 17 }, (_, i) => i + 6); // 6..22

const emptyRow = () => ({
  objectCategory: '', object: '', position: '',
  workCategory: '', workDescription: '', startTime: '',
});

// ─── Компонент ───────────────────────────────────────────────────────────────

const ElectricansRequestPage = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getCurrentDate());
  const [rows, setRows] = useState([emptyRow()]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPosition, setUserPosition] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const positionOptions = ['Начальник участка', 'Производитель работ', 'Мастер'];

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth <= 768 && window.matchMedia('(orientation: portrait)').matches);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  const handleDateChange = (e) => {
    if (e.target.value < getCurrentDate()) { alert('Нельзя выбрать дату меньше текущей!'); return; }
    setSelectedDate(e.target.value);
  };

  const handleChange = (index, field, value) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'objectCategory') { next[index].object = ''; next[index].position = ''; }
      if (field === 'object')         { next[index].position = ''; }
      return next;
    });
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const isRowComplete = (row) =>
    row.objectCategory && row.object && row.workCategory;

  const handleSubmitClick = () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) { alert('Пожалуйста, войдите в систему.'); return; }
    if (rows.some(r => !isRowComplete(r))) {
      alert('Заполните обязательные поля: Категория объекта, Объект, Категория работ.');
      return;
    }
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!userFullName || !userPhone || !userPosition) {
      alert('Пожалуйста, заполните ФИО, должность и номер телефона.');
      return;
    }
    setIsSubmitting(true);

    const payload = rows.map(row => ({
      date: selectedDate,
      startTime: row.startTime ? `${row.startTime}:00` : '',
      objectCategory: row.objectCategory,
      object: row.object,
      position: row.position,
      workCategory: row.workCategory,
      workDescription: row.workDescription,
      fullName: `${userFullName} - ${userPosition}`,
      phone: userPhone,
    }));

    try {
      if (SCRIPT_URL) {
        await fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      alert('Заявка отправлена!');
      setRows([emptyRow()]);
      setUserFullName(''); setUserPhone(''); setUserPosition('');
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Ошибка при отправке заявки!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    if (window.confirm('Очистить все строки?')) setRows([emptyRow()]);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <h2>Заявка электриков</h2>
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
        /* ── Мобильная версия ─────────────────────────────────────────── */
        rows.map((row, i) => (
          <div key={i} className={styles.formBlock}>
            <label>Категория объекта *</label>
            <select value={row.objectCategory} onChange={e => handleChange(i, 'objectCategory', e.target.value)}>
              <option value="">Выберите категорию</option>
              {Object.keys(objectCategoryOptions).map(c => <option key={c}>{c}</option>)}
            </select>

            <label>Объект *</label>
            <select value={row.object} onChange={e => handleChange(i, 'object', e.target.value)} disabled={!row.objectCategory}>
              <option value="">Выберите объект</option>
              {(objectCategoryOptions[row.objectCategory] || []).map(o => <option key={o}>{o}</option>)}
            </select>

            <label>Позиция / строение</label>
            <select value={row.position} onChange={e => handleChange(i, 'position', e.target.value)} disabled={!row.object}>
              <option value="">Выберите позицию</option>
              {(objectPositionOptions[row.object] || []).map(p => <option key={p}>{p}</option>)}
            </select>

            <label>Время начала</label>
            <select value={row.startTime} onChange={e => handleChange(i, 'startTime', e.target.value)}>
              <option value="">—</option>
              {hoursOptions.map(h => <option key={h} value={h}>{h}:00</option>)}
            </select>

            <label>Категория работ *</label>
            <select value={row.workCategory} onChange={e => handleChange(i, 'workCategory', e.target.value)}>
              <option value="">Выберите категорию</option>
              {workCategoryOptions.map(c => <option key={c}>{c}</option>)}
            </select>

            <label>Описание работ</label>
            <textarea
              value={row.workDescription}
              onChange={e => handleChange(i, 'workDescription', e.target.value)}
              placeholder="Укажите детали работ..."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />

            {rows.length > 1 && (
              <button className={styles.removeButton} style={{ width: 'auto' }} onClick={() => removeRow(i)}>Удалить строку</button>
            )}
          </div>
        ))
      ) : (
        /* ── Десктоп: таблица ─────────────────────────────────────────── */
        <div className={styles.tableContainer}>
          <table className={styles.requestTable}>
            <thead>
              <tr>
                <th>Категория объекта</th>
                <th>Объект</th>
                <th>Позиция</th>
                <th>Время начала</th>
                <th>Категория работ</th>
                <th>Описание работ</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <select value={row.objectCategory} onChange={e => handleChange(i, 'objectCategory', e.target.value)}>
                        <option value="">Выберите</option>
                        {Object.keys(objectCategoryOptions).map(c => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.object} onChange={e => handleChange(i, 'object', e.target.value)} disabled={!row.objectCategory}>
                        <option value="">Выберите</option>
                        {(objectCategoryOptions[row.objectCategory] || []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.position} onChange={e => handleChange(i, 'position', e.target.value)} disabled={!row.object}>
                        <option value="">—</option>
                        {(objectPositionOptions[row.object] || []).map(p => <option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.startTime} onChange={e => handleChange(i, 'startTime', e.target.value)}>
                        <option value="">—</option>
                        {hoursOptions.map(h => <option key={h} value={h}>{h}:00</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.workCategory} onChange={e => handleChange(i, 'workCategory', e.target.value)}>
                        <option value="">Выберите</option>
                        {workCategoryOptions.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      <textarea
                        value={row.workDescription}
                        onChange={e => handleChange(i, 'workDescription', e.target.value)}
                        placeholder="Укажите детали..."
                        rows={2}
                        style={{ width: '100%', minWidth: 160, boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </td>
                    <td>
                      {rows.length > 1 && (
                        <button className={styles.removeButton} onClick={() => removeRow(i)}>✕</button>
                      )}
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Кнопки действий ─────────────────────────────────────────────── */}
      <div className={styles.buttonsContainer}>
        <button className={styles.addButton} onClick={addRow}>Добавить строку</button>
        <button className={styles.submitButton} onClick={handleSubmitClick}>Отправить заявку</button>
        <button className={styles.removeButton} style={{ width: 'auto', marginTop: 0 }} onClick={handleClear}>Очистить заявку</button>
      </div>

      {/* ── Модальное окно: данные заявителя ────────────────────────────── */}
      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <button className={styles.modalClose} onClick={() => setIsModalOpen(false)}>✕</button>
            <h3>Данные заявителя</h3>
            <form onSubmit={handleModalSubmit}>
              <label>ФИО</label>
              <input
                type="text"
                value={userFullName}
                onChange={e => setUserFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                required
              />
              <label>Должность</label>
              <select value={userPosition} onChange={e => setUserPosition(e.target.value)} required
                style={{ padding: '8px', marginTop: '5px', border: '1px solid #ddd', borderRadius: '4px' }}>
                <option value="">Выберите должность</option>
                {positionOptions.map(p => <option key={p}>{p}</option>)}
              </select>
              <label>Телефон</label>
              <input
                type="tel"
                value={userPhone}
                onChange={e => setUserPhone(e.target.value)}
                placeholder="+7 (XXX) XXX-XX-XX"
                required
              />
              <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                {isSubmitting ? 'Отправка...' : 'Отправить заявку'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ElectricansRequestPage;
