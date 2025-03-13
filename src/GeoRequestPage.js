import React from 'react';

const GeoRequestPage = () => {
  return (
    <div style={styles.container}>
      <h2>Заявка геодезистов</h2>
      <iframe
        src="https://docs.google.com/forms/d/e/1FAIpQLSedm7j1qEgAXnmKvkKVZf4iR7URVLgzA2DnyETh5Ps9wOM5OQ/viewform?embedded=true"
        width="100%"
        height="600"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Geo Request Form"
      >
        Загрузка…
      </iframe>
      
      <h2>Таблица заявок</h2>
      <iframe
        src="https://docs.google.com/spreadsheets/d/1Ex259GvuMmGZk96rLJOFGwn41Q1sWq9h9ITjSycmKXM/preview?rm=minimal&range=A1:F40"
        width="100%"
        height="500"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Geo Request Table"
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

export default GeoRequestPage;
