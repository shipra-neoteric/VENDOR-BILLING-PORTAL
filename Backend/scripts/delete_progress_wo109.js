// Delete concrete plant operator progress entries in WO-0109
// KEEP: 02 May 2026 entry (+0.931)
// DELETE: 01 Jul, 03 Jun (both), 05 Apr
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0109' });
  if (!wo) { console.log('WO-0109 not found'); return; }

  const si = wo.scopeItems.find(s =>
    s.description?.toLowerCase().includes('concrete plant operator')
  );
  if (!si) { console.log('Scope item not found'); return; }

  console.log('Scope item:', si.description);
  console.log('Current completedQty:', si.completedQty);
  console.log('\nAll progress entries:');
  si.progressEntries.forEach((e, i) => {
    const d = new Date(e.date);
    console.log(`  [${i}] ${d.toDateString()} | qty=${e.qtyAdded} | loc=${e.locationNote || e.tower || '—'}`);
  });

  // Keep only 02 May 2026 entry
  const before = si.progressEntries.length;
  si.progressEntries = si.progressEntries.filter(e => {
    const d = new Date(e.date);
    const keep = d.getFullYear() === 2026 && d.getMonth() === 4 && d.getDate() === 2; // month is 0-indexed, May=4
    if (!keep) console.log(`  → DELETING: ${d.toDateString()} qty=${e.qtyAdded}`);
    else        console.log(`  → KEEPING:  ${d.toDateString()} qty=${e.qtyAdded}`);
    return keep;
  });

  const after = si.progressEntries.length;
  console.log(`\nDeleted ${before - after} entries, kept ${after}`);

  // Recalculate completedQty from remaining entries
  si.completedQty = si.progressEntries.reduce((sum, e) => sum + (e.qtyAdded || 0), 0);
  console.log('New completedQty:', si.completedQty);

  await wo.save();
  console.log('✓ Saved');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
