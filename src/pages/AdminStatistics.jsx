import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore";

import { db } from "../firebase";

const PAGE_NAMES = {
  "/": "Главная",
  "/request": "Заявка на технику",
  "/electricans-request": "Заявка электриков",
  "/geo-request": "Заявка геодезистов",
  "/concrete-request2": "Заявка на бетон",
  "/blbrequest": "Заявка на брусчатку, лотки, бордюры",
  "/znbrequest": "Заявка на жби",
  "/lab-request": "Заявка на лабораторные испытания",
  "/people-report": "Ежедневный отчет по людям",
  "/reports-dashboard": "Панель отчетов",
  "/people-dashboard": "Панель по людям",
  "/equipment-report": "Отчет по технике",
  "/people-charts": "Графики по людям",
  "/concrete-report": "Отчет по бетону",
  "/rag": "ИИ-поиск",
  "/remarks": "Замечания",
  "/def-act": "Дефектный акт",
  "/grafiki": "Графики",
  "/admin/statistics": "Статистика администратора",
};

const EXCLUDED_EMAILS = ["admin@vkdev.kz"];
const EXCLUDED_TOP_PAGES = [
  "/",
  "/admin/statistics",
  "/login"
];

function getPageName(page) {
  return PAGE_NAMES[page] || page || "Неизвестная страница";
}

function isToday(date) {
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isCurrentMonth(date) {
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

export default function AdminStatistics() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVisits();
  }, []);

  async function loadVisits() {
    try {
      const q = query(
        collection(db, "page_views"),
        orderBy("timestamp", "desc"),
        limit(1000)
      );

      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setVisits(data);
    } catch (error) {
      console.error("Ошибка загрузки статистики:", error);
    } finally {
      setLoading(false);
    }
  }

  const visitsWithDate = visits
  .map((visit) => {
    const date = visit.timestamp?.toDate ? visit.timestamp.toDate() : null;

    return {
      ...visit,
      date,
      pageValue: visit.page || visit.path || "unknown",
    };
  })
  .filter((visit) => visit.date)
  .filter((visit) => !EXCLUDED_EMAILS.includes(visit.email))
  .filter((visit) => visit.pageValue !== "/admin/statistics");

  const todayVisits = visitsWithDate.filter((visit) => isToday(visit.date));

  const monthVisits = visitsWithDate.filter((visit) =>
    isCurrentMonth(visit.date)
  );

  const todayUsers = new Set(
    todayVisits.map((visit) => visit.email).filter(Boolean)
  );

  const monthUsers = new Set(
    monthVisits.map((visit) => visit.email).filter(Boolean)
  );

  const pageCountsToday = todayVisits.reduce((acc, visit) => {
    const page = visit.pageValue;

    acc[page] = (acc[page] || 0) + 1;

    return acc;
  }, {});

  const topPagesToday = Object.entries(pageCountsToday)
  .filter(([page]) => !EXCLUDED_TOP_PAGES.includes(page))
  .map(([page, count]) => ({
    page,
    name: getPageName(page),
    count,
  }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);

  const mostPopularPage = topPagesToday[0];

  const userCountsToday = todayVisits.reduce((acc, visit) => {
    const email = visit.email || "Без пользователя";

    acc[email] = (acc[email] || 0) + 1;

    return acc;
  }, {});

  const topUsersToday = Object.entries(userCountsToday)
    .map(([email, count]) => ({
      email,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

    const latestVisits = visitsWithDate
    .filter(
      (visit) =>
        visit.pageValue !== "/" &&
        visit.pageValue !== "/login" &&
        visit.pageValue !== "/admin/statistics"
    )
    .slice(0, 20);

  if (loading) {
    return (
      <div style={styles.page}>
        <h1>Статистика пользователей</h1>
        <p>Загрузка статистики...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Статистика пользователей</h1>

      <div style={styles.cards}>
        <div style={styles.card}>
          <div style={styles.cardLabel}>Пользователей сегодня</div>
          <div style={styles.cardValue}>{todayUsers.size}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Посещений сегодня</div>
          <div style={styles.cardValue}>{todayVisits.length}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Активных за месяц</div>
          <div style={styles.cardValue}>{monthUsers.size}</div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardLabel}>Самая популярная страница</div>
          <div style={styles.cardText}>
            {mostPopularPage
              ? `${mostPopularPage.name} — ${mostPopularPage.count}`
              : "Нет данных"}
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <h2>ТОП страниц за сегодня</h2>

        {topPagesToday.length === 0 ? (
          <p>Сегодня посещений пока нет.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>№</th>
                <th style={styles.th}>Страница</th>
                <th style={styles.th}>URL</th>
                <th style={styles.th}>Просмотров</th>
              </tr>
            </thead>

            <tbody>
              {topPagesToday.map((item, index) => (
                <tr key={item.page}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}>{item.page}</td>
                  <td style={styles.td}>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.section}>
        <h2>ТОП-10 пользователей за сегодня</h2>

        {topUsersToday.length === 0 ? (
          <p>Сегодня пользователей пока нет.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>№</th>
                <th style={styles.th}>Пользователь</th>
                <th style={styles.th}>Посещений</th>
              </tr>
            </thead>

            <tbody>
              {topUsersToday.map((item, index) => (
                <tr key={item.email}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.td}>{item.email}</td>
                  <td style={styles.td}>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.section}>
        <h2>Последние посещения</h2>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Дата</th>
              <th style={styles.th}>Пользователь</th>
              <th style={styles.th}>Страница</th>
              <th style={styles.th}>URL</th>
            </tr>
          </thead>

          <tbody>
            {latestVisits.map((visit) => (
              <tr key={visit.id}>
                <td style={styles.td}>
                  {visit.date.toLocaleString("ru-RU")}
                </td>
                <td style={styles.td}>{visit.email || "-"}</td>
                <td style={styles.td}>{getPageName(visit.pageValue)}</td>
                <td style={styles.td}>{visit.pageValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "30px",
    fontFamily: "Arial, sans-serif",
    background: "#f5f6f8",
    minHeight: "100vh",
  },
  title: {
    marginBottom: "24px",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  card: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "18px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardLabel: {
    color: "#666",
    fontSize: "14px",
    marginBottom: "8px",
  },
  cardValue: {
    fontSize: "32px",
    fontWeight: "700",
  },
  cardText: {
    fontSize: "18px",
    fontWeight: "600",
  },
  section: {
    background: "#ffffff",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "2px solid #ddd",
    background: "#fafafa",
  },
  td: {
    padding: "10px",
    borderBottom: "1px solid #eee",
  },
};