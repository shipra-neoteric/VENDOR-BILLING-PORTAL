// Inspect WO-0034 scope items and RA-0010 line items to find the mismatch
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0034' });
  console.log('\n=== WO-0034 Scope Items ===');
  wo.scopeItems.forEach((si, i) => {
    console.log(`[${i}] _id=${si._id}  desc="${si.description}"  remarks="${si.remarks}"  planned=${si.plannedQty}  completed=${si.completedQty}  lastBilled=${si.lastBilledQty}`);
  });

  const bill = await RunningBill.findOne({ billNo: 'RA-0010' });
  console.log('\n=== RA-0010 Line Items ===');
  bill.lineItems.forEach((li, i) => {
    console.log(`[${i}] scopeItemId=${li.scopeItemId}  desc="${li.description}"  billedQty=${li.billedQty}`);
  });

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
