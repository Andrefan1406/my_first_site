import React, { useState } from "react";

const TestRequestPage = () => {
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async () => {
    if (!name || !phone || !message) {
      alert("Заполните все поля!");
      return;
    }

    setIsSending(true);

    const payload = [{
      date: date,
      category: category,
      name: name,
      phone: phone,
      message: message
    }];

    try {
      await fetch("https://script.google.com/macros/s/AKfycbwibKfp0sHH7BfcYBr45vuRnMw6GSNpqFpgd1dVo6DHFxcARogJY9Ne_v0206hl2OWQ/exec", {
        method: "POST",
        mode: "no-cors", // обходим CORS
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      alert("Данные отправлены!");
      setDate("");
      setCategory("");
      setName("");
      setPhone("");
      setMessage("");
    } catch (error) {
      console.error("Ошибка отправки:", error);
      alert("Ошибка при отправке!");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ maxWidth: "900px", margin: "40px auto" }}>
      <h2 style={{ textAlign: "center" }}>Тестовая форма</h2>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "center"
        }}
      >
        <thead>
          <tr>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Дата</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Категория объекта</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Имя</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Телефон</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Сообщение</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>Действие</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <input
                type="text"
                placeholder="Укажите дату"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <input
                type="text"
                placeholder="Категория объекта"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <input
                type="text"
                placeholder="Ваше имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <input
                type="text"
                placeholder="Телефон"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <input
                type="text"
                placeholder="Сообщение"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ width: "100%", padding: "6px" }}
              />
            </td>
            <td style={{ border: "1px solid #ccc", padding: "8px" }}>
              <button
                onClick={handleSubmit}
                disabled={isSending}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#007bff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "5px",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                {isSending ? "Отправка..." : "Отправить"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default TestRequestPage;
