// Сериализация предложений об изменении маршрута (stop_proposals) —
// общий формат для stopProposalsRouter.js (очередь и лента у диспетчера) и
// proposalTimeout.js (авто-отклонение по таймауту рассылает то же самое).
const SP_SELECT = `
  SELECT
    sp.*,
    pu.name AS proposer_name,
    pu.role AS proposer_current_role,
    r.from_address, r.to_address, r.status AS request_status, r.driver_id AS request_driver_id,
    ts.address AS target_address
  FROM stop_proposals sp
  JOIN users pu ON pu.id = sp.proposed_by
  JOIN requests r ON r.id = sp.request_id
  LEFT JOIN request_stops ts ON ts.id = sp.target_stop_id
`;

const ACTION_LABEL = { add: 'Добавить точку', edit: 'Изменить точку', remove: 'Убрать точку' };

function serializeProposal(db, id) {
  const row = db.prepare(`${SP_SELECT} WHERE sp.id = ?`).get(id);
  if (!row) return null;
  const stops = db
    .prepare('SELECT address FROM request_stops WHERE request_id = ? ORDER BY stop_order ASC')
    .all(row.request_id)
    .map((s) => s.address);
  return {
    id: row.id,
    requestId: row.request_id,
    action: row.action,
    actionLabel: ACTION_LABEL[row.action] || row.action,
    targetStopId: row.target_stop_id,
    targetAddress: row.target_address || null,
    address: row.address || null,
    status: row.status,
    proposedBy: row.proposed_by,
    proposedByName: row.proposer_name,
    proposedByRole: row.proposed_by_role || row.proposer_current_role,
    estDeltaMin: row.est_delta_min ?? null,
    decisionReason: row.decision_reason || null,
    decidedBy: row.decided_by || null,
    createdAt: row.created_at,
    decidedAt: row.decided_at || null,
    route: [row.from_address, row.to_address, ...stops].join(' → '),
    requestStatus: row.request_status,
    requestDriverId: row.request_driver_id || null,
  };
}

function listPendingProposals(db) {
  return db
    .prepare(`${SP_SELECT} WHERE sp.status = 'pending' ORDER BY sp.created_at ASC`)
    .all()
    .map((r) => serializeProposal(db, r.id));
}

function listProposalsForRequest(db, requestId) {
  return db
    .prepare(`${SP_SELECT} WHERE sp.request_id = ? ORDER BY sp.created_at DESC`)
    .all(requestId)
    .map((r) => serializeProposal(db, r.id));
}

module.exports = { serializeProposal, listPendingProposals, listProposalsForRequest, ACTION_LABEL };
