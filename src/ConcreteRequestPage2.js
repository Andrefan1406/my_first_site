// Обновлённый компонент с ограничением времени и даты
import React, { useState } from 'react';
import Select from 'react-select';
import styles from './RequestPage.module.css';
import {
  objectCategoryOptions2,
  objectPositionOptions2,
  positionBlockOptions,
  blockFloorOptions,
  floorConstructiveOptions
} from './data/constructionData2';

const materialGradeOptions = {
  'Бетон': [
    'В 7,5', 'В 12,5', 'В 15', 'В 20', 'В 22,5', 'В 25', 'В 30',
    'В 7,5 СС', 'В 12,5 СС', 'В 15 СС', 'В 20 СС', 'В 22,5 СС', 'В 25 СС', 'В 30 СС',
    'В 40 F 300', 'Пескобетон М100', 'Пескобетон М150', 'Пескобетон М200',
    'Пескобетон М250', 'Пескобетон М350', 'Пескобетон М400'
  ],
  'Раствор': ['М 50', 'М 75', 'М 100']
};

const ConcreteRequestPage2 = () => {
  const [formRows, setFormRows] = useState([
    {
      date: '', time: '', category: '', object: '', position: '',
      block: '', floor: '', constructive: '', material: '',
      concreteGrade: '', concreteClass: '', quantity: '', note: ''
    }
  ]);

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
  const todayStr = formatDate(today);
  const currentHour = today.getHours();

  const addRow = () => {
    setFormRows(prev => [...prev, {
      date: '', time: '', category: '', object: '', position: '',
      block: '', floor: '', constructive: '', material: '',
      concreteGrade: '', concreteClass: '', quantity: '', note: ''
    }]);
  };

  const removeRow = (index) => {
    setFormRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleChange = (e, index) => {
    const { name, value } = e.target;
    setFormRows(prevRows => {
      const updatedRows = [...prevRows];
      const row = { ...updatedRows[index] };
        
      if (name === 'category') {
        row.category = value;
        row.object = '';
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = '';
        row.material = '';
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'object') {
        row.object = value;
        row.position = '';
        row.block = '';
        row.floor = '';
        row.constructive = '';
        row.material = '';
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'position') {
        row.position = value;
        row.block = '';
        row.floor = '';
        row.constructive = '';
        row.material = '';
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'block') {
        row.block = value;
        row.floor = '';
        row.constructive = '';
        row.material = '';
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'floor') {
        row.floor = value;
        row.constructive = '';
        row.material = '';
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'constructive') {
        row.constructive = value;
        if (positionBlockOptions[row.position]) {
          row.material = value === 'каменная кладка' ? 'Раствор' : 'Бетон';
        }
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'material') {
        row.material = value;
        row.concreteGrade = '';
        row.concreteClass = '';
      } else if (name === 'quantity') {
        const regex = /^\d{0,6}([.,]\d?)?$/;
        if (value === '' || regex.test(value)) {
          row.quantity = value;
        }
      } else {
        row[name] = value;
      }
  
      updatedRows[index] = row;
      return updatedRows;
    });
  };
  

  const handleSubmit = (e) => {
    e.preventDefault();
  
    const requiredFields = ['date', 'time', 'category', 'object', 'position', 'quantity'];
  
    const hasEmptyRequiredField = formRows.some(row => {
      const activeFields = [...requiredFields];
      const hasBlocks = positionBlockOptions[row.position];
  
      if (hasBlocks) {
        activeFields.push('block', 'floor', 'constructive');
      } else {
        activeFields.push('material');
        if (row.material === 'Бетон') {
          activeFields.push('concreteGrade', 'concreteClass');
        } else if (row.material === 'Раствор') {
          activeFields.push('concreteGrade');
        }
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
  const requiredFields = ['date', 'time', 'category', 'object', 'position', 'quantity'];

  const hasEmptyRequiredField = formRows.some(row => {
    const activeFields = [...requiredFields];

    // Если позиция есть в positionBlockOptions, значит нужны block, floor, constructive
    const hasBlocks = positionBlockOptions[row.position];
    if (hasBlocks) {
      activeFields.push('block', 'floor', 'constructive');
    } else {
      activeFields.push('material');
      if (row.material === 'Бетон') {
        activeFields.push('concreteGrade', 'concreteClass');
      } else if (row.material === 'Раствор') {
        activeFields.push('concreteGrade'); // для раствора только марка
      }
    }

    return activeFields.some(field => !row[field]?.toString().trim());
  });

  if (hasEmptyRequiredField) {
    alert('Пожалуйста, заполните все обязательные поля (кроме примечания).');
    return;
  }

  // продолжение отправки как прежде:
  setIsSubmitting(true);

  const payload = formRows.map(row => ({
    date: row.date,
    time: row.time,
    category: row.category,
    object: row.object,
    position: row.position,
    block: row.block,
    floor: row.floor,
    constructive: row.constructive,
    material: row.material,
    concreteGrade: row.concreteGrade,
    concreteClass: row.concreteClass,
    quantity: parseFloat((row.quantity || '').replace(',', '.')),
    note: row.note,
    responsibleName: userName,
    responsiblePhone: userPhone
  }));

  try {
    await fetch('https://script.google.com/macros/s/AKfycbx9_aWErej5qsHUaY_x8k0D7mrPYRcY-1WqdI2zge39VZoADllt7Xv12cxdys72-4U/exec', {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });

    alert('Заявка отправлена!');
    setShowModal(false);
    setUserName('');
    setUserPhone('');
    setFormRows([{
      date: '', time: '', category: '', object: '', position: '',
      block: '', floor: '', constructive: '', material: '',
      concreteGrade: '', concreteClass: '', quantity: '', note: ''
    }]);
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

  return (
    <div className={styles.wideContainer}>
      <h2>Заявка на бетон или раствор</h2>
      <form onSubmit={handleSubmit}>
        <table className={styles.requestTable}>
          <thead>
            <tr>
              <th>Дата</th><th>Время</th><th>Категория</th><th>Объект</th>
              <th>Позиция</th><th>Блок</th><th>Этаж</th><th>Конструктив</th>
              <th>Материал</th><th>Марка</th><th>Подвижность</th>
              <th>Количество</th><th>Примечание</th><th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {formRows.map((row, index) => (
              <tr key={index}>
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
                    <select
                      name='time'
                      value={row.time}
                      onChange={e => handleChange(e, index)}
                      style={{
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        width: '100%',
                        background: 'transparent',
                        appearance: 'none',
                      }}
                    >
                      <option value=''>--</option>
                      {[...Array(24)].map((_, h) => {
                        const hourStr = `${h.toString().padStart(2, '0')}:00`;
                        const isToday = row.date === todayStr;
                        const isDisabled = isToday && h <= currentHour;
                        return (
                          <option key={h} value={hourStr} disabled={isDisabled}>
                            {hourStr}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </td>

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
                        whiteSpace: 'normal',       // <== ключевая строчка
                        wordWrap: 'break-word',
                        overflow: 'visible',
                        textOverflow: 'clip',
                      })
                    }}
                  />

                </td>
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
                    isDisabled={!row.position || !positionBlockOptions[row.position]}
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
                    isDisabled={!row.block || !positionBlockOptions[row.position]}
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

                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(floorConstructiveOptions[row.floor] || []).map(c => ({
                      value: c,
                      label: c
                    }))}
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
                    isDisabled={!row.floor || !positionBlockOptions[row.position]}
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

                <td style={{ minWidth: 100 }}>
                <Select
                  options={[
                    { value: 'Бетон', label: 'Бетон' },
                    { value: 'Раствор', label: 'Раствор' }
                  ]}
                  value={row.material ? { value: row.material, label: row.material } : null}
                  onChange={selected => {
                    const e = {
                      target: {
                        name: 'material',
                        value: selected ? selected.value : ''
                      }
                    };
                    handleChange(e, index);
                  }}
                  placeholder="Выберите..."
                  isClearable
                  isDisabled={!!positionBlockOptions[row.position]}
                  styles={{
                    control: base => ({
                      ...base,
                      minHeight: '30px',
                      fontSize: '12px',
                      backgroundColor: positionBlockOptions[row.position] ? '#f0f0f0' : 'white',
                    })
                  }}
                />

                </td>

                <td style={{ minWidth: 140 }}>
                  <Select
                    options={(materialGradeOptions[row.material] || []).map(g => ({
                      value: g,
                      label: g
                    }))}
                    value={row.concreteGrade ? { value: row.concreteGrade, label: row.concreteGrade } : null}
                    onChange={selected => {
                      const e = {
                        target: {
                          name: 'concreteGrade',
                          value: selected ? selected.value : ''
                        }
                      };
                      handleChange(e, index);
                    }}
                    placeholder="Выберите..."
                    isClearable
                    isDisabled={!row.material}
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

                <td style={{ minWidth: 80 }}>
                  {row.material === 'Бетон' ? (
                    <Select
                      options={[
                        { value: 'П3', label: 'П3' },
                        { value: 'П4', label: 'П4' }
                      ]}
                      value={row.concreteClass ? { value: row.concreteClass, label: row.concreteClass } : null}
                      onChange={selected => {
                        const e = {
                          target: {
                            name: 'concreteClass',
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
                  ) : (
                    <div style={{ minHeight: '30px', backgroundColor: '#f5f5f5' }}></div>
                  )}
                </td>

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
                    }}
                  >
                    <input
                      type='text'
                      name='quantity'
                      value={row.quantity}
                      onChange={e => handleChange(e, index)}
                      placeholder='Введите число'
                      style={{
                        border: 'none',
                        outline: 'none',
                        fontSize: '12px',
                        width: '100%',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </td>

                <td><textarea name='note' value={row.note} onChange={e => handleChange(e, index)} rows={2} placeholder='Введите примечание...' /></td>
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
      <div style={{ marginTop: '40px' }}>
        <h3>Текущие заявки</h3>
        <iframe
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vTSu48SFcG0-dZpjkW3Z3uN3jJF0QPkpFUroD1YHWRj_8jy7ZwND096Rgd60fDiQGPHMOY8TDVy-_fl/pubhtml?gid=1030005960&single=true&widget=true&headers=false"
          width="100%"
          height="600"
          style={{ border: 'none', backgroundColor: 'white' }}
          title="Текущие заявки"
        ></iframe>
      </div>
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

export default ConcreteRequestPage2;
