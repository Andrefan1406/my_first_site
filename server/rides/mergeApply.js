// Применение и расформирование объединений заявок (П.6). Вынесено из
// роутера, потому что каскады (завершение/отмена/переброска заявки A)
// живут в requestsRouter, а таймаут-джоба — в proposalTimeout.js.
const { recomputeRequestEstimate, chooseInsertIndex, geocodeAddress } = require('./routeEstimate');
const { logEvent } = require('./events');
const { emitToDrivers, emitToDispatcher, emitToEmployee, emitToDriver } = require('./socket');
const {
  getRow, serializeForDriver, serializeForEmployee, serializeForDispatcher, staleThreshold,
} = require('./requestView');
const { serializeMerge } = require('./mergeView');

function renumberStops(db, requestId) {
  const rows = db.prepare('SELECT id FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC').all(requestId);
  rows.forEach((s, i) => db.prepare('UPDATE request_stops SET stop_order = ? WHERE id = ?').run(i, s.id));
}

// Оба согласия получены — вливаем точки заявки B в маршрут A. Асинхронная
// (геокодер + пересчёт). Вызывать после того, как merge помечен approved.
async function applyMerge(db, mergeId, actorUserId) {
  const m = db.prepare('SELECT * FROM request_merges WHERE id = ?').get(mergeId);
  if (!m) return null;
  const A = db.prepare('SELECT * FROM requests WHERE id = ?').get(m.request_a_id);
  const B = db.prepare('SELECT * FROM requests WHERE id = ?').get(m.request_b_id);
  if (!A || !B) return null;

  const bStops = db
    .prepare('SELECT address, lat, lng FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC')
    .all(B.id);
  const bPoints = [
    { address: B.from_address, lat: B.from_lat, lng: B.from_lng },
    { address: B.to_address, lat: B.to_lat, lng: B.to_lng },
    ...bStops,
  ];

  let bFromC = B.from_lat != null ? { lat: B.from_lat, lng: B.from_lng } : null;
  if (!bFromC) bFromC = await geocodeAddress(B.from_address).catch(() => null);

  const aStops = db
    .prepare('SELECT stop_order, lat, lng FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC')
    .all(A.id);
  const chain = [
    A.to_lat != null ? { lat: A.to_lat, lng: A.to_lng } : null,
    ...aStops.map((s) => (s.lat != null ? { lat: s.lat, lng: s.lng } : null)),
  ];
  const insertAt = chooseInsertIndex(chain, bFromC); // stop_order для первой точки блока B

  db.transaction(() => {
    db.prepare('UPDATE request_stops SET stop_order = stop_order + ? WHERE request_id = ? AND stop_order >= ?')
      .run(bPoints.length, A.id, insertAt);
    const ins = db.prepare(
      'INSERT INTO request_stops (request_id, address, stop_order, lat, lng, merged_from_request_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    bPoints.forEach((p, i) => ins.run(A.id, p.address, insertAt + i, p.lat ?? null, p.lng ?? null, B.id));

    db.prepare(
      `UPDATE requests SET status = 'assigned', driver_id = ?, assigned_by = 'dispatcher',
         merge_lock = 0, merged_into = ?, claimed_at = datetime('now') WHERE id = ?`
    ).run(A.driver_id, A.id, B.id);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'assigned', ?)`)
      .run(B.id, actorUserId);

    db.prepare(`UPDATE request_merges SET status = 'approved', decided_at = datetime('now'), decided_by = ? WHERE id = ?`)
      .run(actorUserId, mergeId);

    logEvent(db, { requestId: A.id, type: 'merge_approved', actorUserId, payload: { mergeId, mergedRequestId: B.id } });
    logEvent(db, { requestId: B.id, type: 'merge_approved', actorUserId, payload: { mergeId, mergedIntoRequestId: A.id } });
  })();

  const est = await recomputeRequestEstimate(A.id, { actorUserId }).catch(() => null);

  // Время посадки пассажира B = накопительная оценка до точки B.from
  // (её позиция в общем списке точек A: 0 = A.from, 1 = A.to, далее стопы).
  let pickupEtaAt = null;
  if (est && est.perPoint) {
    const pt = est.perPoint.find((p) => p.index === insertAt + 2);
    if (pt) {
      const aNow = db.prepare('SELECT status, requested_at FROM requests WHERE id = ?').get(A.id);
      let base = Date.now();
      if (aNow.status !== 'in_progress' && aNow.requested_at) {
        const t = new Date(aNow.requested_at).getTime();
        if (!Number.isNaN(t) && t > base) base = t;
      }
      pickupEtaAt = new Date(base + pt.etaMinutes * 60000).toISOString();
    }
  }
  db.prepare('UPDATE requests SET pickup_eta_at = ? WHERE id = ?').run(pickupEtaAt, B.id);
  db.prepare('UPDATE request_merges SET pickup_eta_at = ? WHERE id = ?').run(pickupEtaAt, mergeId);

  const aRow = getRow(db, A.id);
  const bRow = getRow(db, B.id);
  emitToDrivers('request:removed', { id: B.id });
  emitToDispatcher('request:updated', serializeForDispatcher(aRow, staleThreshold()));
  emitToDispatcher('request:updated', serializeForDispatcher(bRow, staleThreshold()));
  emitToEmployee(aRow.employee_id, 'request:status', serializeForEmployee(aRow));
  emitToEmployee(bRow.employee_id, 'request:merged', serializeForEmployee(bRow));
  if (A.driver_id) emitToDriver(A.driver_id, 'request:updated', serializeForDriver(aRow));
  return { pickupEtaAt };
}

// Расформировать все объединения, где A — «несущая» заявка: точки B
// вынимаются из маршрута A, каждая B возвращается в общий пул. Вызывать,
// когда A отменяют / водитель отказывается / машину перебрасывают.
// Синхронно (внутри своей транзакции); эмиты и пересчёт A — на вызывающей
// стороне через возвращённый список id заявок B.
function dissolveMergesForA(db, aId, reason, actorUserId) {
  const merged = db.prepare("SELECT id FROM requests WHERE merged_into = ?").all(aId).map((r) => r.id);
  if (!merged.length) return [];
  db.transaction(() => {
    for (const bId of merged) {
      db.prepare('DELETE FROM request_stops WHERE request_id = ? AND merged_from_request_id = ?').run(aId, bId);
      renumberStops(db, aId);
      db.prepare(
        `UPDATE requests SET status = 'pending_assignment', driver_id = NULL, assigned_by = NULL,
           claimed_at = NULL, merged_into = NULL, merge_lock = 0, pickup_eta_at = NULL WHERE id = ?`
      ).run(bId);
      db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'pending_assignment', ?)`)
        .run(bId, actorUserId);
      const mr = db.prepare("SELECT id FROM request_merges WHERE request_b_id = ? AND status = 'approved'").get(bId);
      if (mr) {
        db.prepare("UPDATE request_merges SET status = 'rejected', decision_reason = ?, decided_at = datetime('now') WHERE id = ?")
          .run(reason, mr.id);
      }
      logEvent(db, { requestId: bId, type: 'merge_dissolved', actorUserId, payload: { fromRequestId: aId, reason } });
    }
  })();
  return merged;
}

