import React, { useState, useEffect } from 'react';
import styles from './RequestPage.module.css';
import { getAuth } from 'firebase/auth';

// ─── Справочники ────────────────────────────────────────────────────────────

const buildingTypeOptions = [
  'Здания',
  'Благоустройство',
  'Инженерные сети',
  'Коммерческие объекты',
  'Производственные объекты',
  'Штаб №1',
];

const objectOptions = {
  'Здания': [
    'Brick Town', 'Brick Town 2', 'Ветеринарная лаборатория', 'Есенберлина 6/2',
    'Комфортная школа', 'Ледовый каток', 'Лицей', 'НЖ 4,5', 'Нурлы Жол 3',
    'Орлёнок', 'Поз 107', 'СПОРТ', 'Транспортная развязка', 'Штаб №1',
    'Экополис', 'Энтузиастов 7Б', 'Другой',
  ],
  'Коммерческие объекты': [
    'ROYAL B', 'Автомойка', 'Автомойка (Нурлы Жол)', 'Аптека',
    'Б.О Мелада', 'Б/О Мелада', 'Б/О Орлан', 'Базовая 2/4 кофейня',
    'Ветеринарная лаборатория', 'Иртыш Сити', 'Каменный карьер',
    'Кренделия', 'Магазин', 'Орлёнок', 'Сатпаева 55 А', 'Энтузиастов 7Б', 'Другой',
  ],
  'Производственные объекты': [
    'База Эскор', 'Есенберлина 6/2', 'ЖБИ', 'КОС',
    'Магазин автозапчастей (Эскор)', 'Нурлы Жол 3', 'Центральная база (Сам.ш.29)', 'Другой',
  ],
  'Инженерные сети': [
    'Инженерные сети Брик Таун',
    'Инженерные сети Школа (Нурлы Жол)',
    'Инженерные сети Комфортная школа (Самрук)',
    'Квартальные инженерные сети (Нурлы Жол 1-2)',
    'Квартальные инженерные сети (Нурлы Жол 3)',
    'Квартальные инженерные сети (Спорт)',
    'Нурлы Жол 3', 'Транспортная развязка',
    'УТ 14, УТ 15, УТ 16, УТ 10 поз.69,65,63', 'Другой',
  ],
  'Благоустройство': [
    'Благоустройство Brick Town',
    'Благоустройство Нурлы Жол 1,2',
    'Благоустройство Нурлы Жол 3',
    'Благоустройство Комфортная школа (Самрук)',
    'Благоустройство Школа (Нурлы Жол)',
    'Благоустройство 12-16 этажки',
    'Транспортная развязка', 'Другой',
  ],
  'Штаб №1': ['Штаб №1'],
};

// Блоки — для объектов, у которых есть корпусная структура
const blocksForObject = {
  'Brick Town':   ['Блок 1','Блок 2','Блок 3','Блок 4','Блок 5','Блок 6','Блок 7','Блок 8','Блок 8/1','Блок 9','Блок 9/1','Блок 10','Блок 11','Блок 11/1','Блок 12','Блок 13','Блок 14'],
  'Brick Town 2': ['Блок 1','Блок 2','Блок 3','Блок 4','Блок 5','Блок 6'],
};

// Позиции — для НЖ 3
const positionsForObject = {
  'Нурлы Жол 3': ['поз.56','поз.57','поз.58','поз.59','поз.60','поз.63','поз.64','поз.65','поз.69','поз.72'],
  'СПОРТ':       ['поз.73-75','поз.74','поз.76','поз.91','поз.92','поз.93','поз.100','поз.101'],
};

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
  buildingType: '', object: '', block: '', position: '',
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
      if (field === 'buildingType') { next[index].object = ''; next[index].block = ''; next[index].position = ''; }
      if (field === 'object')       { next[index].block = ''; next[index].position = ''; }
      return next;
    });
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const isRowComplete = (row) =>
    row.buildingType && row.object && row.workCategory;

  const handleSubmitClick = () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) { alert('Пожалуйста, войдите в систему.'); return; }
    if (rows.some(r => !isRowComplete(r))) {
      alert('Заполните обязательные поля: Тип строительства, Объект, Категория работ.');
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
      buildingType: row.buildingType,
      object: row.object,
      block: row.block,
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
            <label>Тип строительства *</label>
            <select value={row.buildingType} onChange={e => handleChange(i, 'buildingType', e.target.value)}>
              <option value="">Выберите тип</option>
              {buildingTypeOptions.map(t => <option key={t}>{t}</option>)}
            </select>

            <label>Объект *</label>
            <select value={row.object} onChange={e => handleChange(i, 'object', e.target.value)} disabled={!row.buildingType}>
              <option value="">Выберите объект</option>
              {(objectOptions[row.buildingType] || []).map(o => <option key={o}>{o}</option>)}
            </select>

            {blocksForObject[row.object] && (
              <>
                <label>Блок</label>
                <select value={row.block} onChange={e => handleChange(i, 'block', e.target.value)}>
                  <option value="">Выберите блок</option>
                  {blocksForObject[row.object].map(b => <option key={b}>{b}</option>)}
                </select>
              </>
            )}

            {positionsForObject[row.object] && (
              <>
                <label>Позиция</label>
                <select value={row.position} onChange={e => handleChange(i, 'position', e.target.value)}>
                  <option value="">Выберите позицию</option>
                  {positionsForObject[row.object].map(p => <option key={p}>{p}</option>)}
                </select>
              </>
            )}

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
                <th>Тип строительства</th>
                <th>Объект</th>
                <th>Блок</th>
                <th>Позиция</th>
                <th>Время начала</th>
                <th>Категория работ</th>
                <th>Описание работ</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const blocks    = blocksForObject[row.object];
                const positions = positionsForObject[row.object];
                return (
                  <tr key={i}>
                    <td>
                      <select value={row.buildingType} onChange={e => handleChange(i, 'buildingType', e.target.value)}>
                        <option value="">Выберите</option>
                        {buildingTypeOptions.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={row.object} onChange={e => handleChange(i, 'object', e.target.value)} disabled={!row.buildingType}>
                        <option value="">Выберите</option>
                        {(objectOptions[row.buildingType] || []).map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      {blocks ? (
                        <select value={row.block} onChange={e => handleChange(i, 'block', e.target.value)}>
                          <option value="">—</option>
                          {blocks.map(b => <option key={b}>{b}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: '#bbb', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td>
                      {positions ? (
                        <select value={row.position} onChange={e => handleChange(i, 'position', e.target.value)}>
                          <option value="">—</option>
                          {positions.map(p => <option key={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: '#bbb', fontSize: 13 }}>—</span>
                      )}
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
                );
              })}
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
