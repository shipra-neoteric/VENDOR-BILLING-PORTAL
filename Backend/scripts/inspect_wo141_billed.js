require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('Not found'); return; }

  for (const si of wo.scopeItems) {
    console.log(`${si.description}: completedQty=${si.completedQty} | lastBilledQty=${si.lastBilledQty} | unbilled=${(si.completedQty||0)-(si.lastBilledQty||0)}`);
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
