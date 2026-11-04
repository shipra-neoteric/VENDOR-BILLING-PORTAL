// Duplicate bills made by the legacy reconciliation script (Backend/scripts/legacy_bill_reconciliation.js, run on 25 Jul 2026).
//
// That script billed progress entries that were not linked to any bill — but for many work orders the same work had already
// been billed by hand on 7–11 Jul (those bills never linked their entries), so it created a second, identical bill. Those
// copies are marked by the script's own remark ("Legacy reconciliation - …"). A copy is only treated as a duplicate when a
// bill with the SAME work order, amount and items (qty) also exists outside the script — copies that stand alone (the only
// record of that billing) are kept. Nothing is changed in the data; the money rollups simply do not count these copies.
const RunningBill = require('../models/RunningBill');

const LEGACY_NOTE = /^Legacy reconciliation/i;
const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, ids: new Set() };

const sigOf = (b) => String(b.workOrderId) + '|' + Math.round(b.amount || 0) + '|'
  + (b.lineItems || []).map((l) => `${String(l.description || '').trim().toLowerCase()}:${Math.round((Number(l.billedQty) || 0) * 1000)}`).sort().join(',');

async function getDuplicateBillIds() {
  if (Date.now() - cache.at < TTL_MS) return cache.ids;
  const copies = await RunningBill.find({ remarks: LEGACY_NOTE }).select('workOrderId amount lineItems').lean();
  let ids = new Set();
  if (copies.length) {
    const woIds = [...new Set(copies.map((c) => String(c.workOrderId)))];
    // The "real" bill must be a live one: not rejected and not archived (an old archived 'submitted' bill is not a twin).
    const others = await RunningBill.find({ workOrderId: { $in: woIds }, remarks: { $not: LEGACY_NOTE }, status: { $ne: 'rejected' }, isArchived: { $ne: true } })
      .select('workOrderId amount lineItems').lean();
    const have = new Set(others.map(sigOf));
    ids = new Set(copies.filter((c) => have.has(sigOf(c))).map((c) => String(c._id)));
  }
  cache = { at: Date.now(), ids };
  return ids;
}

// The bills without the duplicate copies.
async function excludeDuplicateBills(bills) {
  const ids = await getDuplicateBillIds();
  return ids.size ? bills.filter((b) => !ids.has(String(b._id))) : bills;
}

module.exports = { getDuplicateBillIds, excludeDuplicateBills };
