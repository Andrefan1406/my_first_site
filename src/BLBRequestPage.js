import React, { useState } from "react";
import styles from './RequestPage.module.css';
import { 
    objectCategoryOptions2, 
    objectPositionOptions2,
    positionBlockOptions
} from './data/constructionData2';
import Select from 'react-select';

// Справочники для второй группы
const productBrandOptions = {
    'Брусчатка': ["Б.1.П.7", "Б.2.П.7", "Б.3.П.7", "Б.5.П.7", "Б.6.П.7", "Б.7.П.7", "Б.8.П.7",
                  "Б.9.П.7", "Б.10.П.7", "Б.11.П.7", "Б.12.П.7", "Б.13.П.7", "Б.14.П.7", "Б.15.П.7"],
    'Бордюр': ["БР 100.30.15"],
    'Лоток': ["50.25.9"]
};

const brandSeriesOption = {
    'Б.1.П.7': ['Новый город'], 'Б.10.П.7': ['Крупноформат'], 'Б.11.П.7': ['Крупноформат'],
    'Б.12.П.7': ['Крупноформат'], 'Б.13.П.7': ['Старый Город'], 'Б.14.П.7': ['Старый Город'],
    'Б.15.П.7': ['Старый Город'], 'Б.2.П.7': ['Новый город'], 'Б.3.П.7': ['Новый город'],
    'Б.5.П.7': ['Классика'], 'Б.6.П.7': ['Крупноформат'], 'Б.7.П.7': ['Крупноформат'],
    'Б.8.П.7': ['Крупноформат'], 'Б.9.П.7': ['Крупноформат']
};

const branColorsOption = {
    'Б.1.П.7': 'Серый', 'Б.2.П.7': 'Белый', 'Б.3.П.7': 'Черный', 'Б.6.П.7': 'Серый',
    'Б.7.П.7': 'Белый', 'Б.8.П.7': 'Черный', 'Б.12.П.7': 'Красный', 'Б.9.П.7': 'Серый',
    'Б.10.П.7': 'Белый', 'Б.11.П.7': 'Черный', 'Б.5.П.7': 'Серый', 'Б.13.П.7': 'Белый', 
    'Б.14.П.7': 'Черный', 'Б.15.П.7': 'Серый'   
};

const branDimensionsOption = {
    'Б.1.П.7': ['160х160х7', '160х200х7', '160х240х7'], 'Б.10.П.7': ['320х320х7'],
    'Б.11.П.7': ['320х320х7'], 'Б.12.П.7': ['320х160х7'], 'Б.13.П.7': ['120х120х7', '120х90х7', '180х120х7'],
    'Б.14.П.7': ['120х120х7', '120х90х7', '180х120х7'], 'Б.15.П.7': ['120х120х7', '120х90х7', '180х120х7'],
    'Б.2.П.7': ['160х160х7', '160х200х7', '160х240х7'], 'Б.3.П.7': ['160х160х7', '160х200х7', '160х240х7'],
    'Б.5.П.7': ['100х200х7'], 'Б.6.П.7': ['320х160х7'], 'Б.7.П.7': ['320х160х7'], 'Б.8.П.7': ['320х160х7'],
    'Б.9.П.7': ['320х320х7']    
};

// Готовим общий каталог для фильтрации (один раз)
const catalog = {};
Object.entries(productBrandOptions).forEach(([product, codes]) => {
    codes.forEach(code => {
        catalog[code] = {
            product,
            series: brandSeriesOption[code] || [],
            color: branColorsOption[code] || '',
            dimensions: branDimensionsOption[code] || []
        };
    });
});

