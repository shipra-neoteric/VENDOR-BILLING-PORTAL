// Outbound integration with the external Transaction Management System (TMS)
// — the system that actually prepares/releases the outgoing payment once a
// bill clears L2 Director approval in this system. Uses Node's built-in
// fetch (no HTTP client dependency needed for one POST call) with a plain
// shared-API-key header, since there's no existing OAuth/webhook-signing
// precedent anywhere in this backend to match instead.
const { billFinancialsForBill } = require('./billFinancials');

const TMS_TIMEOUT_MS = 15000;

// Was previously its own hand-rolled copy of the Gross -> Hold/Advance ->
// GST -> Net breakdown, independently drifted from the shared one (missing
// both the SUPERSEDES-bill branch and retentionReleased) — dormant while
// TMS_INTEGRATION_ENABLED stays false, but would have sent the wrong real
// payment amount to the external payment system the moment that flag flips
// on. Now delegates to billFinancials.js, the same single source of truth
// used everywhere else, so there's nothing left here to drift.
function netPayable(bill) {
  return billFinancialsForBill(bill).netPayable;
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
