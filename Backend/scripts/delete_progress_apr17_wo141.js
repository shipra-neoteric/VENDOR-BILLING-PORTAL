// Delete 17 Apr 2026 progress entries from WO-0141 (Retaining Wall, Footing Work, JCB)
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('WO-0141 not found'); return; }

  let totalDeleted = 0;
  for (const si of wo.scopeItems) {
    const deleted = [];
    si.progressEntries = si.progressEntries.filter(e => {
      const d = new Date(e.date);
      const isApr17 = d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() === 17;
      if (isApr17) { deleted.push(e); return false; }
      return true;
    });
    if (deleted.length) {
      const qtyRemoved = deleted.reduce((s, e) => s + (e.qtyAdded || 0), 0);
      si.completedQty = si.progressEntries.reduce((s, e) => s + (e.qtyAdded || 0), 0);
      console.log(`  "${si.description}": removed qty=${qtyRemoved} | completedQty → ${si.completedQty}`);
      totalDeleted += deleted.length;
    }
  }

  if (totalDeleted === 0) {
    console.log('No Apr 17 entries found');
  } else {
    await wo.save();
    console.log(`\n✓ Deleted ${totalDeleted} entries. Saved.`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
