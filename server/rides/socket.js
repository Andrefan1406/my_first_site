// Socket.io для системы поездок: три типа комнат — 'drivers' (все свободные
// водители, broadcast о новых/забранных заявках пула), 'dispatcher'
// (мониторинг диспетчером) и 'employee:{id}' (уведомление конкретного
// сотрудника, что его заказ взяли). Комнату сокет получает не по слову
// клиента, а по роли из rides.users после проверки Firebase ID-токена —
// иначе любой мог бы подключиться с auth:{room:'employee:5'} и подслушивать
// чужие заявки (там телефон заказчика).
const { Server } = require('socket.io');
const { getAuth } = require('firebase-admin/auth');
const { findRideUserByEmail } = require('./auth');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Не передан токен авторизации'));
    try {
      const decoded = await getAuth().verifyIdToken(token);
      const rideUser = findRideUserByEmail(decoded.email);
      if (!rideUser) return next(new Error('Вы не добавлены как пользователь системы служебного транспорта'));
      socket.rideUser = rideUser;
      next();
    } catch (err) {
      next(new Error('Недействительный или просроченный токен авторизации'));
    }
  });

  io.on('connection', (socket) => {
    const { role, id } = socket.rideUser;
    if (role === 'driver') socket.join('drivers');
    if (role === 'dispatcher' || role === 'admin') socket.join('dispatcher');
    if (role === 'employee') socket.join(`employee:${id}`);
  });

  return io;
}

function emitToDrivers(event, payload) {
  io?.to('drivers').emit(event, payload);
}

function emitToDispatcher(event, payload) {
  io?.to('dispatcher').emit(event, payload);
}

function emitToEmployee(employeeId, event, payload) {
  io?.to(`employee:${employeeId}`).emit(event, payload);
}

module.exports = { initSocket, emitToDrivers, emitToDispatcher, emitToEmployee };
