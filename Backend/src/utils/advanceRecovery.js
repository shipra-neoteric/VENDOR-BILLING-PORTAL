// Shared advance-slip recovery application, used both at bill CREATION time
// (createBill — a senior wants to recover part of an advance right now) and
// at the late paymentDetails stage (submitPaymentDetails — the original,
// still-supported point). Both call this so an AdvanceSlip's balance always
// updates the same way regardless of which stage triggered the recovery.
async function applyAdvanceRecoveries(recoveries, { billNo, releasedBy }) {
  const AdvanceSlip = require('../models/AdvanceSlip');
  const applied = [];
  for (const rec of Array.isArray(recoveries) ? recoveries : []) {
    if (!rec.slipId || !rec.amount || rec.amount <= 0) continue;
    const slip = await AdvanceSlip.findById(rec.slipId);
    if (!slip) continue;
    const amount = Math.min(Number(rec.amount), slip.balance);
    if (amount <= 0) continue;
    slip.amountRecovered += amount;
    slip.recoveries.push({ billNo, amount, date: new Date(), releasedBy });
    slip.status = slip.amountRecovered >= slip.amount
      ? 'recovered'
      : slip.amountRecovered > 0 ? 'partial' : 'outstanding';
    await slip.save();
    applied.push({ slipId: slip._id, amount });
  }
  return applied;
}

// Undoes whatever applyAdvanceRecoveries applied for a given bill — needed
// because that function runs at CREATION time (real-time reducing the
// AdvanceSlip's balance), not deferred until the bill is actually paid, so a
// bill that gets rejected before payment must have its recovery unwound or
// the vendor's AdvanceSlip balance stays permanently (and wrongly) debited
// for a bill that never went anywhere. There's no per-recovery id stored on
// the bill itself — only the AdvanceSlip's own `recoveries` array, tagged
// with the bill's billNo — so this looks each one up by that tag.
async function reverseAdvanceRecoveries(billNo) {
  if (!billNo) return;
  const AdvanceSlip = require('../models/AdvanceSlip');
  const slips = await AdvanceSlip.find({ 'recoveries.billNo': billNo });
  for (const slip of slips) {
    const matching = slip.recoveries.filter((r) => r.billNo === billNo);
    if (!matching.length) continue;
    const total = matching.reduce((sum, r) => sum + (r.amount || 0), 0);
    slip.recoveries = slip.recoveries.filter((r) => r.billNo !== billNo);
    slip.amountRecovered = Math.max(0, slip.amountRecovered - total);
    slip.status = slip.amountRecovered >= slip.amount
      ? 'recovered'
      : slip.amountRecovered > 0 ? 'partial' : 'outstanding';
    await slip.save();
  }
}

module.exports = { applyAdvanceRecoveries, reverseAdvanceRecoveries };
