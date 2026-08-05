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
  const netBeforeGst = gross - retentionAmount - advanceRecovery;
  const gstAmount    = Math.round(netBeforeGst * gstPercent / 100);
  const netAfterHold = netBeforeGst + gstAmount;
  const netPayable   = netAfterHold - tdsAmount;
  return { gstAmount, netBeforeGst, netAfterHold, netPayable };
}

export function holdAmountFromPercent(gross: number, holdPercent: number): number {
  return Math.round(gross * (holdPercent || 0) / 100);
}
