// Fix WO-0175 Sewer chamber lastBilledQty which was missed because RA-0013 has no scopeItemId
// Matches by description as fallback
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const bills = await RunningBill.find({ workOrderId: { $exists: true } });

  const woCache = {};
  let fixed = 0;

  for (const bill of bills) {
    if (!bill.workOrderId) continue;
    const woId = bill.workOrderId.toString();
    if (!woCache[woId]) woCache[woId] = await WorkOrder.findById(bill.workOrderId);
    const wo = woCache[woId];
    if (!wo) continue;

    let changed = false;
    for (const li of bill.lineItems) {
      if (!li.billedQty) continue;
      // Try by scopeItemId first, fall back to description match
      let si = li.scopeItemId ? wo.scopeItems.id(li.scopeItemId) : null;
      if (!si) si = wo.scopeItems.find(s => s.description?.trim().toLowerCase() === li.description?.trim().toLowerCase());
      if (!si) continue;

      const cap = si.plannedQty || 999999;
      const needed = Math.min(cap, (si.lastBilledQty || 0) + Number(li.billedQty));
      if (needed > (si.lastBilledQty || 0)) {
        si.lastBilledQty = needed;
        changed = true;
        console.log(`  WO ${wo.workOrderNo} — "${si.description}": lastBilledQty → ${needed} (from bill ${bill.billNo})`);
      }
    }

    if (changed) { await wo.save(); fixed++; }
  }

  console.log(`\nFixed ${fixed} work order(s)`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
