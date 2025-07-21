import React from "react";
import styles from './RequestPage.module.css';

const BLBRequestPage = () => {
    return(
        <div className={styles.widecontainer}>
            <h2>Заявка на брусчатку, лотки и бордюры</h2>
            <table className={styles.requestTable}>
                <thead>
                    <tr>
                        <th>Колонка 1</th>
                        <th>Колонка 2</th>
                        <th>Колонка 3</th>
                        <th>Колонка 4</th>
                        <th>Колонка 5</th>
                    </tr>
                </thead>
            </table>
        </div>
    );
};

export default BLBRequestPage;