import React, { useState } from "react";
import RemarkForm from "./components/RemarkForm";
import "./styles/remarks.css";

export default function RemarksPage() {
  const [remarks, setRemarks] = useState([]);

  const handleAddRemark = (newRemark) => {
    setRemarks((prev) => [newRemark, ...prev]);
  };

  return (
    <div className="remarks-page">
      <div className="remarks-container">
        <h1>Замечания</h1>

        <RemarkForm onAddRemark={handleAddRemark} />

        <div className="remarks-list">
          <h2>Список замечаний</h2>

          {remarks.length === 0 ? (
            <p className="remarks-empty">Пока замечаний нет.</p>
          ) : (
            remarks.map((remark) => (
              <div key={remark.id} className="remark-card">
                <p className="remark-text">{remark.text}</p>

                {remark.photoPreview && (
                  <img
                    src={remark.photoPreview}
                    alt="Фото замечания"
                    className="remark-card-image"
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}