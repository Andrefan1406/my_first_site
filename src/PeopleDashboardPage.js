// PeopleDashboardPage.js
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const PeopleDashboardPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [filteredSite, setFilteredSite] = useState('');
  const [filteredDate, setFilteredDate] = useState('');
  const [filteredCategory, setFilteredCategory] = useState('');
  const [filteredObject, setFilteredObject] = useState('');
  const [filteredPosition, setFilteredPosition] = useState('');
  const [filteredContractor, setFilteredContractor] = useState('');
  const [filteredProfession, setFilteredProfession] = useState('');

  const desiredOrder = [
    'Дата', 'Участок', 'Категория объекта', 'Объект',
    'Позиция', 'Субподрядчик', 'Профессия', 'Количество'
  ];

  const colWidths = {
    'Дата': '10%',
    'Участок': '12%',
    'Категория объекта': '20%',
    'Объект': '13%',
    'Позиция': '10%',
    'Субподрядчик': '13%',
    'Профессия': '12%',
    'Количество': '10%'
  };

  useEffect(() => {
    fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vS0qVYHkI9ySfT0LO9SwG36BYrmI-chO09ws7GSjWcnQU2pX4Gzw-R4LXg6tdi44KXa1i5yQYcLF27U/pub?output=csv')
      .then(res => res.text())
      .then(text => {
        const rows = text.trim().split('\n').map(line => {
          const cleanedLine = line.replace(/"(.*?)"/g, m => m.replace(/,/g, ' ').replace(/"/g, ''));
          return cleanedLine.split(',').map(cell => cell.trim());
        });
        const headers = rows[0];
        const parsed = rows.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ''])));
        parsed.forEach(row => {
          if (row['Дата']) {
            const d = new Date(row['Дата']);
            if (!isNaN(d)) {
              d.setHours(d.getHours() + 5);
              row['Дата'] = d.toISOString().slice(0, 10);
            }
          }
        });
        setData(parsed);
      });
  }, []);

  const filteredData = data.filter(row =>
    (!filteredSite || row['Участок'] === filteredSite) &&
    (!filteredDate || row['Дата'] === filteredDate) &&
    (!filteredCategory || row['Категория объекта'] === filteredCategory) &&
    (!filteredObject || row['Объект'] === filteredObject) &&
    (!filteredPosition || row['Позиция'] === filteredPosition) &&
    (!filteredContractor || row['Субподрядчик'] === filteredContractor) &&
    (!filteredProfession || row['Профессия'] === filteredProfession)
  );

  const getUnique = (key, base = filteredData.length ? filteredData : data) => [...new Set(base.map(row => row[key]).filter(Boolean))];

  const clearAllFilters = () => {
    setFilteredSite(''); setFilteredDate(''); setFilteredCategory('');
    setFilteredObject(''); setFilteredPosition('');
    setFilteredContractor(''); setFilteredProfession('');
  };

  const total = filteredData.reduce((sum, row) => {
    const val = parseFloat(row['Количество']);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredData, { header: desiredOrder });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Отчёт');
    XLSX.writeFile(workbook, 'people_report.xlsx');
  };

  return (
    <div style={{ padding: '20px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <h2>Отчётность по людям</h2>

      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => navigate(-1)}>← Назад</button>
      </div>

      <div style={{
        position: 'sticky', top: 0, background: '#f9f9f9', zIndex: 10,
        padding: '10px', borderBottom: '1px solid #ccc', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center'
      }}>
        <label>Участок: <select value={filteredSite} onChange={e => setFilteredSite(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Участок').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Дата: <input type="date" value={filteredDate} onChange={e => setFilteredDate(e.target.value)} /></label>
        <label>Категория объекта: <select value={filteredCategory} onChange={e => setFilteredCategory(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Категория объекта').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Объект: <select value={filteredObject} onChange={e => setFilteredObject(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Объект').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Позиция: <select value={filteredPosition} onChange={e => setFilteredPosition(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Позиция').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Субподрядчик: <select value={filteredContractor} onChange={e => setFilteredContractor(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Субподрядчик').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Профессия: <select value={filteredProfession} onChange={e => setFilteredProfession(e.target.value)}>
          <option value=''>Все</option>
          {getUnique('Профессия').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <button onClick={clearAllFilters} style={{ marginLeft: 'auto' }}>Очистить все фильтры</button>
        <button onClick={downloadExcel}>Скачать Excel</button>

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              {desiredOrder.map((col, i) => <col key={i} style={{ width: colWidths[col] || `${100 / desiredOrder.length}%` }} />)}
            </colgroup>
            <thead>
              <tr>{desiredOrder.map(k => <th key={k}>{k}</th>)}</tr>
              <tr>
                <td colSpan={7}><strong>Итого</strong></td>
                <td><strong>{total}</strong></td>
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table border="1" cellPadding="5" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            {desiredOrder.map((col, i) => <col key={i} style={{ width: colWidths[col] || `${100 / desiredOrder.length}%` }} />)}
          </colgroup>
          <tbody>
            {filteredData.map((row, i) => (
              <tr key={i}>{desiredOrder.map((k, j) => <td key={j}>{row[k]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PeopleDashboardPage;