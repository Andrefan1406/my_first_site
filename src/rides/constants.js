// Тот же email, что server/adminAuth.js признаёт главным админом сайта.
// В системе поездок у него нет своей роли/записи в rides.users — он
// только назначает роли другим на /rides-admin и читает (без права
// правки) справочники водителей/машин, которые полноценно ведёт диспетчер.
export const SITE_ADMIN_EMAIL = "admin@vkdev.kz";

// Куда ведёт роль в системе поездок — единый источник для RideAccessGate.jsx
// (запирает сюда тех, у кого нет full_site_access) и для мест вроде
// HomePage.js (даёт обычным пользователям с полным доступом ссылку назад
// на их страницу поездок).
export const ROLE_HOME_PATH = {
  employee: "/employee",
  dispatcher: "/dispatcher",
  driver: "/driver",
};
