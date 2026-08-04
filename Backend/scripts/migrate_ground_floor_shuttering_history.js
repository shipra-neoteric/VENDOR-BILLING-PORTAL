// One-off: repairs the "Zen Garden" / WO-0160 Ground Floor scope item, whose
// old flat "Shuttering work" billing history got orphaned when the item was
// restructured into particulars (Column + Shuttering, Slab casting, Brick
// work, ...) — the restructuring minted a fresh scopeItemId for every
// particular without carrying forward the old item's lastBilledQty, so the
// already-billed shuttering quantity silently disappeared from tracking and
// started looking unbilled again on every new bill request.
//
// This script finds the actual historical bill(s) that billed the old flat
// "Shuttering work" item (matched by description, since its scopeItemId no
// longer resolves against the current WorkOrder at all) and re-attaches that
// quantity onto the "Column + Shuttering" particular under "Ground Floor" —
// marked as already billed, with a progress entry documenting the migration
// so it stays auditable rather than just appearing out of nowhere.
//
// Usage:
//   node scripts/migrate_ground_floor_shuttering_history.js           (dry run — prints only)
//   node scripts/migrate_ground_floor_shuttering_history.js --apply   (writes)
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');
const { recomputeParentFromSubItems } = require('../src/utils/progressHelpers');

const APPLY = process.argv.includes('--apply');

function looksLikeShuttering(desc) {
  return /shutter/i.test(desc || '');
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will write)' : 'DRY RUN (no writes)');

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0160' });
  if (!wo) throw new Error('WO-0160 not found — check you are pointed at the right database');

  const groundFloor = wo.scopeItems.find(si => /ground floor/i.test(si.description || ''));
  if (!groundFloor) throw new Error('"Ground Floor" scope item not found on WO-0160');

  const colSub = (groundFloor.subItems || []).find(s => /column.*shutter/i.test(s.description || ''));
  if (!colSub) throw new Error('"Column + Shuttering" particular not found under Ground Floor');

  console.log(`Found WO-0160, Ground Floor, particular "${colSub.description}" — current completedQty=${colSub.completedQty}, lastBilledQty=${colSub.lastBilledQty}`);

  // Historical bills referencing the old flat "Shuttering work" item, whose
  // scopeItemId no longer resolves anywhere on the current WorkOrder.
  const currentIds = new Set(wo.scopeItems.map(si => String(si._id)));
  const oldBRs = await BillRequest.find({ workOrderId: wo._id, status: 'approved' });
  const matches = [];
  for (const br of oldBRs) {
    for (const item of br.items) {
      if (item.scopeItemId && currentIds.has(String(item.scopeItemId))) continue; // still resolves, not orphaned
      if (!looksLikeShuttering(item.description)) continue;
      matches.push({ reqNo: br.reqNo, billId: br.billId, billedQty: item.billedQty, rate: item.rate, description: item.description, brId: br._id });
    }
  }

  if (!matches.length) {
    console.log('No orphaned historical "shuttering" bill line items found on WO-0160 — nothing to migrate. (Already fixed, or the data doesn\'t match what was described.)');
    await mongoose.disconnect();
    return;
  }

  console.log('\nHistorical bill line item(s) found that no longer resolve to any current scope item:');
  let totalQty = 0;
  for (const m of matches) {
    console.log(`  ${m.reqNo}: "${m.description}" — billedQty ${m.billedQty}, rate ${m.rate}`);
    totalQty += Number(m.billedQty) || 0;
  }
  console.log(`Total historical qty to attribute to "Column + Shuttering": ${totalQty}`);

  if (colSub.plannedQty && totalQty > colSub.plannedQty) {
    console.log(`WARNING: ${totalQty} exceeds this particular's plannedQty (${colSub.plannedQty}) — will still migrate as-is, but you may want to double check this is the right particular.`);
  }

  console.log(`\nPlanned change: "Column + Shuttering" completedQty ${colSub.completedQty} -> ${totalQty}, lastBilledQty ${colSub.lastBilledQty} -> ${totalQty}, status -> completed`);
  console.log(`A synthetic progressEntry will be added documenting this as a migrated historical record, linked to ${matches.map(m => m.reqNo).join(', ')}.`);

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write this change.');
    await mongoose.disconnect();
    return;
  }

  colSub.progressEntries.push({
    date: new Date(),
    qtyAdded: totalQty,
    remarks: `Migrated historical billing — originally billed under the old flat "Shuttering work" item (${matches.map(m => m.reqNo).join(', ')}) before Ground Floor was restructured into particulars. Not new site progress.`,
    billedInRequestId: matches[0].brId,
  });
  colSub.completedQty = totalQty;
  colSub.lastBilledQty = totalQty;
  colSub.status = 'completed';
  recomputeParentFromSubItems(groundFloor);

  await wo.save();
  console.log('\nApplied. Ground Floor now rolls up correctly, and "Column + Shuttering" shows as already billed.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
