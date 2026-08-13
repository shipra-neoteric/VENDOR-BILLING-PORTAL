// Outbound integration with the external Transaction Management System (TMS)
// — the system that actually prepares/releases the outgoing payment once a
// bill clears L2 Director approval in this system. Uses Node's built-in
// fetch (no HTTP client dependency needed for one POST call) with a plain
// shared-API-key header, since there's no existing OAuth/webhook-signing
// precedent anywhere in this backend to match instead.
const TMS_TIMEOUT_MS = 15000;

// netAfterAdvance-equivalent for what TMS should actually pay out — matches
// the same Gross -> Hold/Advance -> GST -> Net breakdown used throughout the
// rest of this system (e.g. Frontend/src/shared/utils/billMath.ts's
// billFinancials). Neither Hold nor Advance Recovery is the contractor's
// taxable value, so both come off the gross FIRST, and GST is calculated
// only on what's actually left.
function netPayable(bill) {
  const netBeforeGst = (bill.amount || 0) - (bill.retentionAmount || 0) - (bill.advanceRecovery || 0);
  const gstAmount     = netBeforeGst * (bill.gstPercent ?? 0) / 100;
  const netAfterHold  = netBeforeGst + gstAmount;
  // adjustmentAmount is a one-off manual correction set at Verify (e.g.
  // clawing back a prior small overpayment) — signed, applied last, same as
  // Frontend/src/shared/utils/billMath.ts's billFinancials.
  const beforeAdjustment = netAfterHold - (bill.tdsAmount || 0);
  // Rounded to paise (2 decimals), not the nearest whole rupee — see
  // Frontend/src/shared/utils/billMath.ts's round2 for why.
  return Math.round((beforeAdjustment + (bill.adjustmentAmount || 0)) * 100) / 100;
}

async function sendBill(bill, contractor) {
  if (!process.env.TMS_API_URL) {
    throw new Error('TMS_API_URL is not configured on the server');
  }

  const payload = {
    reference: bill.billNo,
    workOrderNo: bill.workOrderNo,
    vendor: {
      vendorCode: bill.vendorCode,
      name: bill.vendorName,
      accountHolderName: contractor?.accountHolderName || '',
      bankName: contractor?.bankName || '',
      accountNumber: contractor?.accountNumber || '',
      ifscCode: contractor?.ifscCode || '',
      branchName: contractor?.branchName || '',
    },
    amounts: {
      gross: bill.amount,
      retentionAmount: bill.retentionAmount || 0,
      advanceRecovery: bill.advanceRecovery || 0,
      tdsAmount: bill.tdsAmount || 0,
      adjustmentAmount: bill.adjustmentAmount || 0,
      adjustmentRemark: bill.adjustmentAmount ? (bill.adjustmentRemark || '') : '',
      netPayable: netPayable(bill),
    },
    billDate: bill.billDate,
    companyName: bill.companyName || '',
    callbackUrl: `${process.env.APP_BASE_URL || ''}/api/webhooks/tms-callback`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TMS_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(process.env.TMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TMS-API-Key': process.env.TMS_API_KEY || '',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'TMS request timed out' : `TMS request failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMS returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
  }

  return res.json().catch(() => ({}));
}

module.exports = { sendBill, netPayable };
