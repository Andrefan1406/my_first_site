import React from 'react';

const ElectricansRequestPage = () => {
  return (
    <div style={styles.container}>
      <h2>Заявка электриков</h2>
      <iframe
        src="https://docs.google.com/forms/d/e/1FAIpQLSceW1WPo3H2zsA2FU5nVYWjTexzCzGEoBYDpDFWqRQRTHIlLg/viewform?embedded=true"
        width="100%"
        height="600"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Electricans Request Form"
      >
        Загрузка…
      </iframe>
      
      <h2>Таблица заявок</h2>
      <iframe
        src="https://docs.google.com/spreadsheets/d/1oyWrOnkF6y5IEpnaQYcz24pZbxp6MIYrjUdYJUz2CLQ/preview?rm=minimal&range=A1:F100"
        width="100%"
        height="500"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Electricans Request Table"
      >
        Загрузка…
      </iframe>
    </div>
  );
};

const styles = {
  container: {
    maxWidth: "900px",
    margin: "20px auto",
    padding: "20px",
    textAlign: "center",
  },
  iframe: {
    border: "none",
  },
};

export default ElectricansRequestPage;
