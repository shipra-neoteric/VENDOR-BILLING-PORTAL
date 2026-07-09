// Fix lastBilledQty on scope items for all manually-created bills that never set it
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const bills = await RunningBill.find({
    status: { $in: ['submitted', 'verified', 'approved', 'paid'] },
  });

  console.log(`Found ${bills.length} bills to process`);

  let woFixed = 0;
  const woCache = {};

  for (const bill of bills) {
    if (!bill.workOrderId) continue;

    const woId = bill.workOrderId.toString();
    if (!woCache[woId]) {
      woCache[woId] = await WorkOrder.findById(bill.workOrderId);
    }
    const wo = woCache[woId];
    if (!wo) continue;

    let changed = false;
    for (const li of bill.lineItems) {
      if (!li.scopeItemId || !li.billedQty) continue;
      const si = wo.scopeItems.id(li.scopeItemId);
      if (!si) continue;
      const cap = si.plannedQty || 999999;
      const needed = Math.min(cap, (si.lastBilledQty || 0) + Number(li.billedQty));
      if (needed > (si.lastBilledQty || 0)) {
        si.lastBilledQty = needed;
        changed = true;
      }
    }

    if (changed) {
      await wo.save();
      woFixed++;
      console.log(`  Fixed WO ${wo.workOrderNo} (from bill ${bill.billNo})`);
    }
  }

  console.log(`\nDone — fixed lastBilledQty on ${woFixed} work order(s)`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
