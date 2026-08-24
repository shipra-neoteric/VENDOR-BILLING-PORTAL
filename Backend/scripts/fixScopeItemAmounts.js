// One-off data fix: a scope item's/particular's stored `amount` field is a
// snapshot (plannedQty * rate) taken at whatever create/edit last touched it -
// it's what the Work Order View drawer and the PDF both display directly
// (WorkOrderDetailView.tsx, WorkOrderPDF.tsx), rather than recomputing live.
// The Edit form always recomputes live from plannedQty/rate (calcDraftItemAmt
// in WorkItems/index.tsx), which is why Edit shows the right number while
// View/PDF show a stale one for the same item.
//
// A system-wide scan found exactly 2 work orders where the stored amount no
// longer matches plannedQty * rate (WO-0160, WO-0175) - every affected line
// is short by exactly 80 units' worth, on every floor of a multi-storey
// contract, suggesting a bulk quantity correction was saved at some point
// without this specific recompute landing for these two. Billing itself is
// unaffected either way - a bill always computes billedQty * rate fresh at
// creation time, never reading this cached field - this only fixes what's
// displayed on the Work Order's own View/PDF.
//
// Usage:
//   node scripts/fixScopeItemAmounts.js            (dry run - reports only)
//   node scripts/fixScopeItemAmounts.js --apply     (writes the fix)
//   node scripts/fixScopeItemAmounts.js --apply WO-0160   (limit to one WO)

require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

const APPLY = process.argv.includes('--apply');
const only = process.argv.find(a => /^WO-\d+$/i.test(a));

const round2 = (n) => Math.round((n || 0) * 100) / 100;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}${only ? ` — limited to ${only}` : ''}`);

  const filter = only ? { workOrderNo: only } : {};
  const workOrders = await WorkOrder.find(filter);
  console.log(`Checking ${workOrders.length} work order(s)...\n`);

  let woFixed = 0, itemsFixed = 0, subItemsFixed = 0, totalDelta = 0;

  for (const wo of workOrders) {
    let changed = false;
    for (const si of wo.scopeItems) {
      const correct = round2((si.plannedQty || 0) * (si.rate || 0));
      if (Math.abs(correct - (si.amount || 0)) > 0.01) {
        console.log(`[fix] ${wo.workOrderNo} — "${si.description}": ${si.amount} -> ${correct}`);
        totalDelta += correct - (si.amount || 0);
        si.amount = correct;
        itemsFixed++; changed = true;
      }
      for (const sub of si.subItems || []) {
        const correctSub = round2((sub.plannedQty || 0) * (sub.rate || 0));
        if (Math.abs(correctSub - (sub.amount || 0)) > 0.01) {
          console.log(`[fix]   ${wo.workOrderNo} — "${si.description}" > "${sub.description}": ${sub.amount} -> ${correctSub}`);
          totalDelta += correctSub - (sub.amount || 0);
          sub.amount = correctSub;
          subItemsFixed++; changed = true;
        }
      }
    }
    if (changed) {
      woFixed++;
      if (APPLY) await wo.save();
    }
  }

  console.log('\n── Summary ──');
  console.log({ woFixed, itemsFixed, subItemsFixed, totalDelta: round2(totalDelta) });
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  process.exit(0);
})();
