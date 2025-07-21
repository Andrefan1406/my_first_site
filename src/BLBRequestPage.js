import React, { useState } from "react";
import styles from './RequestPage.module.css';
import { 
    objectCategoryOptions2, 
    objectPositionOptions2,
    positionBlockOptions
 } from './data/constructionData2';
import Select from 'react-select';

const productBrandOptions = {
    'Брусчатка' : ["Б.1.П.7",  "Б.2.П.7", "Б.3.П.7", "Б.5.П.7", "Б.6.П.7", "Б.7.П.7", "Б.8.П.7", 
        "Б.9.П.7", "Б.10.П.7", "Б.11.П.7", "Б.12.П.7", "Б.13.П.7", "Б.14.П.7", "Б.15.П.7"],
    'Бордюр' : ["БР 100.30.15"],
    'Лоток' : ["50.25.9"]
};

const BLBRequestPage = () => {
    const [formRows, setFormRows] = useState([
      {
        date: '', category: '', object: '', position: '',
        block: '', product: '', brand: '', color: '', 
        dimensions: '', unit: '', quantity: '',  note: ''
      }
    ]);

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() + 14);
    const formatDate = (date) => date.toISOString().split('T')[0];
    const minDate = formatDate(startDate);

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
            row.product = '';
            row.brand = '';
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'object') {
            row.object = value;
            row.position = '';
            row.block = '';
            row.product = '';
            row.brand = '';
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'position') {
            row.position = value;
            row.block = '';
            row.product = '';
            row.brand = '';
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'block') {
            row.block = value;
            row.product = '';
            row.brand = '';
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'product') {
            row.product = value;
            row.brand = '';
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'brand') {
            row.brand = value;
            row.color = '';
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'color') {
            row.color = value;
            row.dimensions = '';
            row.unit = '';
          } else if (name === 'dimensions') {
            row.dimensions = value;
            row.unit = '';
          } else if (name === 'unit') {
            row.unit = value;           
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
      
      const categoryOptions = Object.keys(objectCategoryOptions2).map(opt => ({
        value: opt,
        label: opt
      }));

    return(
        <div className={styles.widecontainer}>
            <h2>Заявка на брусчатку, лотки и бордюры</h2>
            <table className={styles.requestTable}>
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Категория объекта</th>
                        <th>Объект</th>
                        <th>Позиция</th>
                        <th>Блок</th>
                        <th>Изделие</th>
                        <th>Марка</th>
                        <th>Цвет</th>
                        <th>Размеры</th>
                        <th>Ед.изм.</th>
                        <th>Кол-во</th>
                        <th>Примечание</th>
                    </tr>
                </thead>
                <tbody>
                    {formRows.map((row, index) => (                      
                        <tr key={index}>
                            <td style={{minWidth: 80}}>
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
                                  }}>
                                    <input
                                    type='date'
                                    name='date'
                                    value={row.date}
                                    min={minDate}
                                    /* max={maxDate} */
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
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                        </tr>
                    ))}    
                </tbody>
            </table>
        </div>
    );
};

export default BLBRequestPage;