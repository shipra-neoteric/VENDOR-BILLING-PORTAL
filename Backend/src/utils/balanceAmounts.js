// Amount-based "remaining balance" of a work order's scope items.
//
// Billing is tracked by quantity (lastBilledQty), so once an item's quantity is
// fully billed the system can't see money that is still owed on it — e.g. an
// item contracted at 2376 sq.ft x 300 = 7,12,800 whose 2600 sq.ft went out in
// bills at 250 (6,50,000) has no quantity left but 62,800 left to pay.
//
//   balance = planned x rate  -  already billed amount  -  value of the quantity still unbilled
//
// It is only trusted when the item's own books agree: the quantity on its bill
// lines must equal its lastBilledQty counter. Where they don't (quantity marked
// billed with no bill behind it, a bill line linked elsewhere, a counter never
// restored after a deleted bill), the "balance" would just be that unexplained
// quantity's value — not money owed — so no balance is offered at all.
//
// The last term is subtracted because that quantity gets billed the normal way
// (at the work order's rate) and must not be counted twice. A balance is then
// billed as a line with isBalance=true, billedQty 0 and amount <= balance —
// billedQty 0 keeps it invisible to every quantity guard (overbill check,
// lastBilledQty bookkeeping, reject/delete restore), all of which skip it.

const mongoose = require('mongoose');
const RunningBill = require('../models/RunningBill');
const { resolveBillableItem } = require('./varianceCheck');

const round2 = (n) => Math.round(n * 100) / 100;
const keyOf = (scopeItemId, subItemId) => `${scopeItemId}|${subItemId || ''}`;

// Billed amount per scope item / particular across every live bill of the given
// work orders (rejected and superseded-away bills don't count). `excludeBillId`
// leaves one bill out — used when that bill is being edited.
async function billedAmountMap(workOrderIds, excludeBillId) {
  const match = { workOrderId: { $in: workOrderIds }, status: { $ne: 'rejected' }, isActive: { $ne: false } };
  if (excludeBillId) match._id = { $ne: new mongoose.Types.ObjectId(String(excludeBillId)) };
  const rows = await RunningBill.aggregate([
    { $match: match },
    { $unwind: '$lineItems' },
    { $match: { 'lineItems.scopeItemId': { $ne: null } } },
    // subItemId is null on some bills and missing on others — $ifNull folds both into one group.
    { $group: { _id: { s: '$lineItems.scopeItemId', u: { $ifNull: ['$lineItems.subItemId', ''] } }, amount: { $sum: '$lineItems.amount' }, qty: { $sum: '$lineItems.billedQty' } } },
  ]);
  return new Map(rows.map((r) => [keyOf(r._id.s, r._id.u), { amount: r.amount, qty: r.qty }]));
}

function balanceFor(target, billed) {
  const billedAmount = billed ? billed.amount : 0;
  const billedQty = billed ? billed.qty : 0;
  // Books disagree — see header. Nothing billed at all is consistent only if the counter is 0 too.
  if (Math.abs(billedQty - (Number(target.lastBilledQty) || 0)) > 0.01) return 0;
  const rate = Number(target.rate) || 0;
  const planned = Number(target.plannedQty) || 0;
  if (!(planned > 0) || !(rate > 0)) return 0;
  const qtyLeft = Math.max(0, planned - (Number(target.lastBilledQty) || 0));
  const balance = planned * rate - (billedAmount || 0) - qtyLeft * rate;
  return balance > 0.5 ? round2(balance) : 0;
}

// Adds balanceAmount to every scope item (or, for an item with particulars,
// every particular) of the given plain work-order objects. Consultant work
// orders are milestone-billed, so they're skipped.
async function attachBalanceAmounts(workOrders) {
  const eligible = workOrders.filter((w) => w.contractType !== 'professional-services');
  if (eligible.length === 0) return;
  const billed = await billedAmountMap(eligible.map((w) => w._id));
  for (const wo of eligible) {
    for (const si of wo.scopeItems || []) {
      if (si.subItems && si.subItems.length > 0) {
        for (const sub of si.subItems) sub.balanceAmount = balanceFor(sub, billed.get(keyOf(si._id, sub._id)));
      } else {
        si.balanceAmount = balanceFor(si, billed.get(keyOf(si._id)));
      }
    }
  }
}

// Server-side check for isBalance lines on a bill being created/edited: each
// must sit on a real scope item/particular of the work order, bill no
// quantity, and not claim more than the balance that's actually left.
// Returns an error message, or null when fine.
async function checkBalanceLines(workOrder, lineItems, excludeBillId, billType) {
  const balanceLines = lineItems.filter((li) => li.isBalance);
  if (balanceLines.length === 0) return null;
  if (billType !== 'final') return 'A balance can only be billed in a Final Bill.';
  if (!workOrder || workOrder.contractType === 'professional-services') {
    return 'A balance line can only be billed against a contractor work order.';
  }
  const billed = await billedAmountMap([workOrder._id], excludeBillId);
  const claimed = new Map();
  for (const li of balanceLines) {
    const si = li.scopeItemId ? workOrder.scopeItems.id(li.scopeItemId) : null;
    const target = si ? resolveBillableItem(si, li.subItemId) : null;
    if (!target) return `"${li.description}" — balance line is not linked to a work order item.`;
    if (Number(li.billedQty) || Number(li.rate)) return `"${li.description}" — a balance line carries an amount only, no quantity or rate.`;
    const key = keyOf(li.scopeItemId, li.subItemId);
    const total = (claimed.get(key) || 0) + (Number(li.amount) || 0);
    claimed.set(key, total);
    const balance = balanceFor(target, billed.get(key));
    if (!(Number(li.amount) > 0) || total > balance + 0.5) {
      return `"${target.description}" — only ₹${balance.toLocaleString('en-IN')} balance is left to bill on this item.`;
    }
  }
  return null;
}

module.exports = { attachBalanceAmounts, checkBalanceLines };
