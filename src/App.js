import React, { useState} from "react";

// Список категорий и их соответствующих наименований техники
const categoryOptions = {
    "Автобетононасосы": ["Автобетононасос (стрела 37м)", "Автобетононасос (стрела 42м)", "Автобетононасос (стрела 50м)"],
    "Автобетоносмесители": ["Автобетоносмеситель (5м3)", "Автобетоносмеситель (7м3)", "Автобетоносмеситель (10м3)", "Автобетоносмеситель (самоходный 2м3)"],
    "Автокраны": ["Автокран (25т)", "Автокран (30т)", "Автокран (70т)"],
    "Газели": ["Газель (грузовая кузов-3м)", "Газель (грузовая кузов-4м)", "Газель (грузовая кузов-6м)", "Газель (грузопассажирская кузов-2м)", "Газель (пассажирская)"],
    "Длинномеры": ["Длинномер (9м)", "Длинномер (12м)", "Длинномер (16м)"],
    "Катки": ["Каток вибрационный (10тн)", "Каток вибрационный (3тн)", "Каток грунтовый (16тн)", "Каток дорожный (4тн)"],
    "Манипуляторы": ["Манипулятор"],
    "Погрузчики": ["Погрузчик 2м3", "Погрузчик 3м3", "Погрузчик (мини)", "Погрузчик (вилочный)"],
    "Самосвалы": ["Самосвал (20т)", "Самосвал (15т)"],
    "Спецтехника": ["Автогрейдер", "Асфальтоукладчик", "Бульдозер", "Дизельная электростанция", "Компрессор", "Поливомоечная машина", "Ассенизаторная машина", "Пробивочная установка (для труб)"],
    "Экскаваторы": ["Экскаватор гусеничный (с ковшом)", "Экскаватор гусеничный (с гидромолотом)", "Экскаватор колесный (с ковшом)", "Экскаватор колесный (с гидромолотом)"],
    "Экскаваторы-Погрузчики": ["Экскаватор-Погрузчик (с ковшом)", "Экскаватор-Погрузчик (с гидромолотом)", "Экскаватор-Погрузчик (с буроямом)"]
};

// Список категорий объектов
const objectCategoryOptions = {
    "Строительство жилых домов": ["Брик таун", "Нурлы Жол 3", "СПОРТ 2", "Элитка"],
    "Строительство и реконструкция туристических объектов": ["Бухтарма", "Горная Ульбинка"],
    "Строительство и реконструкция частных объектов": ["Нуртау", "Зимовьё", "Орлан ИЖД-1", "Орлан ИЖД-2", "Урунтаева 12/1", "Каменный карьер"],
    "Строительство и ремонт дорог": ["Развязка", "Дороги НЖ 4,5", "Дорога Шале ла Бале"],
    "Строительство коммерческих объектов": ["Коммерческие объекты", "Коммерческие помещения в жилых домах"],
    "Строительство линейных объектов и благоустройство": ["Бухтарма", "Благоустройство", "Инженерные сети"],
    "Строительство объектов инфраструктуры": ["Ветлаборатория", "Резиденция", "Учебные заведения", "Хилтон", "Бизнес центр пр.Победы"],
    "Строительство производственных объектов": ["База Эскор", "Новоявленка", "Парыгино", "База Самарское", "Цех брусчатки"]
};

