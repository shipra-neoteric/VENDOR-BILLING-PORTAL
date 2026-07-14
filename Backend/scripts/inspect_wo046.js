require('dotenv').config();
const mongoose    = require('mongoose');
const WorkOrder   = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0046' });
  if (!wo) { console.log('WO-0046 not found'); return; }

  console.log('WO-0046 scope items:');
  for (const si of wo.scopeItems) {
    console.log(`  "${si.description}" | unit=${si.unit} | rate=${si.rate} | plannedQty=${si.plannedQty}`);
  }

  const bill = await RunningBill.findOne({ billNo: 'RA-0077' });
  if (!bill) { console.log('\nRA-0077 not found'); return; }

  console.log(`\nRA-0077 lineItems:`);
  for (const li of bill.lineItems || []) {
    const si = wo.scopeItems.id(li.scopeItemId);
    console.log(`  "${si?.description}": billedQty=${li.billedQty} | rate=${li.rate} | amount=${li.amount}`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
