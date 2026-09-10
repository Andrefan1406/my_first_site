// Сериализация предложений объединения заявок (request_merges) — общий
// формат для mergeRouter.js (очередь у диспетчера, карточки) и
// proposalTimeout.js (авто-отклонение по таймауту).
const M_SELECT = `
  SELECT
    m.*,
    a.from_address AS a_from, a.to_address AS a_to, a.status AS a_status, a.employee_id AS a_employee_id,
    b.from_address AS b_from, b.to_address AS b_to, b.employee_id AS b_employee_id,
    ea.name AS a_employee_name,
    eb.name AS b_employee_name,
    du.name AS driver_name
  FROM request_merges m
  JOIN requests a ON a.id = m.request_a_id
  JOIN requests b ON b.id = m.request_b_id
  JOIN users ea ON ea.id = a.employee_id
  JOIN users eb ON eb.id = b.employee_id
  JOIN drivers d ON d.id = m.driver_id
  JOIN users du ON du.id = d.user_id
`;

function routeString(db, requestId, fromAddr, toAddr) {
  const stops = db
    .prepare('SELECT address FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC')
    .all(requestId)
    .map((s) => s.address);
  return [fromAddr, toAddr, ...stops].join(' → ');
}

function serializeMerge(db, id) {
  const row = db.prepare(`${M_SELECT} WHERE m.id = ?`).get(id);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    requestAId: row.request_a_id,
    requestBId: row.request_b_id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    aEmployeeId: row.a_employee_id,
    bEmployeeId: row.b_employee_id,
    aEmployeeName: row.a_employee_name,
    bEmployeeName: row.b_employee_name,
    aStatus: row.a_status,
    aRoute: routeString(db, row.request_a_id, row.a_from, row.a_to),
    bRoute: routeString(db, row.request_b_id, row.b_from, row.b_to),
    approvedByA: !!row.approved_by_a,
    approvedByDispatcher: !!row.approved_by_dispatcher,
    pickupEtaAt: row.pickup_eta_at || null,
    decisionReason: row.decision_reason || null,
    createdAt: row.created_at,
    decidedAt: row.decided_at || null,
  };
}

function listPendingMerges(db) {
  return db
    .prepare(`${M_SELECT} WHERE m.status = 'pending' ORDER BY m.created_at ASC`)
    .all()
    .map((r) => serializeMerge(db, r.id));
}

module.exports = { serializeMerge, listPendingMerges };
