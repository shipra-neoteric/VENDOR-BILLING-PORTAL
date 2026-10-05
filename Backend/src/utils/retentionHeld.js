const RunningBill = require('../models/RunningBill');

// How much retention is currently withheld on a Work Order's own bills and
// still available to release — sum of every one of this WO's bills'
// retentionAmount, minus whatever's already been released back out via
// retentionReleased on any of them. A rejected bill never actually withheld
// anything real, so it's excluded; every other status (including paid)
// counts, since retention can still be sitting held on an already-paid bill
// until a later bill releases it. Floored at 0 — should never go negative in
// practice (release amounts are validated against this same figure at the
// point they're entered), but a stale/inconsistent state must never result
// in a negative "available to release" number being shown or trusted.
async function getRetentionHeldForWorkOrder(workOrderId) {
  if (!workOrderId) return 0;
  const bills = await RunningBill.find({ workOrderId, status: { $ne: 'rejected' } })
    .select('retentionAmount retentionReleased')
    .lean();
  const held = bills.reduce((sum, b) => sum + (b.retentionAmount || 0) - (b.retentionReleased || 0), 0);
  return Math.max(0, Math.round(held * 100) / 100);
}

module.exports = { getRetentionHeldForWorkOrder };
