import React from "react";
import { useNavigate } from "react-router-dom";

const links = [
  ["ГПР фасады", "https://docs.google.com/spreadsheets/d/1WcB1F8B8vdth1DHwa6UkKSfMag1UmDzRWcuHik9kUEA/edit?gid=1442365195#gid=1442365195"],
  ["ГПР окна", "https://docs.google.com/spreadsheets/d/15E7jdK310ydLtpFyo8M90C9vZGgK5zOb2NQNbb6iXx4/edit?gid=312064548#gid=312064548"],
  ["ГПР 56", "https://docs.google.com/spreadsheets/d/17AI7UxLpSTciFxWusMrYAVhH88ljbV7sR8mw_Deuq6I/edit?gid=715655887#gid=715655887"],
  ["ГПР 64, 72", "https://docs.google.com/spreadsheets/d/1eC80R11Hp26IVfLLa4M-_wnYGqTRHEi6k2_XG5Goqf0/edit?gid=1442365195#gid=1442365195"],
  ["ГПР 59, 63, 65, 69", "https://docs.google.com/spreadsheets/d/1EkK07BEs0kcK29Yc6z7j3KFX8i_04AFAKv91zbuZKK8/edit?gid=1280373855#gid=1280373855"],
  ["Нурлы Жол 4", "https://docs.google.com/spreadsheets/d/102E0nzIE4gyp_t4HNozvy4w-dZAa8rZ_oqx_L5IAPjQ/edit?gid=2061216150#gid=2061216150"],
  ["Нурлы Жол 5", "https://docs.google.com/spreadsheets/d/1hbfMRSH7wsP5KhSDk5Tuk79pirvftOC_tFXHHWryPIg/edit?gid=349533101#gid=349533101"],
  ["СПОРТ", "https://docs.google.com/spreadsheets/d/1I1zCQjPKGjZmRp2yIr23shae6SXMV-I6YO-rDGzvBgA/edit?gid=900431353#gid=900431353"],
  ["Развязка", "https://docs.google.com/spreadsheets/d/16F_1zGQxSxNazg-Bp3mKlJHBn311S0TsUhwCuMxApoE/edit?gid=734904054#gid=734904054"],
  ["Brick Town 2-3", "https://docs.google.com/spreadsheets/d/1k7zGcNHeM1qXXNzEBO7NCNowSp_rd2oxxl0t86dElRY/edit?gid=1424695791#gid=1424695791"],
  ["Каток", "https://docs.google.com/spreadsheets/d/17o-Sg8XtD6Fd46RlUOSo1ISFixM3yVtJ-YP-MAg_7Lo/edit?gid=547110401#gid=547110401"],
  ["КОС", "https://docs.google.com/spreadsheets/d/1WcwgMl16rUmxa9OgK0-RuOlbAAs-PjwqDgHIkYXEGuY/edit?gid=512217105#gid=512217105"],
  ["Экополис", "https://docs.google.com/spreadsheets/d/1kpCz-ltR4JLqy_IzEYHTvypq_DbnFRllZzfc3ck3fC8/edit?gid=512217105#gid=512217105"],
  ["Лицей", "https://docs.google.com/spreadsheets/d/1oV08Yguwl1hBsdhpvZ4m_7-4D4txkOKfjWdOH9xSk8U/edit?gid=35474971#gid=35474971"],
  ["Бизнес центр", "https://docs.google.com/spreadsheets/d/1v1wi9oqjsmgBVaEh3jQSdSZK-dBT6bSaQlMO8DO3s3c/edit?gid=512217105#gid=512217105"],
  ["ГПР ОВ ВК", "https://docs.google.com/spreadsheets/d/160_Nmmj4p0jX5NdJLTpRntoFHDHoxiyZptEVdp0U3mE/edit?gid=1442365195#gid=1442365195"],
];

