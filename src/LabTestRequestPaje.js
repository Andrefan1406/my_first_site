// Обновлённый компонент с ограничением времени и даты
import React, { useState } from 'react';
import Select from 'react-select';
import styles from './RequestPage.module.css';
import {
  objectCategoryOptions2,
  objectPositionOptions2,
  positionBlockOptions,
  blockFloorOptions,
  concreteConstructiveOptions 
} from './data/constructionData2';

const emptyRow = {
  test: '', date: '', category: '', object: '', position: '',
  block: '', floor: '', constructive: '', note: ''
};
const LabTestRequestPaje = () => {
  const [formRows, setFormRows] = useState([{ ...emptyRow}]);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');

  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const formatDate = (date) => date.toISOString().split('T')[0];
  const minDate = formatDate(today);
  const maxDate = formatDate(nextWeek);  
  
  const addRow = () => {
    setFormRows(prev => [...prev, { ...emptyRow}]);
  };

  const removeRow = (index) => {
    setFormRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (e, index) => {
    const { name, value } = e.target;
    setFormRows(prevRows => {
      const updatedRows = [...prevRows];
      const row = { ...updatedRows[index] };
        
      if (name === 'test') {
        row.test = value;
        row.date = '';
        row.category = '';
        row.object = '';
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = value === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'date') {
        row.date = value;
        row.category = '';
        row.object = '';
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'category') {
        row.category = value;
        row.object = '';
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'object') {
        row.object = value;
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'position') {
        row.position = value;
        row.block = '';
        row.floor = '';
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'block') {
        row.block = value;
        row.floor = '';
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'floor') {
        row.floor = value;
        row.constructive = row.test === 'Степень уплотнения грунта' ? 'Основание' : '';
      } else if (name === 'constructive') {
        row.constructive = value;        
      } else {
        row[name] = value;
      }  
      updatedRows[index] = row;
      return updatedRows;
    });
  };  

  const handleSubmit = (e) => {
    e.preventDefault();
  
    const requiredFields = ['date', 'category', 'object', 'position'];
  
    const hasEmptyRequiredField = formRows.some(row => {
      const activeFields = [...requiredFields];
      const hasBlocks = positionBlockOptions[row.position];
  
      if (row.test === 'Степень уплотнения грунта') {
        activeFields.push('constructive');
      } else if (hasBlocks) {
        activeFields.push('block', 'floor', 'constructive');
      } else {
        activeFields.push('test');
      }
  
      return activeFields.some(field => !row[field]?.toString().trim());
    });
  
    if (hasEmptyRequiredField) {
      alert('Пожалуйста, заполните все обязательные поля.');
      return;
    }
  
    // ✅ Только если всё ок — открываем модалку
    setShowModal(true);
  };

  const handleFinalSubmit = async () => {
  const requiredFields = ['date', 'category', 'object', 'position'];

  const hasEmptyRequiredField = formRows.some(row => {
    const activeFields = [...requiredFields];

    // Если позиция есть в positionBlockOptions, значит нужны block, floor, constructive
    const hasBlocks = positionBlockOptions[row.position];
    if (row.test === 'Степень уплотнения грунта') {
      activeFields.push('constructive');
    } else if (hasBlocks) {
      activeFields.push('block', 'floor', 'constructive');
    } else {
      activeFields.push('test');
    }

    return activeFields.some(field => !row[field]?.toString().trim());
  });

  if (hasEmptyRequiredField) {
    alert('Пожалуйста, заполните все обязательные поля (кроме примечания).');
    return;
  }
  
  setIsSubmitting(true);

  const payload = formRows.map(row => ({
    test: row.test,
    date: row.date,    
    category: row.category,
    object: row.object,
    position: row.position,
    block: row.block,
    floor: row.floor,
    constructive: row.constructive,    
    note: row.note,
    responsibleName: userName,
    responsiblePhone: userPhone
  }));

  try {
    await fetch('https://script.google.com/macros/s/AKfycbxQJ1OVUlO-Qp9t5J0bAB2zMC5jMgOb79VT3GVi0_xaEazGClzYaR9sVo82gosrDwFj/exec', {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    alert('Заявка отправлена!');
    setShowModal(false);
    setUserName('');
    setUserPhone('');
    setFormRows([{ ...emptyRow}]);
  } catch (error) {
    console.error('Ошибка отправки:', error);
    alert('Ошибка при отправке!');
  } finally {
    setIsSubmitting(false);
  }
}; 
  
  const categoryOptions = Object.keys(objectCategoryOptions2).map(opt => ({
    value: opt,
    label: opt
  }));

  const isSoilCompactionTest = (row) => row.test === 'Степень уплотнения грунта';

  return (
    <div className={styles.wideContainer}>
      <h2>Заявка на лабораторные испытания</h2>
      <form onSubmit={handleSubmit}>
        <table className={styles.requestTable}>
          <thead>
            <tr>
              <th>Наименование испытания</th><th>Дата</th><th>Категория</th><th>Объект</th>
              <th>Позиция</th><th>Блок</th><th>Этаж</th><th>Конструктив</th>
              <th>Примечание</th><th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {formRows.map((row, index) => (
              <tr key={index}>
                 {/* Наименование испытания */}
                 <td style={{ minWidth: 100 }}>
                    <Select
                    options={[
                        { value: 'Степень уплотнения грунта', label: 'Степень уплотнения грунта' },
                        { value: 'Прочность бетона с помощью ИПС', label: 'Прочность бетона с помощью ИПС' }
                    ]}
                    value={row.test ? { value: row.test, label: row.test } : null}
                    onChange={selected => {
                        const e = {
                        target: {
                            name: 'test',
                            value: selected ? selected.value : ''
                        }
                        };
                        handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable                    
                    styles={{
                        control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px'                        
                        })
                    }}
                    />
                 </td>       
                {/* Дата */}
                <td style={{ minWidth: 80 }}> 
                  <div
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      padding: '2px 8px',
                      minHeight: '30px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: 'white',
                    }}
                  >
                    <input
                      type='date'
                      name='date'
                      value={row.date}
                      min={minDate}
                      max={maxDate}
                      onChange={e => handleChange(e, index)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        width: '100%',
                        background: 'transparent',
                        appearance: 'none',
                      }}
                    />
                  </div>
                </td>                
                {/* Категория */}
                <td style={{ minWidth: 160 }}>
                  <Select
                    options={categoryOptions}
                    value={categoryOptions.find(opt => opt.value === row.category) || null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'category',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',       // разрешаем перенос
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',      
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />

                </td>
                {/* Объект */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(objectCategoryOptions2[row.category] || []).map(obj => ({
                      value: obj,
                      label: obj
                    }))}
                    value={row.object ? { value: row.object, label: row.object } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'object',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.category}
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />
                </td>
                {/* Позиция */}
                <td style={{ minWidth: 140 }}> 
                  <Select
                    options={(objectPositionOptions2[row.object] || []).map(pos => ({
                      value: pos,
                      label: pos
                    }))}
                    value={row.position ? { value: row.position, label: row.position } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'position',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.object}
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />
                </td>
                {/* Блок */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(positionBlockOptions[row.position] || []).map(b => ({
                      value: b,
                      label: b
                    }))}
                    value={row.block ? { value: row.block, label: row.block } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'block',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={isSoilCompactionTest(row) || !row.position || !positionBlockOptions[row.position]}
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />
                </td>
                {/* Этаж */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(blockFloorOptions[row.block] || []).map(f => ({
                      value: f,
                      label: f
                    }))}
                    value={row.floor ? { value: row.floor, label: row.floor } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'floor',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={isSoilCompactionTest(row) || !row.block || !positionBlockOptions[row.position]}
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />
                </td>
                {/* Конструктив */}
                <td style={{ minWidth: 140 }}>
                  <Select
                    options={
                      isSoilCompactionTest(row)
                        ? [{ value: 'Основание', label: 'Основание' }]
                        : (concreteConstructiveOptions[row.floor] || []).map(c => ({
                            value: c,
                            label: c
                          }))
                    }
                    value={row.constructive ? { value: row.constructive, label: row.constructive } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'constructive',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={isSoilCompactionTest(row) || !row.floor || !positionBlockOptions[row.position]}
                    styles={{
                      control: base => ({
                        ...base,
                        minHeight: '30px',
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        lineHeight: '1.2',
                      }),
                      menu: base => ({
                        ...base,
                        fontSize: '12px',
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                      }),
                      singleValue: base => ({
                        ...base,
                        whiteSpace: 'normal',
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />
                </td>
                        
                {/* Примечание */}
                <td><textarea name='note' value={row.note} onChange={e => handleChange(e, index)} rows={2} placeholder='Введите примечание...' /></td>
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
            ))}
          </tbody>
        </table>

        <div className={styles.buttonsContainer}>
          <button type='button' onClick={addRow} className={styles.addButton}>Добавить строку</button>
          <button type='submit' className={styles.submitButton}>Отправить заявку</button>
        </div>
      </form>
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

export default LabTestRequestPaje;
