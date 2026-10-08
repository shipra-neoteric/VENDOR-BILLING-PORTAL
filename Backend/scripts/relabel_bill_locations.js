// One-time reformat: item.location strings saved by older code (no labels,
// or labels joined with " · ") get rebuilt into the current format (labeled,
// arrow-prefixed, one field per line — see billRequestController.js's
// collectAndMarkProgressRemarks) by re-deriving them from the same raw
// progressEntries (tower/floor/flatNo/plotNo/locationNote) that originally
// produced them — those entries are never deleted, only flagged
// billedInRequestId, so the original source data is still intact.
//
// Purely cosmetic (a display string) — never touches amount/approval/status
// fields, so this is safe to run directly, unlike the force-paid-bills
// correction script.
//
// Run with --apply to write; without it, prints what WOULD change (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder = require('../src/models/WorkOrder');
const { resolveBillableItem } = require('../src/utils/varianceCheck');

const APPLY = process.argv.includes('--apply');

function buildLocation(entries) {
  const locations = [];
  for (const entry of entries) {
    const location = [
      entry.tower && `Tower ${entry.tower}`,
      entry.floor && `→ Floor: ${entry.floor}`,
      entry.flatNo && `→ Flat No: ${entry.flatNo}`,
      entry.plotNo && `→ Plot: ${entry.plotNo}`,
      entry.locationNote && `→ Note: ${entry.locationNote}`,
    ].filter(Boolean).join('\n');
    if (location && !locations.includes(location)) locations.push(location);
  }
  return locations.join('\n\n');
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const workOrders = await WorkOrder.find({}).select('scopeItems').lean(false);
  const woById = new Map(workOrders.map((wo) => [String(wo._id), wo]));

  const billRequests = await BillRequest.find({}).select('items workOrderId billId reqNo');
  let itemsChecked = 0, itemsChanged = 0, reqsChanged = 0;

  for (const br of billRequests) {
    let changed = false;
    const wo = br.workOrderId ? woById.get(String(br.workOrderId)) : null;
    for (const item of br.items) {
      itemsChecked++;
      if (!wo) continue;
      const si = wo.scopeItems.id(item.scopeItemId);
      const target = resolveBillableItem(si, item.subItemId);
      if (!target || !target.progressEntries) continue;

      const matched = target.progressEntries.filter(
        (e) => e.billedInRequestId && String(e.billedInRequestId) === String(br._id)
      );
      if (matched.length === 0) continue;

      const newLocation = buildLocation(matched);
      if (newLocation && newLocation !== item.location) {
        console.log(`${APPLY ? 'UPDATING' : '[dry-run] would update'}: ${br.reqNo} / ${item.description}`);
        console.log(`  old: ${JSON.stringify(item.location)}`);
        console.log(`  new: ${JSON.stringify(newLocation)}`);
        itemsChanged++;
        changed = true;
        if (APPLY) item.location = newLocation;
      }
    }
    if (changed) {
      reqsChanged++;
      if (APPLY) {
        try {
          // validateBeforeSave: false — several older BillRequest/RunningBill
          // docs carry now-invalid enum values on unrelated fields (e.g. a
          // RunningBill.status of 'verified', predating a later rename to
          // 'verify-done') that have nothing to do with this script's only
          // change (item.location, a plain display string) — a full-document
          // .save() would refuse to write at all because of that unrelated,
          // pre-existing data, not anything this script touched.
          await br.save({ validateBeforeSave: false });
          // Cascade onto the already-finalized RunningBill's own lineItems too
          // (same scopeItemId/subItemId match) — it was snapshotted off this
          // BillRequest at finalize time and never re-synced since. A scoped
          // updateOne (not fetch+.save()) so it never touches/validates any
          // other field on that document either.
          if (br.billId) {
            const bill = await RunningBill.findById(br.billId).select('lineItems');
            if (bill) {
              const setOps = {};
              bill.lineItems.forEach((li, idx) => {
                const match = br.items.find(
                  (it) => String(it.scopeItemId) === String(li.scopeItemId) &&
                    String(it.subItemId || '') === String(li.subItemId || '')
                );
                if (match && match.location && match.location !== li.location) {
                  setOps[`lineItems.${idx}.location`] = match.location;
                }
              });
              if (Object.keys(setOps).length) {
                await RunningBill.updateOne({ _id: bill._id }, { $set: setOps });
              }
            }
          }
        } catch (err) {
          console.error(`  FAILED to save ${br.reqNo}: ${err.message}`);
        }
      }
    }
  }

  console.log(`\nChecked ${itemsChecked} items across ${billRequests.length} bill requests.`);
  console.log(`${APPLY ? 'Updated' : 'Would update'}: ${itemsChanged} item(s) across ${reqsChanged} bill request(s).`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');

  await mongoose.disconnect();
})();
