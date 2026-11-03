// "Deduct amount" at the final approval stage: the final approver can cut the bill's gross total (the base GST and
// everything after it is computed on) by an amount, with an optional remark. The bill's own `amount` is reduced and
// the figures are kept on `finalDeduction` for the record.

const round2 = (n) => Math.round(n * 100) / 100;

// Reads { deductionAmount, deductionRemark } off a request body. Returns { amount: 0 } when nothing was asked for, or
// { error } when it isn't a valid cut of `gross`.
function parseFinalDeduction(body, gross) {
  const raw = body?.deductionAmount;
  if (raw === undefined || raw === null || raw === '') return { amount: 0 };
  const amount = round2(Number(raw));
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Deduction must be a number, zero or more' };
  if (amount === 0) return { amount: 0 };
  if (amount >= gross) return { error: `Deduction (₹${amount.toLocaleString('en-IN')}) must be less than the bill's gross total (₹${round2(gross).toLocaleString('en-IN')})` };
  return { amount, remark: String(body.deductionRemark || '').trim().slice(0, 500) };
}

function finalDeductionSnapshot(grossBefore, amount, remark, user) {
  return { amount, remark: remark || '', grossBefore: round2(grossBefore), by: user._id, byName: user.name, at: new Date() };
}

module.exports = { parseFinalDeduction, finalDeductionSnapshot, round2 };
