require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('Not found'); return; }

  for (const si of wo.scopeItems) {
    if (!si.progressEntries?.length) continue;
    console.log(`\n--- ${si.description} ---`);
    si.progressEntries.forEach(e => {
      const d = new Date(e.date);
      console.log(`  ${d.toDateString()} | qty=${e.qtyAdded} | loc=${e.locationNote || e.tower || '—'}`);
    });
  }
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
