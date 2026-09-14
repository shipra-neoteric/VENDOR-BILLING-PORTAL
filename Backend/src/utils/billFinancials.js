// Single source of truth for a bill's Gross -> Hold/Advance -> GST -> Net
// breakdown, on the BACKEND. This is a deliberate Node/CommonJS port of
// Frontend/src/shared/utils/billMath.ts's `billFinancials()` — same formula
// chain, same SUPERSEDES-bill branch, kept in sync by hand since the two
// codebases don't share a build step. If you change the math here, change it
// there too (and vice versa).
//
// Before this module existed, THREE different "net payable" formulas lived
// in this codebase and quietly disagreed with each other:
//   1. Frontend/src/shared/utils/billMath.ts's billFinancials() — canonical,
//      handles retention, advance recovery, GST, TDS, a manual adjustment,
//      and the SUPERSEDES-bill order. Ledger's UI and most of the app trust
//      this one.
//   2. Backend dprController.js's old netReleased(b) — gross = amount * (1 +
//      gst%), then gross - retention - advanceRecovery. Omitted TDS
//      entirely, and computed GST on the FULL gross instead of on the
//      post-hold base.
//   3. Backend projectController.js's old netCertified/netPaidOut — base +
//      base*gst% - tdsAmount, then minus retention/advance for the paid
//      figure. A third variant, also computing GST on the full base.
// Both backend controllers have been retrofitted to call this module instead
// of hand-rolling their own math (see dprController.js's netReleased and
// projectController.js's netCertified/netPaidOut) — this is now the ONLY
// place "what does the contractor actually get paid" is computed.
//
// Neither Hold/Retention nor Advance Recovery is the contractor's taxable
// value — Hold is a security deposit held back, and Advance Recovery is
// clawing back money already paid out earlier — so both come off the gross
// FIRST, and GST is calculated only on what's actually left, not on the full
// gross with these subtracted afterwards.

// Rounds to 2 decimal places (paise) rather than the nearest whole rupee — a
// fractional rate (e.g. ₹50.5/sqft) produces genuinely fractional amounts
// throughout this chain, and rounding to whole rupees at each step silently
// discards real money rather than just formatting it for display.
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Object} input
 * @param {number} input.gross
 * @param {number} [input.gstPercent]
 * @param {number} [input.retentionAmount]
 * @param {number} [input.advanceRecovery]
 * @param {number} [input.tdsAmount]
 * @param {number} [input.adjustmentAmount] - signed manual correction, applied last.
 * @param {number} [input.supersedeDeduction] - >0 only for a SUPERSEDES bill; switches calculation order (see below).
 * @returns {{ gstAmount: number, netBeforeGst: number, netAfterHold: number, netPayable: number }}
 */
function billFinancials({
  gross, gstPercent = 0, retentionAmount = 0, advanceRecovery = 0, tdsAmount = 0, adjustmentAmount = 0,
  supersedeDeduction = 0,
}) {
  const netBeforeGst = round2(gross - retentionAmount - advanceRecovery);

  // SUPERSEDES bills: GST is charged on the full gross (not gross-minus-
  // hold-minus-advance), and the superseded bills' amount + Advance Recovery
  // both come off AFTER GST instead of before. Hold/Retention still comes
  // off last, and its own amount is still computed the same way (against the
  // original gross) — only its position in the chain moves. Every other
  // bill (supersedeDeduction 0/absent) falls through to the original,
  // unchanged formula below.
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

function holdAmountFromPercent(gross, holdPercent) {
  return round2(gross * (holdPercent || 0) / 100);
}

// Convenience wrapper for a RunningBill Mongoose doc (or .lean() plain
// object) — maps its own field names onto billFinancials' input shape.
// `amount` is the bill's pre-GST base, matching every call site's existing
// convention (both old backend formulas and billMath.ts all treat
// RunningBill.amount as the taxable base, never an already-GST-inclusive
// figure).
//
// gstPercent defaults to 18 (via `??`, not `||`, so a genuine 0% bill isn't
// silently overridden) — matching RunningBill's own schema default, rather
// than dprController's old `|| 0` or projectController's old `|| 18`
// (harmless in practice since real bills always have gstPercent set, but
// this picks ONE default instead of leaving two to disagree on paper).
function billFinancialsForBill(b) {
  return billFinancials({
    gross:              b.amount || 0,
    gstPercent:         b.gstPercent ?? 18,
    retentionAmount:    b.retentionAmount || 0,
    advanceRecovery:    b.advanceRecovery || 0,
    tdsAmount:          b.tdsAmount || 0,
    adjustmentAmount:   b.adjustmentAmount || 0,
    supersedeDeduction: b.supersedeDeduction || 0,
  });
}

module.exports = { billFinancials, holdAmountFromPercent, billFinancialsForBill };
