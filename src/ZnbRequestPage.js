import React, { useState } from "react";
import styles from './RequestPage.module.css';
import { 
    objectCategoryOptions2, 
    objectPositionOptions2,
    positionBlockOptions
} from './data/constructionData2';
import Select from 'react-select';

// Справочники для второй группы
const znbBrandOptions = {
    'Балка': ['Б-6', 'Б-7', 'Б-8'],
    'Блоки бетонные для стен подвалов': ['ФБС 12.4.6т', 'ФБС 12.5.6т', 'ФБС 24.4.6т', 'ФБС 24.5.6т',
        'ФБС 24.6.6т', 'ФБС 9.4.6т', 'ФБС 9.5.6т', 'ФБС 9.6.6т', 'ФБС12.6.6т'],
    'Ж/б опора для передвижного ограждения': ['ОП-1'],
    'Железобетонный фундамент для опоры наружного освещения': ['ФН-1', 'ФН-2'],
    'Кабель канал': ['К 20.6.3'],
    'Камни бетонные бортовые': ['БР100.20.8'],
    'Кольцо стеновое цилиндрическое (Технологический бетон)': ['КС 10-3', 'КС 10-6 ', 'КС 10-9 ', 'КС 15-6',
        'КС 15-9', 'КС 20-6', 'КС 20-9', 'КС 7-3', 'КС 7-9'],
    'Лоток': ['Л11-8/2'],
    'Лоток водоотводный': ['Л-100.15.15', 'Л-100.25.15', 'Л-150.15.15'],
    'Лоток водоотводный (Технологический бетон)': ['Л-100.25.15'],
    'Опора освещения': ['СВ 105-3,5', 'СВ 95-2а'],
    'Опорное кольцо': ['КО-6'],
    'Панель ограждения': ['3ПБ30.20', 'ПО1В', 'ПО1В*'],
    'Перемыка плитная': ['2ПП17-5', '2ПП18-5', '3ПП16-71', '3ПП18-71', '6ПП16-72', '6ПП21-72', '6ПП27-72'],
    'Перемычка брусковая': ['1ПБ 13-1п', '1ПБ 16-1п', '2ПБ 10-1п', '2ПБ 13-1п', '2ПБ 16-2п', '2ПБ 17-2п',
        '2ПБ 19-3п', '2ПБ 25-3п', '2ПБ 29-4п', '3ПБ 13-37п', '3ПБ 16-37п', '3ПБ 18-37п', '3ПБ 30-8п',
        '4ПБ 44-8п', '5ПБ 18-27п', '5ПБ 21-27п', '5ПБ 25-27п', '5ПБ 27-27п', '5ПБ 27-37п'],
    'Плита': ['ОП 200', 'ОП 220', 'П11-8', 'П-4', 'ПД 300.150.14-9', 'ПД 300.240.20-9', 'ПД 300.300.20-9',
        'ПД 75.240.20-9', 'ПД 75.300.20-9', 'ПД43-15', 'ПТ 300.120.14-9', 'ПТ 300.150.14-9', 'ПТ 300.180.14-9',
        'ПТ 300.180.14-9*', 'ПТ 300.210.16-9', 'ПТ 300.300.25-9', 'ПТ 30-15', 'ПТ 30-15/2000', 'ПТ 75.180.14-9', 
        'ПТ 75.210.16-9', 'ПТ 75.300.25-9', 'ПТ40-12', 'ПТ40-15'],
    'Плита для железнодорожных переездов': ['ПЖ 03.00.00', 'ПЖ 04.00.00'],
    'Плита днища': ['ПН10', 'ПН15', 'ПН20', 'ПН7'],
    'Плита дорожная': ['1П30.18-30'],
    'Плита канала': ['ППк1', 'ППк1.1', 'ППк2', 'ППк2.1', 'ППк2.2'],
    'Плита лотка': ['П28-15', 'П28д-15'],
    'Плита перекрытия': ['КЦП 2-7', '1ПП15-1', '1ПП15-2', '1ПП20-1', '1ПП20-2', 'ПП10-1', 'ПП10-2'],
    'Плита перекрытия лотков': ['П11д-8а', 'П12/2-12а', 'П15д-8а', 'П18д-8а', 'П21д-8', 'ПО-2', 'ПО-3', 'ПО-4'],
    'Плита переходная': ['П800.98.40-ТАIII'],
    'Противовес': ['ПР-2'],
    'Пртивовес (Технологический бетон)': ['ПР-1'],
    'Ригель': ['Р-5100'],
    'Стакан под панель ограждения': ['ОФ-1а']
};

