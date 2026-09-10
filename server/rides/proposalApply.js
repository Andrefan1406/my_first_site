// Применение одобренного предложения по маршруту: правит request_stops,
// перезапускает оценку времени и рассылает обновлённую заявку. Вынесено
// из роутера, потому что тем же кодом пользуется и таймаут-джоба
// (proposalTimeout.js) — она предложение не применяет, но берёт отсюда
// markDecided/notifyProposer, чтобы решение оформлялось единообразно.
const { recomputeRequestEstimate, chooseInsertIndex } = require('./routeEstimate');
const { emitToDispatcher, emitToEmployee, emitToDriver } = require('./socket');
const { getRow, serializeForDriver, serializeForEmployee, serializeForDispatcher, staleThreshold } = require('./requestView');
const { serializeProposal } = require('./stopProposalView');

function markDecided(db, proposalId, status, decidedBy, reason = null) {
  return db
    .prepare(
      `UPDATE stop_proposals
         SET status = ?, decided_by = ?, decision_reason = ?, decided_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    )
    .run(status, decidedBy, reason, proposalId).changes;
}

// Синхронная правка request_stops под действие предложения. Вызывать
// внутри db.transaction(). Координаты точки (lat/lng) к этому моменту уже
// проставлены в самом предложении (геокодятся в роутере при создании) —
// поэтому вставка «по ближайшему участку» работает сразу, не дожидаясь
// общего пересчёта.
function applyProposalStops(db, p) {
  if (p.action === 'add') {
    const stops = db
      .prepare('SELECT stop_order, lat, lng FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC')
      .all(p.request_id);
    const req = db.prepare('SELECT to_lat, to_lng FROM requests WHERE id = ?').get(p.request_id);
    const newC = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
    const chain = [
      req && req.to_lat != null ? { lat: req.to_lat, lng: req.to_lng } : null,
      ...stops.map((s) => (s.lat != null ? { lat: s.lat, lng: s.lng } : null)),
    ];
    const idx = chooseInsertIndex(chain, newC);
    db.prepare('UPDATE request_stops SET stop_order = stop_order + 1 WHERE request_id = ? AND stop_order >= ?')
      .run(p.request_id, idx);
    db.prepare('INSERT INTO request_stops (request_id, address, stop_order, lat, lng) VALUES (?, ?, ?, ?, ?)')
      .run(p.request_id, p.address, idx, p.lat ?? null, p.lng ?? null);
  } else if (p.action === 'edit') {
    db.prepare('UPDATE request_stops SET address = ?, lat = ?, lng = ? WHERE id = ? AND request_id = ?')
      .run(p.address, p.lat ?? null, p.lng ?? null, p.target_stop_id, p.request_id);
  } else if (p.action === 'remove') {
    const st = db.prepare('SELECT stop_order FROM request_stops WHERE id = ? AND request_id = ?')
      .get(p.target_stop_id, p.request_id);
    if (st) {
      db.prepare('DELETE FROM request_stops WHERE id = ?').run(p.target_stop_id);
      db.prepare('UPDATE request_stops SET stop_order = stop_order - 1 WHERE request_id = ? AND stop_order > ?')
        .run(p.request_id, st.stop_order);
    }
  }
}

// Полный цикл применения: правка точек → пересчёт оценки → рассылка
// обновлённой заявки всем причастным. Асинхронная (пересчёт ходит в
// геокодер/OSRM) — вызывать после того, как предложение уже помечено
// approved.
async function applyApprovedProposal(db, proposalId, actorUserId) {
  const p = db.prepare('SELECT * FROM stop_proposals WHERE id = ?').get(proposalId);
  if (!p) return null;

  db.transaction(() => applyProposalStops(db, p))();

  try {
    await recomputeRequestEstimate(p.request_id, { actorUserId });
  } catch (err) {
    console.error('[rides] recompute after proposal apply failed:', err.message);
  }

  const result = getRow(db, p.request_id);
  emitToDispatcher('request:updated', serializeForDispatcher(result, staleThreshold()));
  emitToEmployee(result.employee_id, 'request:status', serializeForEmployee(result));
  if (result.driver_id) emitToDriver(result.driver_id, 'request:updated', serializeForDriver(result));
  return result;
}

// Уведомить того, кто предложил точку, о решении по ней (одобрено/
// отклонено/таймаут). Диспетчер и заказчик сидят в комнате employee:{id},
// водитель — в driver:{driverId}.
function notifyProposer(db, proposalId, event) {
  const p = db.prepare('SELECT proposed_by, proposed_by_role FROM stop_proposals WHERE id = ?').get(proposalId);
  if (!p) return;
  const payload = serializeProposal(db, proposalId);
  if (p.proposed_by_role === 'driver') {
    const d = db.prepare('SELECT id FROM drivers WHERE user_id = ?').get(p.proposed_by);
    if (d) emitToDriver(d.id, event, payload);
  } else {
    emitToEmployee(p.proposed_by, event, payload);
  }
}

module.exports = { markDecided, applyProposalStops, applyApprovedProposal, notifyProposer };
