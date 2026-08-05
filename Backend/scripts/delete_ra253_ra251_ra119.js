// Deletes three erroneous/duplicate draft-or-submitted bills, none of which
// have any paidAmount recorded (verified before writing this script):
//   RA-0253 — WO-0160 (Zen Garden/Ambika) — "Shuttering work" 12,277 — draft
//   RA-0251 — WO-0089 (Ambika)            — "RAFT" 12,000          — draft
//   RA-0119 — WO-0160 (Zen Garden/Ambika) — "Shuttering work" 12,277 — submitted
// RA-0253 and RA-0119 are duplicates of each other (same WO, same line item,
// same amount) — part of the same Shuttering-work billing mess already being
// untangled on WO-0160 elsewhere in this session.
//
// For each bill: rolls back lastBilledQty on the scope item/particular it
// billed (mirroring the fix applied to the reject-bill-request flow — resolves
// the exact particular via resolveBillableItem, not just the parent), rejects
// any BillRequest still pointing at it, then deletes the RunningBill itself.
// Refuses to touch any bill that turns out to have a paidAmount > 0 — this
// script is only safe for bills where no real money has moved yet.
//
// Usage:
//   node scripts/delete_ra253_ra251_ra119.js           (dry run — prints only)
//   node scripts/delete_ra253_ra251_ra119.js --apply   (writes)
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder = require('../src/models/WorkOrder');
const { resolveBillableItem } = require('../src/utils/varianceCheck');
const { recomputeParentFromSubItems } = require('../src/utils/progressHelpers');

const APPLY = process.argv.includes('--apply');
const BILL_NOS = ['RA-0253', 'RA-0251', 'RA-0119'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will write)' : 'DRY RUN (no writes)');

  for (const billNo of BILL_NOS) {
    console.log(`\n--- ${billNo} ---`);
    const bill = await RunningBill.findOne({ billNo });
    if (!bill) { console.log('  Not found — skipping.'); continue; }

    console.log(`  status=${bill.status}  amount=₹${bill.amount}  paidAmount=₹${bill.paidAmount || 0}  workOrder=${bill.workOrderNo}`);

    if (Number(bill.paidAmount) > 0) {
      console.log('  REFUSING to delete — this bill has a paidAmount > 0 (real money already moved). Skipped.');
      continue;
    }

    const wo = bill.workOrderId ? await WorkOrder.findById(bill.workOrderId) : null;
    if (wo) {
      const touchedParents = new Set();
      for (const li of bill.lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = wo.scopeItems.id(li.scopeItemId);
        if (!si) { console.log(`  (scopeItemId for "${li.description}" no longer resolves on ${wo.workOrderNo} — nothing to roll back there)`); continue; }
        const target = resolveBillableItem(si, li.subItemId);
        if (!target) continue;
        const before = target.lastBilledQty || 0;
        const after = Math.max(0, before - Number(li.billedQty));
        console.log(`  "${li.description}": lastBilledQty ${before} -> ${after}`);
        if (APPLY) {
          target.lastBilledQty = after;
          if (li.subItemId) touchedParents.add(String(li.scopeItemId));
        }
      }
      if (APPLY) {
        for (const scopeItemId of touchedParents) {
          const si = wo.scopeItems.id(scopeItemId);
          if (si) recomputeParentFromSubItems(si);
        }
        await wo.save();
      }
    }

    const br = await BillRequest.findOne({ billId: bill._id });
    if (br) {
      console.log(`  Linked bill request: ${br.reqNo} (status=${br.status}) -> will be rejected`);
      if (APPLY) {
        br.status = 'rejected';
        br.rejectReason = `Bill ${billNo} deleted by admin (duplicate/erroneous, unpaid)`;
        await br.save();
      }
    }

    console.log(`  ${APPLY ? 'Deleting' : 'Would delete'} ${billNo}.`);
    if (APPLY) await RunningBill.deleteOne({ _id: bill._id });
  }

  console.log(`\n${APPLY ? 'Done.' : 'Dry run only — re-run with --apply to write these changes.'}`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
