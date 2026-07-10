require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0175' });
  console.log('\n=== WO-0175 Scope Items ===');
  wo.scopeItems.forEach((si, i) => {
    console.log(`[${i}] _id=${si._id}  desc="${si.description}"  completed=${si.completedQty}  lastBilled=${si.lastBilledQty}`);
  });

  const bill = await RunningBill.findOne({ billNo: 'RA-0013' });
  console.log('\n=== RA-0013 ===');
  console.log('workOrderId:', bill.workOrderId);
  bill.lineItems.forEach((li, i) => {
    console.log(`[${i}] scopeItemId=${li.scopeItemId}  desc="${li.description}"  billedQty=${li.billedQty}`);
  });

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