// Список объектов и позиций/строений
const objectPositionOptions = {
    "Брик таун": ["Брик Таун 1", "Брик Таун 2"],
    "Нурлы Жол 3": ["поз. 57", "поз. 58", "поз. 59", "поз. 63", "поз. 65", "поз. 69", "поз. 56", "поз. 60", "поз. 64", "поз. 72", "Экополис", "Стройгородок НЖ3"],
    "СПОРТ 2": ["поз. 100", "поз. 101", "поз. 73-75", "поз. 74", "поз. 76", "поз. 93"],
    "Элитка": ["Элитка"],
    "Развязка": ["Развязка"],
    "Дороги НЖ 4,5": ["Дороги НЖ 4,5"],
    "Бухтарма": ["Сети и благоустройство", "Мелада", "Орлан", "Черемушки"],
    "Благоустройство": ["СПОРТ 2", "Благоустройство НЖ3", "Гребной канал"],
    "Инженерные сети": ["Сети ТС и НВК НЖ 3", "Сети ОВ ВК СПОРТ 2", "КОС", "Коллектор",  "Сети ОВ ВК НЖ 4,5", "Сети Эл НЖ 4,5"],
    "Ветлаборатория": ["Ветлаборатория"],
    "Резиденция": ["Резиденция"],
    "Учебные заведения": ["Комфортная школа", "Ледовый каток", "Лицей", "Дет.сад НЖ"],
    "Хилтон": ["Хилтон"],
    "Бизнес центр пр.Победы": ["Бизнес центр пр.Победы"],
    "База Эскор": ["База Эскор"],
    "Новоявленка": ["Комбинат ПГС"],
    "Парыгино": ["БСУ"],
    "База Самарское": ["База Самарское"],
    "Цех брусчатки": ["Цех брусчатки"],
    "Горная Ульбинка": ["Орленок"],
    "Нуртау": ["Нуртау"],
    "Зимовьё": ["Зимовьё"],
    "Орлан ИЖД-1": ["Орлан ИЖД-1"],
    "Орлан ИЖД-2": ["Орлан ИЖД-2"],
    "Урунтаева 12/1": ["Урунтаева 12/1"],
    "Каменный карьер": ["Каменный карьер"],
    "Дорога Шале ла Бале": ["Дорога Шале ла Бале"],
    "Коммерческие объекты": ["ROYAL B", "Автомойка (АТХ)", "Автомойка (Нурлы Жол)", "Кафе Бистро", "Кренделия"],
    "Коммерческие помещения в жилых домах": ["Магазин Жибек Жолы 3", "Медцентр Жибек Жолы", "поз. 107 (Детский сад)", "поз. 107 КП", "поз. 13/1 КП", "поз. 49/1 КП", "поз. 50/1 КП (Салон Красоты)", "поз. 53/2 КП"]
};

// Часы для выбора времени
const hoursOptions = Array.from({ length: 17 }, (_, i) => i + 6);

// Опции для количества от 1 до 10
const quantityOptions = Array.from({ length: 10 }, (_, i) => i + 1);

