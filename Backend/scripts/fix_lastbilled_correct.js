// Recalculate lastBilledQty correctly for all WOs from scratch
// by summing billedQty across all bills per scope item (no double-counting)
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');

  const workOrders = await WorkOrder.find({});
  const bills      = await RunningBill.find({ workOrderId: { $exists: true } });

  // Group bills by workOrderId
  const billsByWO = {};
  for (const b of bills) {
    const wid = b.workOrderId.toString();
    if (!billsByWO[wid]) billsByWO[wid] = [];
    billsByWO[wid].push(b);
  }

  let totalFixed = 0;

  for (const wo of workOrders) {
    const woBills = billsByWO[wo._id.toString()] || [];
    if (!woBills.length) continue;

    // Compute correct lastBilledQty per scope item from scratch
    // Map: scopeItemId → total billed qty
    const correctBilled = {};   // scopeItemId string → number

    for (const bill of woBills) {
      for (const li of bill.lineItems) {
        if (!li.billedQty) continue;
        let siId = null;

        if (li.scopeItemId) {
          siId = li.scopeItemId.toString();
        } else {
          // Description fallback — match FIRST scope item with same description
          const si = wo.scopeItems.find(s =>
            s.description?.trim().toLowerCase() === li.description?.trim().toLowerCase()
          );
          if (si) siId = si._id.toString();
        }

        if (!siId) continue;
        correctBilled[siId] = (correctBilled[siId] || 0) + Number(li.billedQty);
      }
    }

    let changed = false;
    for (const si of wo.scopeItems) {
      const correct = correctBilled[si._id.toString()] ?? 0;
      if (si.lastBilledQty !== correct) {
        console.log(`  WO ${wo.workOrderNo} — "${si.description}" (${si.remarks || '—'}): ${si.lastBilledQty} → ${correct}`);
        si.lastBilledQty = correct;
        changed = true;
      }
    }

    if (changed) {
      await wo.save();
      totalFixed++;
    }
  }

  console.log(`\nDone — corrected ${totalFixed} work order(s)`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
