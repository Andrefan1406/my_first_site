// ВРЕМЕННАЯ страница для тестирования семантического поиска по расценкам без
// авторизации. Маршрут /rascenki-test смонтирован в App.js ВНЕ <Protected>.
// Переиспользует ConcreteChatPage в режиме одного домена (soloDomain) без
// сайдбара и без логирования в Firestore.
//
// TODO: удалить этот файл, импорт и маршрут /rascenki-test в App.js, а также
// проп soloDomain/disableUsageLog в ConcreteChatPage, когда тестирование
// закончится.
import React from "react";
import ConcreteChatPage from "./ConcreteChatPage";

const RascenkiSearchTestPage = () => (
  <ConcreteChatPage soloDomain="rascenki" disableUsageLog />
);

export default RascenkiSearchTestPage;
