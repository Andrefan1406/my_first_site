import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend, LabelList
} from 'recharts';

const PeopleReportCharts = () => {
  const [chartData, setChartData] = useState([]);
  const [professions, setProfessions] = useState([]);

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

        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6);

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
      });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      <h2>Накопительный график по профессиям за последние 7 дней</h2>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={chartData} stackOffset="normal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="middle" align="right" layout="vertical" />
          
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
    </div>
  );
};

export default PeopleReportCharts;
