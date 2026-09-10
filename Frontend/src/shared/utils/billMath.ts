// Single source of truth for a bill's Gross -> Hold/Advance -> GST -> Net
// breakdown. Neither Hold/Retention nor Advance Recovery is the contractor's
// taxable value — Hold is a security deposit held back, and Advance Recovery
// is clawing back money already paid out earlier — so both come off the
// gross FIRST, and GST is calculated only on what's actually left, not on
// the full gross with these subtracted afterwards.

export interface BillFinancialsInput {
  gross: number;
  gstPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsAmount?: number;
  // A one-off manual correction applied at Verify — e.g. clawing back a
  // small overpayment from a prior cycle, or adding back a shortfall.
  // Signed: positive adds to net payable, negative subtracts. Applied last
  // (after TDS), since it corrects the actual payout figure itself rather
  // than any of the upstream taxable-value steps.
  adjustmentAmount?: number;
  // Sum of the SUPERSEDES-linked bills' own amount — ONLY set (>0) for a
  // bill created with Relationship Type = SUPERSEDES and at least one linked
  // bill. Its presence switches to a different calculation order (see
  // below); 0/absent for every other bill keeps the original order exactly,
  // so this is fully backward compatible with every existing bill.
  supersedeDeduction?: number;
}

export interface BillFinancials {
  gstAmount: number;
  netBeforeGst: number;
  netAfterHold: number;
  netPayable: number;
}

// Rounds to 2 decimal places (paise) rather than the nearest whole rupee —
// a fractional rate (e.g. ₹50.5/sqft) produces genuinely fractional amounts
// throughout this chain, and rounding to whole rupees at each step silently
// discards real money rather than just formatting it for display.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function billFinancials({
  gross, gstPercent = 0, retentionAmount = 0, advanceRecovery = 0, tdsAmount = 0, adjustmentAmount = 0,
  supersedeDeduction = 0,
}: BillFinancialsInput): BillFinancials {
  const netBeforeGst = round2(gross - retentionAmount - advanceRecovery);

  // SUPERSEDES bills: GST is charged on the full gross (not gross-minus-
  // hold-minus-advance), and the superseded bills' amount + Advance Recovery
  // both come off AFTER GST instead of before — confirmed with the user for
  // this case specifically. Hold/Retention still comes off last, and its own
  // amount is still computed the same way (against the original gross) —
  // only its position in the chain moves. Every other bill (supersedeDeduction
  // 0/absent) falls through to the original, unchanged formula below.
  if (supersedeDeduction > 0) {
    const gstAmount    = round2(gross * gstPercent / 100);
    const netAfterHold = round2(gross + gstAmount - supersedeDeduction - advanceRecovery - retentionAmount);
    const netPayable   = round2(netAfterHold - tdsAmount + adjustmentAmount);
    return { gstAmount, netBeforeGst, netAfterHold, netPayable };
  }

  const gstAmount    = round2(netBeforeGst * gstPercent / 100);
  const netAfterHold = round2(netBeforeGst + gstAmount);
  const netPayable   = round2(netAfterHold - tdsAmount + adjustmentAmount);
  return { gstAmount, netBeforeGst, netAfterHold, netPayable };
}

export function holdAmountFromPercent(gross: number, holdPercent: number): number {
  return round2(gross * (holdPercent || 0) / 100);
}
