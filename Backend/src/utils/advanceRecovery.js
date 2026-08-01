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

module.exports = { applyAdvanceRecoveries };