const BLBRequestPage = () => {
  const [formRows, setFormRows] = useState([
    {
      date: '', category: '', object: '', position: '', block: '',
      product: '', brand: '', series: '', color: '', dimensions: '',
      unit: '', quantity: '', note: ''
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
        product: '', brand: '', series: '', color: '', dimensions: '',
        unit: '', quantity: '', note: '' }
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
    color: row.color,
    dimensions: row.dimensions,
    unit: row.unit,
    quantity: row.quantity,
    note: row.note,
    responsibleName: userName,
    responsiblePhone: userPhone
  })));

  const formData = new FormData();
  formData.append('data', payload);

  try {
    await fetch('https://script.google.com/macros/s/AKfycbyMz5pFG3eMxFU-W5bYcPEmYCySf2mNsrLSYYFCfLqY6p5-fuNSySuFKmUohEImS_F_zQ/exec', {
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
      product: '', brand: '', series: '', color: '', dimensions: '',
      unit: '', quantity: '', note: ''
    }]);
  } catch (error) {
    console.error('Ошибка отправки:', error);
    alert('Ошибка при отправке!');
  } finally {
    setIsSubmitting(false);
  }
};

  const handleChange = (e, index) => {
    const { name, value } = e.target;
    const isCleared = value === ''; // флаг, что поле очищено вручную

    setFormRows(prevRows => {
      const updated = [...prevRows];
      const row = { ...updated[index] };

      // Сброс цепочки при изменении иерархии
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
      } else if (['product','brand','series','color','dimensions'].includes(name)) {
        row[name] = value;
      } else if (name === 'quantity') {
        const regex = /^\d{0,6}$/;  // только целые числа
        if (value === '' || regex.test(value)) {
          row.quantity = value;
        }
      } else {
        row[name] = value;
      }

      // Устанавливаем единицу измерения
      if (row.product === 'Брусчатка') {
        row.unit = 'м²';
      } else if (row.product === 'Бордюр' || row.product === 'Лоток') {
        row.unit = 'м.пог.';
      } else {
        row.unit = '';
      }

      // === Автозаполнение, но НЕ если пользователь очистил поле ===
      if (!isCleared) {
        const allCodes = Object.keys(catalog);
        const filteredCodes = allCodes.filter(code => {
          const item = catalog[code];
          return (
            (!row.product || item.product === row.product) &&
            (!row.brand || code === row.brand) &&
            (!row.series || item.series.includes(row.series)) &&
            (!row.color || item.color === row.color) &&
            (!row.dimensions || item.dimensions.includes(row.dimensions))
          );
        });

        const productValues = [...new Set(filteredCodes.map(c => catalog[c].product))];
        const brandValues = filteredCodes.map(c => c);
        const seriesValues = [...new Set(filteredCodes.flatMap(c => catalog[c].series))];
        const colorValues = [...new Set(filteredCodes.map(c => catalog[c].color))];
        const dimensionValues = [...new Set(filteredCodes.flatMap(c => catalog[c].dimensions))];

        if (!row.product && productValues.length === 1) row.product = productValues[0];
        if (!row.brand && brandValues.length === 1) row.brand = brandValues[0];
        if (!row.series && seriesValues.length === 1) row.series = seriesValues[0];
        if (!row.color && colorValues.length === 1) row.color = colorValues[0];
        if (!row.dimensions && dimensionValues.length === 1) row.dimensions = dimensionValues[0];
      }

      updated[index] = row;
      return updated;
    });
  };


  const categoryOptions = Object.keys(objectCategoryOptions2).map(opt => ({
    value: opt, label: opt
  }));

  return (
    <div className={styles.wideContainer}>
      <h2>Заявка на брусчатку, лотки и бордюры</h2>
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
            <th>Серия</th>
            <th>Цвет</th>
            <th>Размеры</th>
            <th>Ед.изм.</th>
            <th>Кол-во</th>
            <th>Примечание</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {formRows.map((row, index) => {
            // === Фильтрация второй группы для этой строки ===
            const allCodes = Object.keys(catalog);
            const filteredCodes = allCodes.filter(code => {
              const item = catalog[code];
              return (
                (!row.product || item.product === row.product) &&
                (!row.brand || code === row.brand) &&
                (!row.series || item.series.includes(row.series)) &&
                (!row.color || item.color === row.color) &&
                (!row.dimensions || item.dimensions.includes(row.dimensions))
              );
            });

            const productOptionsFiltered = [...new Set(filteredCodes.map(c => catalog[c].product))].map(p => ({ value: p, label: p }));
            const brandOptionsFiltered = filteredCodes.map(c => ({ value: c, label: c }));
            const seriesOptionsFiltered = [...new Set(filteredCodes.flatMap(c => catalog[c].series))].map(s => ({ value: s, label: s }));
            const colorOptionsFiltered = [...new Set(filteredCodes.map(c => catalog[c].color))].map(cl => ({ value: cl, label: cl }));
            const dimensionOptionsFiltered = [...new Set(filteredCodes.flatMap(c => catalog[c].dimensions))].map(d => ({ value: d, label: d }));

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
                      height: '36px',
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
                    options={productOptionsFiltered}
                    value={row.product ? { value: row.product, label: row.product } : null}
                    onChange={selected => handleChange({ target: { name: 'product', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isSearchable={false}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                <td style={{ minWidth: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Select
                      options={brandOptionsFiltered}
                      value={row.brand ? { value: row.brand, label: row.brand } : null}
                      isDisabled // запрет выбора вручную
                      placeholder="Автозаполняется..."
                      styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px', backgroundColor: '#f0f0f0' }) }}
                    />
                    {row.brand && (
                      <button
                        type="button"
                        onClick={() => {
                          const e = { target: { name: 'brand', value: '' } };
                          handleChange(e, index); // очистка через handleChange
                        }}
                        style={{
                          marginLeft: '4px',
                          padding: '0 6px',
                          background: '#f5f5f5',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={seriesOptionsFiltered}
                    value={row.series ? { value: row.series, label: row.series } : null}
                    onChange={selected => handleChange({ target: { name: 'series', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isSearchable={false}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                <td style={{ minWidth: 120 }}>
                  <Select
                    options={colorOptionsFiltered}
                    value={row.color ? { value: row.color, label: row.color } : null}
                    onChange={selected => handleChange({ target: { name: 'color', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isSearchable={false}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={dimensionOptionsFiltered}
                    value={row.dimensions ? { value: row.dimensions, label: row.dimensions } : null}
                    onChange={selected => handleChange({ target: { name: 'dimensions', value: selected?.value || '' } }, index)}
                    placeholder="Выберите..."
                    isClearable
                    isSearchable={false}
                    styles={{ control: base => ({ ...base, minHeight: '30px', fontSize: '12px' }) }}
                  />
                </td>
                {/* Ед.изм. */}
                <td style={{ minWidth: 80 }}>
                  <input
                    type="text"
                    value={row.unit}
                    readOnly
                    placeholder="Автозаполняется..."
                    style={{
                      width: '100%',
                      height: '36px',
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      fontSize: '12px',
                      padding: '2px 6px',
                      backgroundColor: '#f0f0f0'
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

export default BLBRequestPage;