const App = () => {
    const [requests, setRequests] = useState([
        { date: "", startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "" }
    ]);

    const handleChange = (index, field, value) => {
        const newRequests = [...requests];
        newRequests[index][field] = value;

        if (field === "objectCategory") newRequests[index].object = "";
        if (field === "object") newRequests[index].position = "";
        if (field === "category") newRequests[index].equipmentName = "";

        setRequests(newRequests);
    };

    const isRequestComplete = (request) => {
        return Object.values(request).every(value => value !== "");
    };

    const addRequest = () => {
        if (!isRequestComplete(requests[requests.length - 1])) {
            alert("Пожалуйста, заполните все поля перед добавлением новой техники.");
            return;
        }

        setRequests([...requests, { date: "", startTime: "", endTime: "", objectCategory: "", object: "", position: "", category: "", equipmentName: "", quantity: "" }]);
    };

    const removeLastRequest = () => {
        if (requests.length > 1) {
            setRequests(requests.slice(0, -1));
        }
    };

    const submitRequest = async () => {
        for (let request of requests) {
            if (!isRequestComplete(request)) {
                alert("Пожалуйста, заполните все поля перед отправкой заявки.");
                return;
            }
        }

        console.log("Отправляемые данные:", requests);
        try {
            await fetch("https://script.google.com/macros/s/AKfycbyO_mlr59-aKk04-fRJt9JBopHDOajLUIqs4gLT47Vft2ZQBylto5-kxKe3HOs27fWU/exec", {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requests),
            });

            alert("Заявка отправлена!");
            setRequests([{ date: "", startTime: "", endTime: "", object: "", category: "", equipmentName: "", quantity: "", objectCategory: "" }]);
        } catch (error) {
            console.error("Ошибка при отправке:", error);
            alert("Ошибка при отправке заявки!");
        }
    };

    return (
        <div style={styles.container}>
            <h2>Заявка на технику</h2>
            {requests.map((request, index) => (
                <div key={index} style={styles.formBlock}>
                    <label>Введите дату:</label>
                    <input type="date" value={request.date} onChange={e => handleChange(index, "date", e.target.value)} />

                    <label>Укажите время начала работы:</label>
                    <select value={request.startTime} onChange={e => handleChange(index, "startTime", e.target.value)}>
                        <option value="">Выберите время</option>
                        {hoursOptions.map(hour => (
                            <option key={hour} value={hour}>{hour}:00</option>
                        ))}
                    </select>

                    <label>Укажите время окончания работы:</label>
                    <select value={request.endTime} onChange={e => handleChange(index, "endTime", e.target.value)}>
                        <option value="">Выберите время</option>
                        {hoursOptions.map(hour => (
                            <option key={hour} value={hour}>{hour}:00</option>
                        ))}
                    </select>

                    {/* Категория и объект (новый порядок) */}
                    <label>Категория объекта:</label>
                    <select 
                        value={request.objectCategory} 
                        onChange={e => handleChange(index, "objectCategory", e.target.value)}
                    >
                        <option value="">Выберите категорию объекта</option>
                        {Object.keys(objectCategoryOptions).map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>

                    <label>Объект:</label>
                    <select 
                        value={request.object} 
                        onChange={e => handleChange(index, "object", e.target.value)}
                        disabled={!request.objectCategory}
                    >
                        <option value="">Выберите объект</option>
                        {objectCategoryOptions[request.objectCategory]?.map(obj => (
                            <option key={obj} value={obj}>{obj}</option>
                        ))}
                    </select>

                    <label>Позиция или строение:</label>
                    <select
                        value={request.position}
                        onChange={e => handleChange(index, "position", e.target.value)}
                        disabled={!request.object}
                    >
                        <option value="">Выберите позицию</option>
                        {(objectPositionOptions[request.object] || []).map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                        ))}
                    </select>

                    <label>Выберите категорию техники:</label>
                    <select value={request.category} onChange={e => handleChange(index, "category", e.target.value)}>
                        <option value="">Выберите категорию</option>
                        {Object.keys(categoryOptions).map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>

                    <label>Выберите наименование техники:</label>
                    <select value={request.equipmentName} onChange={e => handleChange(index, "equipmentName", e.target.value)} disabled={!request.category}>
                        <option value="">Выберите наименование</option>
                        {(categoryOptions[request.category] || []).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>

                    <label>Количество:</label>
                    <select value={request.quantity} onChange={e => handleChange(index, "quantity", e.target.value)}>
                        <option value="">Выберите количество</option>
                        {quantityOptions.map(quantity => (
                            <option key={quantity} value={quantity}>{quantity}</option>
                        ))}
                    </select>
                </div>
            ))}
            <button onClick={addRequest} style={styles.addButton}>Добавить технику</button>
            {requests.length > 1 && (
                <button onClick={removeLastRequest} style={styles.backButton}>Назад</button>
            )}
            <button onClick={submitRequest} style={styles.submitButton}>Отправить заявку</button>
        </div>
    );
};

// Стили
const styles = {
    container: { maxWidth: "600px", margin: "20px auto", padding: "20px", border: "1px solid #ddd", borderRadius: "10px", textAlign: "center" },
    formBlock: { marginBottom: "15px", padding: "10px", border: "1px solid #ccc", borderRadius: "5px", display: "flex", flexDirection: "column", gap: "5px", textAlign: "left" },
    addButton: { marginRight: "10px", padding: "10px", background: "#007bff", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" },
    backButton: { marginRight: "10px", padding: "10px", background: "#dc3545", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" },
    submitButton: { padding: "10px", background: "green", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }
};

export default App;
