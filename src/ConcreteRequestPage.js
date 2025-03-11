import React from 'react';

const ConcreteRequestPage = () => {
  return (
    <div style={styles.container}>
      <h2>Заявка на бетон и раствор</h2>
      <iframe
        src="https://docs.google.com/forms/d/e/1FAIpQLSekd_3mHImM12QThc5k99lKk7w745VaZTAZ2cxNONjlCz6xYA/viewform?embedded=true"
        width="100%"
        height="600"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Concrete Request Form"
      >
        Загрузка…
      </iframe>
      
      <h2>Таблица заявок</h2>
      <iframe
        src="https://docs.google.com/spreadsheets/d/1_zfhwqp5B7oAlYX5olOJLOwEWmBgI-rTzPd9mFTDLlU/preview?rm=minimal&range=A1:M89"
        width="100%"
        height="500"
        style={styles.iframe}
        frameBorder="0"
        marginHeight="0"
        marginWidth="0"
        title="Concrete Request Table"
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

export default ConcreteRequestPage;