const seriesBrandOptions = {
    'ГОСТ 3579-78': ['ФБС 12.4.6т', 'ФБС 12.5.6т', 'ФБС 24.4.6т', 'ФБС 24.5.6т',
        'ФБС 24.6.6т', 'ФБС 9.4.6т', 'ФБС 9.5.6т', 'ФБС 9.6.6т', 'ФБС12.6.6т'],
    'ГОСТ 6665-91': ['БР100.20.8'],
    'ТП 902-09-46.88': ['КЦП 2-7'],
    'серия 1.038.1-1 вып.1': ['1ПБ 13-1п', '1ПБ 16-1п', '2ПБ 10-1п', '2ПБ 13-1п', '2ПБ 16-2п', '2ПБ 17-2п', '2ПБ 19-3п', 
        '2ПБ 25-3п', '2ПБ 29-4п', '3ПБ 13-37п', '3ПБ 16-37п', '3ПБ 18-37п', '3ПБ 30-8п', '4ПБ 44-8п', '5ПБ 18-27п',
        '5ПБ 21-27п', '5ПБ 25-27п', '5ПБ 27-27п', '5ПБ 27-37п'],
    'серия 1.038.1-1 вып.2': ['2ПП17-5', '2ПП18-5', '3ПП16-71', '3ПП18-71', '6ПП16-72', '6ПП21-72', '6ПП27-72'],
    'серия 3.006.1-2.87': ['ПО-2', 'ПО-3', 'ПО-4'],
    'серия 3.900.1- 4 B.1': ['КС 10-3', 'КС 10-6 ', 'КС 10-9 ', 'КС 15-6', 
        'КС 15-9', 'КС 20-6', 'КС 20-9', 'КС 7-3', 'КС 7-9', 'КО-6'],
    'серия 3.900.1-4 В.1': ['ПН10', 'ПН15', 'ПН20', 'ПН7', '1ПП15-1', '1ПП15-2', '1ПП20-1', '1ПП20-2', 'ПП10-1', 'ПП10-2']
};

