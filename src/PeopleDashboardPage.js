// PeopleDashboardPage.js
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';

const PeopleDashboardPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [filteredSite, setFilteredSite] = useState('');
  const [filteredDateFrom, setFilteredDateFrom] = useState('');
  const [filteredDateTo, setFilteredDateTo] = useState('');
  const [filteredCategory, setFilteredCategory] = useState('');
  const [filteredObject, setFilteredObject] = useState('');
  const [filteredPosition, setFilteredPosition] = useState('');
  const [filteredContractor, setFilteredContractor] = useState('');
  const [filteredProfession, setFilteredProfession] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        setFilteredDateFrom(weekAgo.toISOString().slice(0, 10));
        setFilteredDateTo(today.toISOString().slice(0, 10));
      });
  }, []);

  const filteredData = data.filter(row =>
    (!filteredSite || row['Участок'] === filteredSite) &&
    (!filteredDateFrom || row['Дата'] >= filteredDateFrom) &&
    (!filteredDateTo || row['Дата'] <= filteredDateTo) &&
    (!filteredCategory || row['Категория объекта'] === filteredCategory) &&
    (!filteredObject || row['Объект'] === filteredObject) &&
    (!filteredPosition || row['Позиция'] === filteredPosition) &&
    (!filteredContractor || row['Субподрядчик'] === filteredContractor) &&
    (!filteredProfession || row['Профессия'] === filteredProfession) &&
    (parseFloat(row['Количество']) > 0)
  );

  const getUnique = (key, base = filteredData.length ? filteredData : data) => [...new Set(base.map(row => row[key]).filter(Boolean))];

  const clearAllFilters = () => {
    setFilteredSite('');
    setFilteredDateFrom('');
    setFilteredDateTo('');
    setFilteredCategory('');
    setFilteredObject('');
    setFilteredPosition('');
    setFilteredContractor('');
    setFilteredProfession('');
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

  filteredData.sort((a, b) => new Date(b['Дата']) - new Date(a['Дата']));

  return (
    <div style={{ padding: '20px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 768px) {
          .hide-mobile { display: none !important; }
          .filter-bar { flex-direction: column; align-items: stretch; }
          .filter-bar label, .filter-bar button { width: 100%; }
          .people-table-container { overflow-x: auto; }
        }
        td, th {
          word-wrap: break-word;
          white-space: normal;
          word-break: break-word;
        }
      `}</style>

      <h2>Отчётность по людям</h2>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => navigate(-1)}>← Назад</button>
      </div>

      <button onClick={() => setShowFilters(!showFilters)} style={{ marginBottom: '10px' }}>
        {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'}
      </button>

      {showFilters && (
        <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
          <label>Участок: <select value={filteredSite} onChange={e => setFilteredSite(e.target.value)}>
            <option value=''>Все</option>
            {getUnique('Участок').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>С даты: <input type="date" value={filteredDateFrom} onChange={e => setFilteredDateFrom(e.target.value)} /></label>
          <label>По дату: <input type="date" value={filteredDateTo} onChange={e => setFilteredDateTo(e.target.value)} /></label>
          <div className="hide-mobile">
            <label>Категория объекта: <select value={filteredCategory} onChange={e => setFilteredCategory(e.target.value)}>
              <option value=''>Все</option>
              {getUnique('Категория объекта').map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          </div>
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
          <button onClick={clearAllFilters}>Очистить все фильтры</button>
          <button onClick={downloadExcel}>Скачать Excel</button>
        </div>
      )}

      <div className="people-table-container">
        <table className="people-table" border="1" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            {desiredOrder.map((col, i) => (
              <col key={i} style={{ width: colWidths[col] || `${100 / desiredOrder.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {desiredOrder.map((k, i) => (
                <th key={i} className={k === 'Категория объекта' ? 'hide-mobile' : ''}>{k}</th>
              ))}
            </tr>
            <tr>
              <td colSpan={7}><strong>Итого</strong></td>
              <td><strong>{total}</strong></td>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, i) => (
              <tr key={i}>
                {desiredOrder.map((k, j) => (
                  <td key={j} className={k === 'Категория объекта' ? 'hide-mobile' : ''}>
                    {k === 'Количество' ? Number(row[k]) || 0 : row[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PeopleDashboardPage;
