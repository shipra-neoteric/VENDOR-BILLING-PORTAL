// Fix lastBilledQty for WO-0141 after progress entry deletions
// Retaining Wall: 1948 → 1644, Footing Work: 3095 → 1080, JCB: 4 → 0
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

const fixes = {
  'Retaining Wall': 1644,
  'Footing Work':   1080,
  'JCB':            0,
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('WO-0141 not found'); return; }

  for (const si of wo.scopeItems) {
    if (si.description in fixes) {
      const before = si.lastBilledQty || 0;
      si.lastBilledQty = fixes[si.description];
      console.log(`  "${si.description}": lastBilledQty ${before} → ${si.lastBilledQty}`);
    }
  }

  await wo.save();
  console.log('\n✓ WO-0141 lastBilledQty updated. Saved.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