// Заявка A завершена — попутные B завершаются вместе с ней (одна поездка
// обслужила обе, время не делим). Вызывать ВНУТРИ транзакции /status.
function cascadeCompleteMergedB(db, aId, actorUserId) {
  const bs = db.prepare("SELECT id FROM requests WHERE merged_into = ? AND status != 'completed'").all(aId).map((r) => r.id);
  for (const bId of bs) {
    db.prepare("UPDATE requests SET status = 'completed' WHERE id = ?").run(bId);
    db.prepare(`INSERT INTO request_status_history (request_id, status, changed_by) VALUES (?, 'completed', ?)`)
      .run(bId, actorUserId);
    logEvent(db, { requestId: bId, type: 'status_changed', actorUserId, payload: { to: 'completed', viaMergeWith: aId } });
  }
  return bs;
}

// Эмиты для заявок B, вернувшихся в пул после расформирования.
function emitDissolvedB(db, restoredIds) {
  for (const bId of restoredIds) {
    const bRow = getRow(db, bId);
    if (!bRow) continue;
    emitToDrivers('request:new', serializeForDriver(bRow));
    emitToDispatcher('request:updated', serializeForDispatcher(bRow, staleThreshold()));
    emitToEmployee(bRow.employee_id, 'request:unmerged', serializeForEmployee(bRow));
  }
}

module.exports = {
  applyMerge,
  dissolveMergesForA,
  cascadeCompleteMergedB,
  emitDissolvedB,
  renumberStops,
};
