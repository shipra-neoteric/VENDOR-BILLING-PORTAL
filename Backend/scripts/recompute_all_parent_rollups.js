// One-off: force-recomputes every scope item's parent rollup (completedQty/
// status) from its particulars, using the corrected averaging formula in
// progressHelpers.recomputeParentFromSubItems. Purely a derived-display
// recalculation off already-stored particular data — no money, lastBilledQty,
// or billing state is touched. Needed because that recompute only normally
// runs when a particular's own progress is added/edited/deleted/invalidated,
// so any parent whose particulars haven't been touched since the rollup fix
// shipped is still showing its old (incorrect) number until this runs.
//
// Usage:
//   node scripts/recompute_all_parent_rollups.js           (dry run — prints only)
//   node scripts/recompute_all_parent_rollups.js --apply   (writes)
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const { recomputeParentFromSubItems } = require('../src/utils/progressHelpers');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will write)' : 'DRY RUN (no writes)');

  const workOrders = await WorkOrder.find({ 'scopeItems.subItems.0': { $exists: true } });
  console.log(`Checking ${workOrders.length} work order(s) with at least one particular-bearing item...`);

  let changedCount = 0;

  for (const wo of workOrders) {
    let woChanged = false;
    for (const si of wo.scopeItems) {
      if (!si.subItems || si.subItems.length === 0) continue;
      const before = { completedQty: si.completedQty, status: si.status };
      recomputeParentFromSubItems(si);
      if (si.completedQty !== before.completedQty || si.status !== before.status) {
        console.log(`  ${wo.workOrderNo} — "${si.description}": completedQty ${before.completedQty} -> ${si.completedQty}, status ${before.status} -> ${si.status}`);
        woChanged = true;
      }
    }
    if (woChanged) {
      changedCount++;
      if (APPLY) await wo.save();
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would change'}: ${changedCount} work order(s).`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
