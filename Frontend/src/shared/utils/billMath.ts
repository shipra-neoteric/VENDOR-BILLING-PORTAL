// Single source of truth for a bill's Gross -> Hold -> GST -> Net breakdown.
// Retention/Hold is a security deposit on the contractor's own (taxable)
// value — GST isn't the contractor's money to hold against, it's tax they
// collect on behalf of the government. So Hold is taken off the gross
// FIRST, and GST is calculated on what's left, not on the full gross with
// Hold subtracted afterwards. (The bottom-line net payable comes out the
// same either way — percentages commute — but the intermediate Hold and GST
// figures shown/stored do not, and retentionAmount is what's later tracked
// as "to be released" post-DLP, so the base it's computed from matters.)

export interface BillFinancialsInput {
  gross: number;
  gstPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsAmount?: number;
}

export interface BillFinancials {
  gstAmount: number;
  netBeforeGst: number;
  netAfterHold: number;
  netPayable: number;
}

export function billFinancials({
  gross, gstPercent = 0, retentionAmount = 0, advanceRecovery = 0, tdsAmount = 0,
}: BillFinancialsInput): BillFinancials {
  const netBeforeGst = gross - retentionAmount;
  const gstAmount    = Math.round(netBeforeGst * gstPercent / 100);
  const netAfterHold = netBeforeGst + gstAmount;
  const netPayable   = netAfterHold - advanceRecovery - tdsAmount;
  return { gstAmount, netBeforeGst, netAfterHold, netPayable };
}

export function holdAmountFromPercent(gross: number, holdPercent: number): number {
  return Math.round(gross * (holdPercent || 0) / 100);
}
