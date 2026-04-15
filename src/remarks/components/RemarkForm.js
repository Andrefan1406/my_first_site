import React, { useState } from "react";

export default function RemarkForm({ onAddRemark }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0] || null;
    setPhoto(file);

    if (!file) {
      setPhotoPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!text.trim()) return;

    const newRemark = {
      id: Date.now(),
      text: text.trim(),
      photo,
      photoPreview,
    };

    onAddRemark(newRemark);

    setText("");
    setPhoto(null);
    setPhotoPreview("");
    e.target.reset();
  };

  return (
    <form onSubmit={handleSubmit} className="remark-form">
      <h2>Новое замечание</h2>

      <textarea
        placeholder="Описание..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="remark-textarea"
      />

      <input
        type="file"
        accept="image/*"
        onChange={handlePhotoChange}
        className="remark-file-input"
      />

      {photoPreview && (
        <div className="remark-preview">
          <img
            src={photoPreview}
            alt="Предпросмотр"
            className="remark-preview-image"
          />
        </div>
      )}

      <button type="submit" className="remark-button">
        Добавить
      </button>
    </form>
  );
}