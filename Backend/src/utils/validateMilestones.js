// Payment milestones are how a vendor actually gets paid, but the contract
// value (what the scope of work is worth, incl. GST) is the ceiling — a work
// order shouldn't be able to promise more in milestones than the work itself
// is worth. Recomputes each milestone's payable amount server-side rather
// than trusting the client-sent `payable`, since that's just as easy to spoof
// as any other field in the body.
function calcPayable(m) {
  const amt = m.amount || 0;
  if (m.gstType === 'inclusive') return amt;
  return amt * (1 + (m.gstPercent || 0) / 100);
}

function milestonesExceedContract({ contractValue = 0, gstPercent = 0, paymentMilestones = [] }) {
  const contractValueInclGst = contractValue * (1 + (gstPercent || 0) / 100);
  const milestonesTotal = (paymentMilestones || []).reduce((s, m) => s + calcPayable(m), 0);
  return milestonesTotal > contractValueInclGst + 1; // ₹1 tolerance for rounding
}

module.exports = { milestonesExceedContract };
