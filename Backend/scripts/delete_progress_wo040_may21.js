// Delete 21 May 2026 Soil supply entry from WO-0040
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0040' });
  if (!wo) { console.log('WO-0040 not found'); return; }

  const si = wo.scopeItems.find(s => s.description?.toLowerCase().includes('soil supply'));
  if (!si) { console.log('Soil supply scope item not found'); return; }

  console.log('Scope item:', si.description, '| completedQty before:', si.completedQty);
  console.log('All entries:');
  si.progressEntries.forEach((e, i) => {
    const d = new Date(e.date);
    console.log(`  [${i}] ${d.toDateString()} | qty=${e.qtyAdded} | loc=${e.locationNote || e.plotNo || '—'}`);
  });

  const before = si.progressEntries.length;
  si.progressEntries = si.progressEntries.filter(e => {
    const d = new Date(e.date);
    const isMay21 = d.getFullYear() === 2026 && d.getMonth() === 4 && d.getDate() === 21;
    if (isMay21) { console.log(`\n→ DELETING: ${d.toDateString()} qty=${e.qtyAdded}`); return false; }
    return true;
  });

  const deleted = before - si.progressEntries.length;
  if (deleted === 0) { console.log('No May 21 entry found'); return; }

  si.completedQty = si.progressEntries.reduce((s, e) => s + (e.qtyAdded || 0), 0);
  console.log('completedQty → ', si.completedQty);

  await wo.save();
  console.log(`✓ Deleted ${deleted} entry. Saved.`);
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
