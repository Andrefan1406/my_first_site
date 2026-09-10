// Таймаут согласований: раз в минуту авто-отклоняет предложения, которые
// провисели pending дольше отведённого времени, и уведомляет участников.
// Порог по умолчанию — 5 минут (ТЗ доработок: «тайм-аут → авто-отклонение»).
// Покрывает и предложения по маршруту (stop_proposals, П.5), и предложения
// объединения заявок (request_merges, П.6).
const cron = require('node-cron');
const { getWriteDb } = require('./db');
const { logEvent } = require('./events');
const { emitToDrivers, emitToDispatcher, emitToDriver, emitToEmployee } = require('./socket');
const { serializeProposal } = require('./stopProposalView');
const { markDecided, notifyProposer } = require('./proposalApply');
const { serializeMerge } = require('./mergeView');
const { getRow, serializeForDriver, serializeForDispatcher, staleThreshold } = require('./requestView');

const TIMEOUT_MINUTES = Number(process.env.RIDE_PROPOSAL_TIMEOUT_MINUTES || 5);
const AUTO_REASON = 'Диспетчер не рассмотрел предложение за отведённое время';
const OVERDUE = "(julianday('now') - julianday(created_at)) * 24 * 60 >= ?";

function sweepStopProposals(db) {
  const stale = db.prepare(`SELECT id FROM stop_proposals WHERE status = 'pending' AND ${OVERDUE}`).all(TIMEOUT_MINUTES);
  for (const { id } of stale) {
    if (!markDecided(db, id, 'auto_rejected', null, AUTO_REASON)) continue;
    const p = db.prepare('SELECT request_id, action, address FROM stop_proposals WHERE id = ?').get(id);
    logEvent(db, {
      requestId: p.request_id,
      type: 'stop_rejected',
      actorUserId: null,
      payload: { proposalId: id, action: p.action, address: p.address, auto: true, reason: AUTO_REASON },
    });
    const proposal = serializeProposal(db, id);
    emitToDispatcher('proposal:updated', proposal);
    notifyProposer(db, id, 'proposal:updated');
  }
  return stale.length;
}

function sweepMerges(db) {
  const stale = db.prepare(`SELECT id FROM request_merges WHERE status = 'pending' AND ${OVERDUE}`).all(TIMEOUT_MINUTES);
  for (const { id } of stale) {
    const upd = db
      .prepare(`UPDATE request_merges SET status = 'auto_rejected', decided_at = datetime('now'), decision_reason = ? WHERE id = ? AND status = 'pending'`)
      .run(AUTO_REASON, id);
    if (upd.changes === 0) continue;
    const m = db.prepare('SELECT * FROM request_merges WHERE id = ?').get(id);
    db.prepare('UPDATE requests SET merge_lock = 0 WHERE id = ? AND merge_lock = 1').run(m.request_b_id);
    logEvent(db, {
      requestId: m.request_a_id,
      type: 'merge_rejected',
      actorUserId: null,
      payload: { mergeId: id, auto: true, reason: AUTO_REASON },
    });
    const merge = serializeMerge(db, id);
    emitToDispatcher('merge:updated', merge);
    emitToDriver(m.driver_id, 'merge:updated', merge);
    emitToEmployee(merge.aEmployeeId, 'merge:updated', merge);
    const bRow = getRow(db, m.request_b_id);
    if (bRow && bRow.status === 'pending_assignment') {
      emitToDrivers('request:new', serializeForDriver(bRow));
      emitToDispatcher('request:updated', serializeForDispatcher(bRow, staleThreshold()));
    }
  }
  return stale.length;
}

function sweepOnce() {
  const db = getWriteDb();
  return sweepStopProposals(db) + sweepMerges(db);
}

function startProposalTimeoutJob() {
  cron.schedule('* * * * *', () => {
    try {
      sweepOnce();
    } catch (err) {
      console.error('[rides] timeout sweep failed:', err.message);
    }
  });
}

module.exports = { startProposalTimeoutJob, sweepOnce };