const ZnbRequestPage = () => {
  const [formRows, setFormRows] = useState([
    {
      date: '', category: '', object: '', position: '', block: '', product: '', 
      brand: '', series: '', quantity: '', note: ''
    }
  ]);

  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  const today = new Date();
  const startDate = new Date();
  startDate.setDate(today.getDate() + 14);
  const formatDate = (date) => date.toISOString().split('T')[0];
  const minDate = formatDate(startDate);

  // Добавление строки
  const addRow = () => {
    setFormRows(prev => [
      ...prev,
      { date: '', category: '', object: '', position: '', block: '',
        product: '', brand: '', series: '', quantity: '', note: '' }
    ]);
  };

  // Удаление строки
  const removeRow = (index) => {
    setFormRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const requiredFields = ['date', 'category', 'object', 'position', 'quantity'];
    const hasEmpty = formRows.some(row => requiredFields.some(f => !row[f]?.toString().trim()));

    if (hasEmpty) {
      alert('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    setShowModal(true);
  };

  // Финальная отправка данных (после ввода ФИО и телефона)
  const handleFinalSubmit = async () => {
  setIsSubmitting(true);

  const payload = JSON.stringify(formRows.map(row => ({
    date: row.date,
    category: row.category,
    object: row.object,
    position: row.position,
    block: row.block,
    product: row.product,
    brand: row.brand,
    series: row.series,
    quantity: row.quantity,
    note: row.note,
    responsibleName: userName,
    responsiblePhone: userPhone
  })));

  const formData = new FormData();
  formData.append('data', payload);

  try {
    await fetch('https://script.google.com/macros/s/AKfycbwowotIxoCnGcf24SR8YxHxI8_PeKH0EP9Dmv4Tw9f4Fn14eUsa4TMKOj_TWzpt5PGAyQ/exec', {
      method: 'POST',
      mode: 'no-cors',
      body: formData
    });

    alert('Заявка отправлена!');
    setShowModal(false);
    setUserName('');
    setUserPhone('');
    setFormRows([{
      date: '', category: '', object: '', position: '', block: '',
      product: '', brand: '', series: '', quantity: '', note: ''
    }]);
  } catch (error) {
    console.error('Ошибка отправки:', error);
    alert('Ошибка при отправке!');
  } finally {
    setIsSubmitting(false);
  }
};

  // Обработчик изменений
  const handleChange = (e, index) => {
    const { name, value } = e.target;
    setFormRows(prevRows => {
      const updated = [...prevRows];
      const row = { ...updated[index] };

      // Логика для первой группы (иерархия)
      if (name === 'category') {
        row.category = value;
        row.object = '';
        row.position = '';
        row.block = '';
      } else if (name === 'object') {
        row.object = value;
        row.position = '';
        row.block = '';
      } else if (name === 'position') {
        row.position = value;
        row.block = '';
      } else if (name === 'block') {
        row.block = value;
      } 
      // Вторая группа (иерархия) 
        else if (name === 'product') {
        row.product = value;
        row.brand = '';
        row.series = '';
      } else if (name === 'brand') {
        row.brand = value;
        // Автоподбор ГОСТ/Серии
        const foundSeries = Object.keys(seriesBrandOptions).find(series =>
            (seriesBrandOptions[series] || []).includes(value)
        );
        row.series = foundSeries || ''; // если нашли серию — заполняем, иначе пусто
      } else if (name === 'series') {
        row.series = value;
      } else if (name === 'quantity') {
        const regex = /^\d{0,4}$/;;
        if (value === '' || regex.test(value)) {
          row.quantity = value;
        }
      } else {
        row[name] = value;
      }      
        updated[index] = row;
      return updated;
    });
  };

  const categoryOptions = Object.keys(objectCategoryOptions2).map(opt => ({
    value: opt, label: opt
  }));

  const znbOptions = Object.keys(znbBrandOptions).map(opt => ({
    value: opt, label: opt
  }));

  return (
    <div className={styles.wideContainer}>
      <h2>Заявка на ж/б изделия</h2>
      <table className={styles.requestTable}>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Категория</th>
            <th>Объект</th>
            <th>Позиция</th>
            <th>Блок</th>
            <th>Изделие</th>
            <th>Марка</th>
            <th>ГОСТ/Серия</th>
            <th>Кол-во; шт.</th>
            <th>Примечание</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {formRows.map((row, index) => {
            return (
              <tr key={index}>
                {/* Дата */}
                <td style={{ minWidth: 100 }}>
                  <input
                    type="date"
                    name="date"
                    value={row.date}
                    min={minDate}
                    onChange={e => handleChange(e, index)}
                    style={{
                      width: '100%',
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      fontSize: '12px',
                      padding: '2px 6px'
                    }}
                  />
                </td>

                {/* Категория */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={categoryOptions}
                    value={row.category ? { value: row.category, label: row.category } : null}
                    onChange={selected => handleChange({ target: { name: 'category', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>

                {/* Объект */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(objectCategoryOptions2[row.category] || []).map(o => ({ value: o, label: o }))}
                    value={row.object ? { value: row.object, label: row.object } : null}
                    onChange={selected => handleChange({ target: { name: 'object', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.category}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>

                {/* Позиция */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(objectPositionOptions2[row.object] || []).map(p => ({ value: p, label: p }))}
                    value={row.position ? { value: row.position, label: row.position } : null}
                    onChange={selected => handleChange({ target: { name: 'position', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.object}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>

                {/* Блок */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(positionBlockOptions[row.position] || []).map(b => ({ value: b, label: b }))}
                    value={row.block ? { value: row.block, label: row.block } : null}
                    onChange={selected => handleChange({ target: { name: 'block', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.position}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>

                {/* Вторая группа (взаимосвязанные поля) */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={znbOptions}
                    value={row.product ? { value: row.product, label: row.product } : null}
                    onChange={selected => handleChange({ target: { name: 'product', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(znbBrandOptions[row.product] || []).map(o => ({ value: o, label: o }))}
                    value={row.brand ? { value: row.brand, label: row.brand } : null}
                    onChange={selected => handleChange({ target: { name: 'brand', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.product}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                <td style={{ minWidth: 140 }}>
                <input
                    type="text"
                    name="series"
                    value={row.series}
                    readOnly
                    placeholder="Автозаполняется..."
                    style={{
                    width: '100%',
                    height: '36px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    fontSize: '12px',
                    padding: '2px 6px',
                    backgroundColor: '#f9f9f9'
                    }}
                />
                </td>
                {/* Кол-во */}
                <td style={{ minWidth: 100 }}>
                  <input
                    type="text"
                    name="quantity"
                    value={row.quantity}
                    onChange={e => handleChange(e, index)}
                    placeholder="Кол-во"
                    style={{
                      width: '100%',
                      height: '36px',
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      fontSize: '12px',
                      padding: '2px 6px'
                    }}
                  />
                </td>

                {/* Примечание */}
                <td>
                  <textarea
                    name="note"
                    value={row.note}
                    onChange={e => handleChange(e, index)}
                    rows={2}
                    placeholder="Примечание..."
                    style={{ fontSize: '12px', width: '100%' }}
                  />
                </td>

                {/* Действия */}
                <td className={styles.actionsCell}>
                  {formRows.length > 1 && (
                    <button
                      type='button'
                      className={styles.removeButton}
                      onClick={() => removeRow(index)}
                    >
                      Удалить
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={styles.buttonsContainer}>
        <button type="button" onClick={addRow} className={styles.addButton}>Добавить строку</button>
        <button type="button" onClick={handleSubmit} className={styles.submitButton}>Отправить заявку</button>
      </div>
      {/* Модальное окно */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <button className={styles.modalClose} onClick={() => setShowModal(false)}>×</button>
            <h3>Ответственный</h3>
            <label>
              ФИО:
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Введите ФИО"
              />
            </label>
            <label>
              Номер телефона:
              <input
                type="text"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                placeholder="Введите номер"
              />
            </label>
            <button
              className={styles.submitButton}
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Отправка...' : 'Отправить заявку'}
            </button>
          </div>
        </div>
      )}      
    </div>
  );
};

export default ZnbRequestPage;
