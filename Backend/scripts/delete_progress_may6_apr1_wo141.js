// Delete 06 May 2026 and 01 Apr 2026 progress entries from WO-0141
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

function isTarget(date) {
  const d = new Date(date);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const isMay6  = y === 2026 && m === 4 && day === 6;
  const isApr1  = y === 2026 && m === 3 && day === 1;
  return isMay6 || isApr1;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0141' });
  if (!wo) { console.log('WO-0141 not found'); return; }

  let totalDeleted = 0;
  for (const si of wo.scopeItems) {
    const deleted = [];
    si.progressEntries = si.progressEntries.filter(e => {
      if (isTarget(e.date)) { deleted.push(e); return false; }
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
    console.log('No matching entries found');
  } else {
    await wo.save();
    console.log(`\n✓ Deleted ${totalDeleted} entries. Saved.`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
