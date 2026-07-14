require('dotenv').config();
const mongoose    = require('mongoose');
const WorkOrder   = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('Not found'); return; }

  const bills = await RunningBill.find({ workOrderId: wo._id }).sort({ createdAt: 1 });
  console.log(`Found ${bills.length} bill(s) for WO-0141:\n`);

  for (const b of bills) {
    console.log(`${b.billNo} | status=${b.status} | amount=${b.amount}`);
    for (const li of b.lineItems || []) {
      const si = wo.scopeItems.id(li.scopeItemId);
      console.log(`  "${si?.description || li.scopeItemId}": billedQty=${li.billedQty}`);
    }
    console.log('');
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