const charts = [
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RD2xnt0f7hUkra1Kb5wcXlMw4LrUwraZy5WFSWhbtD2sOGR6PewEzCbhG5SmnJ339bdgxUmSnZsl/pubchart?oid=1724880164&format=interactive",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RD2xnt0f7hUkra1Kb5wcXlMw4LrUwraZy5WFSWhbtD2sOGR6PewEzCbhG5SmnJ339bdgxUmSnZsl/pubchart?oid=888582029&format=interactive",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RD2xnt0f7hUkra1Kb5wcXlMw4LrUwraZy5WFSWhbtD2sOGR6PewEzCbhG5SmnJ339bdgxUmSnZsl/pubchart?oid=1862897667&format=interactive",
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RD2xnt0f7hUkra1Kb5wcXlMw4LrUwraZy5WFSWhbtD2sOGR6PewEzCbhG5SmnJ339bdgxUmSnZsl/pubchart?oid=95588722&format=interactive",
];

export default function GrafikiPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Графики и отчёты</h1>
          <p style={styles.subtitle}>Быстрый доступ к рабочим графикам и сводным таблицам</p>
        </div>

        <button onClick={() => navigate("/")} style={styles.backButton}>
          На главную
        </button>
      </div>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Открыть графики</h2>

        <div style={styles.linkGrid}>
          {links.map(([title, url]) => (
            <button
              key={title}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              style={styles.linkButton}
            >
              {title}
            </button>
          ))}
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Сводная таблица</h2>

        <iframe
          title="Сводная таблица 1"
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vS2B6IUtUAsUwg-GbEaWg9DxBQ7JuUr-dvsgBxnMdClV1nhbIwJMWvZdMW21RKhaSixB8bCkGWMcejV/pubhtml?widget=true&headers=false"
          style={styles.tableFrame}
        />

        <iframe
          title="Основной график"
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vS2B6IUtUAsUwg-GbEaWg9DxBQ7JuUr-dvsgBxnMdClV1nhbIwJMWvZdMW21RKhaSixB8bCkGWMcejV/pubchart?oid=1559205188&format=interactive"
          style={styles.mainChartFrame}
        />

        <iframe
          title="Сводная таблица 2"
          src="https://docs.google.com/spreadsheets/d/e/2PACX-1vR9RD2xnt0f7hUkra1Kb5wcXlMw4LrUwraZy5WFSWhbtD2sOGR6PewEzCbhG5SmnJ339bdgxUmSnZsl/pubhtml?gid=1177634486&single=true&widget=true&headers=false"
          style={styles.tableFrame}
        />
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Интерактивные графики</h2>

        <div style={styles.chartGrid}>
          {charts.map((src, index) => (
            <div key={src} style={styles.chartCell}>
              <iframe
                title={`Интерактивный график ${index + 1}`}
                src={src}
                scrolling="no"
                style={styles.chartFrame}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    padding: "30px",
    fontFamily: "Arial, sans-serif",
  },

  header: {
    maxWidth: "1400px",
    margin: "0 auto 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
  },

  title: {
    margin: 0,
    fontSize: "32px",
  },

  subtitle: {
    margin: "8px 0 0",
    color: "#666",
    fontSize: "16px",
  },

  backButton: {
    padding: "10px 18px",
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
  },

  card: {
    maxWidth: "1400px",
    margin: "0 auto 24px",
    background: "#ffffff",
    borderRadius: "14px",
    padding: "22px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
  },

  sectionTitle: {
    margin: "0 0 18px",
    fontSize: "22px",
  },

  linkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
  },

  linkButton: {
    minHeight: "46px",
    padding: "10px 12px",
    fontSize: "14px",
    background: "#007bff",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },

  tableFrame: {
    width: "100%",
    height: "220px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    marginBottom: "18px",
  },

  mainChartFrame: {
    width: "100%",
    height: "520px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    marginBottom: "18px",
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(520px, 1fr))",
    gap: "20px",
  },

  chartCell: {
    height: "760px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#ffffff",
  },

  chartFrame: {
    width: "120%",
    height: "900px",
    border: 0,
    transform: "scale(0.8333)",
    transformOrigin: "0 0",
  },
};