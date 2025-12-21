import React, { useState } from "react";

const API_URL = `${process.env.REACT_APP_RAG_API_URL}/chat`;

const RagPage = () => {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();
      setAnswer(data.answer || "Нет ответа");
    } catch (e) {
      setAnswer("Ошибка запроса к серверу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h2>RAG-агент</h2>

      <textarea
        rows={4}
        style={{ width: "100%" }}
        placeholder="Введите вопрос…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <br />
      <br />

      <button onClick={ask} disabled={loading}>
        {loading ? "Ищем…" : "Найти"}
      </button>

      <br />
      <br />

      {answer && (
        <div style={{ whiteSpace: "pre-wrap" }}>
          <strong>Ответ:</strong>
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
};

export default RagPage;
