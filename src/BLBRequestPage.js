import React from "react";
import styles from './RequestPage.module.css';

const BLBRequestPage = () => {
    return(
        <div className={styles.widecontainer}>
            <h2>Заявка на брусчатку, лотки и бордюры</h2>
            <table className={styles.requestTable}>
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Изделие</th>
                        <th>Марка</th>
                        <th>Цвет</th>
                        <th>Размеры</th>
                    </tr>
                </thead>
            </table>
        </div>
    );
};

export default BLBRequestPage;