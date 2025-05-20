import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend, LabelList
} from 'recharts';

const PeopleReportCharts = () => {
  const [chartData, setChartData] = useState([]);
  const [professions, setProfessions] = useState([]);
  const [monthlyAverages2025, setMonthlyAverages2025] = useState([]);
  const [monthlyComparison, setMonthlyComparison] = useState([]);

  const formatDateWithWeekday = (dateStr) => {
    const daysRu = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const date = new Date(dateStr);
    const day = daysRu[date.getDay()];
    return `${dateStr} (${day})`;
  };

  const renderCustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: 'white', padding: 10, border: '1px solid #ccc' }}>
          <p style={{ margin: 0 }}><strong>{label}</strong></p>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            {[...payload].reverse().map((entry, index) => (
              <li key={index} style={{ color: entry.color }}>
                {entry.name}: {entry.value}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    return null;
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
        const dataRows = rows.slice(1).map(row =>
          Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))
        );

        const holidays = new Set([
          '2025-01-01','2025-01-02','2025-03-10','2025-03-21','2025-03-24','2025-03-25',
          '2025-05-01','2025-05-07','2025-05-09','2025-06-06','2025-07-07','2025-09-01',
          '2025-10-27','2025-12-16',
          '2024-01-01','2024-01-02','2024-03-08','2024-03-21','2024-03-22','2024-03-25',
          '2024-05-01','2024-05-07','2024-05-08','2024-05-09','2024-07-08','2024-08-30',
          '2024-10-25','2024-12-16'
        ]);
     
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        const byDate = {};
        const profSet = new Set();

        dataRows.forEach(row => {
          const dateStr = row['Дата'];
          const profession = row['Профессия'] || 'Без профессии';
          const count = parseFloat(row['Количество']) || 0;
          const dateObj = new Date(dateStr);

          if (!isNaN(dateObj) && dateObj >= sevenDaysAgo && dateObj <= today) {
            const key = dateObj.toISOString().slice(0, 10);
            if (!byDate[key]) byDate[key] = { date: key };
            byDate[key][profession] = (byDate[key][profession] || 0) + count;
            profSet.add(profession);
          }
        });

        

        const chart = Object.values(byDate).map(item => {
          const total = Object.entries(item)
            .filter(([k]) => k !== 'date')
            .reduce((sum, [, val]) => sum + val, 0);
          return { ...item, total };
        });

        setChartData(chart);
        setProfessions([...profSet]);
        // Собираем суммы по дням за 2025
        const dailyTotals = {};

        dataRows.forEach(row => {
          const dateStr = row['Дата'];
          const count = parseFloat(row['Количество']) || 0;
          const dateObj = new Date(dateStr);

          const todayStr = new Date().toISOString().slice(0, 10);

          if (dateObj.getFullYear() === 2025) {
            const dayKey = dateObj.toISOString().slice(0, 10);
            
            if (dayKey !== todayStr) {
              dailyTotals[dayKey] = (dailyTotals[dayKey] || 0) + count;
            }
          }
        });

        // Группируем по месяцам
        const monthMap = {};

        Object.entries(dailyTotals).forEach(([dateStr, total]) => {
          const month = dateStr.slice(0, 7); // 'YYYY-MM'
          if (!monthMap[month]) {
            monthMap[month] = { sum: 0, count: 0 };
          }
          monthMap[month].sum += total;
          monthMap[month].count += 1;
        });

        // Вычисляем среднее по дням
        const avgPerMonth = Object.entries(monthMap).map(([month, { sum, count }]) => ({
          month,
          average: Math.round(sum / count)
        }));

        // Сортировка по месяцам
        avgPerMonth.sort((a, b) => a.month.localeCompare(b.month));

        setMonthlyAverages2025(avgPerMonth);

        // Подготовка данных для сравнения 2024 vs 2025
        const dailyTotalsByYear = {
          '2024': {},
          '2025': {}
        };
        
        const todayStr = new Date().toISOString().slice(0, 10);

        dataRows.forEach(row => {
          const dateStr = row['Дата'];
          const count = parseFloat(row['Количество']) || 0;
          const dateObj = new Date(dateStr);
          if (isNaN(dateObj)) return;
        
          const year = dateObj.getFullYear();
          if (year !== 2024 && year !== 2025) return;
        
          const dayKey = dateObj.toISOString().slice(0, 10);
          if (dayKey === todayStr) return; // исключаем сегодняшнюю дату
          if (holidays.has(dayKey)) return; // исключаем праздничные дни
        
          const dayOfWeek = dateObj.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) return; // исключаем выходные (вс и сб)
        
          if (!dailyTotalsByYear[year][dayKey]) {
            dailyTotalsByYear[year][dayKey] = 0;
          }
          dailyTotalsByYear[year][dayKey] += count;
        });
        
        
        
        const monthlySums = {
          '2024': {},
          '2025': {}
        };
        
        Object.entries(dailyTotalsByYear).forEach(([year, dayMap]) => {
          Object.entries(dayMap).forEach(([day, total]) => {
            const monthKey = day.slice(5, 7); // '01'...'12'
            if (!monthlySums[year][monthKey]) {
              monthlySums[year][monthKey] = { sum: 0, count: 0 };
            }
            monthlySums[year][monthKey].sum += total;
            monthlySums[year][monthKey].count += 1;
          });
        });
        

        const monthOrder = ['01','02','03','04','05','06','07','08','09','10','11','12'];

        const combinedMonthly = monthOrder.map(month => ({
          month,
          avg2024: monthlySums['2024'][month] ? Math.round(monthlySums['2024'][month].sum / monthlySums['2024'][month].count) : 0,
          avg2025: monthlySums['2025'][month] ? Math.round(monthlySums['2025'][month].sum / monthlySums['2025'][month].count) : 0
        }));

        setMonthlyComparison(combinedMonthly);

      });
  }, []);

  const renderCustomLegend = (props) => {
    const { payload } = props;
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {[...payload].reverse().map((entry, index) => (
          <li key={`item-${index}`} style={{ color: entry.color, marginBottom: 4 }}>
            <span style={{ marginRight: 8, display: 'inline-block', width: 12, height: 12, backgroundColor: entry.color }}></span>
            {entry.value}
          </li>
        ))}
      </ul>
    );
  };
  
  return (
    <div style={{ width: '100vw', height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      <h2>Накопительный график по профессиям за последние 7 дней</h2>
      <ResponsiveContainer width="100%" height={"90%"}>
        <BarChart data={chartData} stackOffset="normal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatDateWithWeekday} />
          <YAxis  domain={[0, (dataMax) => Math.max(1000, Math.ceil(dataMax * 1.2))]}/>
          <Tooltip content={renderCustomTooltip} />
          <Legend content={renderCustomLegend} verticalAlign="middle" align="right" layout="vertical" />
          
          {professions.map((prof, i) => (
            <Bar
              key={prof}
              dataKey={prof}
              stackId="people"
              name={prof}
              fill={`hsl(${(i * 55) % 360}, 70%, 60%)`}
            >
              <LabelList dataKey={prof} position="center" style={{ fontSize: 10, fontWeight: 'bold', fill: 'black' }} />
            </Bar>
          ))}

          {/* Общее количество над столбиком */}
          <Bar dataKey="total" fill="transparent">
            <LabelList dataKey="total" position="top" fontWeight="bold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <h2>Среднее количество людей в день по месяцам (2025)</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={monthlyAverages2025}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="average" name="Среднее в день" fill="#6dbb6d">
            <LabelList dataKey="average" position="center" style={{ fill: 'black', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <h2>Сравнение среднего количества людей по месяцам: 2024 vs 2025 (выходные и праздники исключены)</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={monthlyComparison}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={(m) =>
              ({
                '01': 'янв', '02': 'фев', '03': 'мар', '04': 'апр',
                '05': 'май', '06': 'июн', '07': 'июл', '08': 'авг',
                '09': 'сен', '10': 'окт', '11': 'ноя', '12': 'дек'
              }[m] || m)
            }
          />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="avg2024" name="2024" fill="#8884d8">
            <LabelList dataKey="avg2024" position="center" style={{ fill: 'black', fontSize: 12 }} />
          </Bar>
          <Bar dataKey="avg2025" name="2025" fill="#6dbb6d">
            <LabelList dataKey="avg2025" position="" style={{ fill: 'black', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PeopleReportCharts;
