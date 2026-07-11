// Delete 17 May 2026 progress entries from WO-0141 (all scope items)
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('WO-0141 not found'); return; }

  console.log('WO-0141:', wo.vendorName || wo.workOrderNo);

  let totalDeleted = 0;
  for (const si of wo.scopeItems) {
    const before = si.progressEntries.length;
    const deleted = [];
    si.progressEntries = si.progressEntries.filter(e => {
      const d = new Date(e.date);
      const isMay17 = d.getFullYear() === 2026 && d.getMonth() === 4 && d.getDate() === 17;
      if (isMay17) { deleted.push(e); return false; }
      return true;
    });
    if (deleted.length) {
      const qtyRemoved = deleted.reduce((s, e) => s + (e.qtyAdded || 0), 0);
      console.log(`  "${si.description}": deleted ${deleted.length} entry (qty=${qtyRemoved})`);
      // Recalculate completedQty
      si.completedQty = si.progressEntries.reduce((s, e) => s + (e.qtyAdded || 0), 0);
      console.log(`    completedQty → ${si.completedQty}`);
      totalDeleted += deleted.length;
    }
  }

  if (totalDeleted === 0) {
    console.log('No May 17 2026 entries found in WO-0141');
  } else {
    await wo.save();
    console.log(`\n✓ Deleted ${totalDeleted} entries. Saved.`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
