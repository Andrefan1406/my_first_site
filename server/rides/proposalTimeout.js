// Таймаут модерации предложений по маршруту: раз в минуту переводит
// предложения, которые провисели pending дольше отведённого времени, в
// auto_rejected и уведомляет автора. Порог по умолчанию — 5 минут (ТЗ
// доработок, п.5: «тайм-аут → авто-отклонение»).
const cron = require('node-cron');
const { getWriteDb } = require('./db');
const { logEvent } = require('./events');
const { emitToDispatcher } = require('./socket');
const { serializeProposal } = require('./stopProposalView');
const { markDecided, notifyProposer } = require('./proposalApply');

const TIMEOUT_MINUTES = Number(process.env.RIDE_PROPOSAL_TIMEOUT_MINUTES || 5);
const AUTO_REASON = 'Диспетчер не рассмотрел предложение за отведённое время';

function sweepOnce() {
  const db = getWriteDb();
  const stale = db
    .prepare(
      `SELECT id FROM stop_proposals
        WHERE status = 'pending'
          AND (julianday('now') - julianday(created_at)) * 24 * 60 >= ?`
    )
    .all(TIMEOUT_MINUTES);

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

function startProposalTimeoutJob() {
  cron.schedule('* * * * *', () => {
    try {
      sweepOnce();
    } catch (err) {
      console.error('[rides] proposal timeout sweep failed:', err.message);
    }
  });
}

module.exports = { startProposalTimeoutJob, sweepOnce };
