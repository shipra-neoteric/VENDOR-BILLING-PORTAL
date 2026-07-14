require('dotenv').config();
const mongoose    = require('mongoose');
const WorkOrder   = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0046' });
  const bill = await RunningBill.findOne({ billNo: 'RA-0077' });

  console.log('Scope items in WO-0046 (description | _id | rate):');
  for (const si of wo.scopeItems) {
    console.log(`  "${si.description}" | ${si._id} | rate=${si.rate}`);
  }

  console.log('\nRA-0077 line item scopeItemId:');
  for (const li of bill.lineItems || []) {
    console.log(`  scopeItemId=${li.scopeItemId} | billedQty=${li.billedQty} | rate=${li.rate}`);
    const found = wo.scopeItems.find(s => s._id.toString() === li.scopeItemId?.toString());
    console.log(`  → matches: ${found ? `"${found.description}" rate=${found.rate}` : 'NOT FOUND'}`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
