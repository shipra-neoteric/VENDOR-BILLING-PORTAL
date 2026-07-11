// Delete wrongly approved BR-0088 and its running bill RA-0086
// Rolls back lastBilledQty on WO-0141 for the affected scope items
require('dotenv').config();
const mongoose   = require('mongoose');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected\n');

  const br   = await BillRequest.findOne({ reqNo: 'BR-0088' });
  const bill = await RunningBill.findOne({ billNo: 'RA-0086' });
  const wo   = br ? await WorkOrder.findById(br.workOrderId) : null;

  if (!br)   { console.log('BR-0088 not found'); }
  if (!bill) { console.log('RA-0086 not found'); }
  if (!wo)   { console.log('WO not found for BR-0088'); }

  console.log('=== Will delete ===');
  console.log('BR-0088  status:', br?.status,  '| workOrderId:', br?.workOrderId);
  console.log('RA-0086  status:', bill?.status, '| amount:', bill?.amount);
  console.log('WO:', wo?.workOrderNo);
  console.log('\n=== Scope item rollback (lastBilledQty -= billedQty) ===');
  if (br && wo) {
    for (const item of br.items) {
      const si = item.scopeItemId
        ? wo.scopeItems.id(item.scopeItemId)
        : wo.scopeItems.find(s => s.description === item.description);
      if (si) {
        const before = si.lastBilledQty || 0;
        const after  = Math.max(0, before - (item.billedQty || 0));
        console.log(`  "${si.description}": ${before} → ${after}  (billedQty was ${item.billedQty})`);
      } else {
        console.log(`  "${item.description}": scope item not found — skipping`);
      }
    }
  }

  console.log('\nProceeding with deletion...\n');

  // 1. Roll back lastBilledQty on work order
  if (br && wo) {
    for (const item of br.items) {
      const si = item.scopeItemId
        ? wo.scopeItems.id(item.scopeItemId)
        : wo.scopeItems.find(s => s.description === item.description);
      if (si) {
        si.lastBilledQty = Math.max(0, (si.lastBilledQty || 0) - (item.billedQty || 0));
      }
    }
    await wo.save();
    console.log('✓ WO-0141 lastBilledQty rolled back');
  }

  // 2. Delete running bill RA-0086
  if (bill) {
    await RunningBill.deleteOne({ _id: bill._id });
    console.log('✓ Running bill RA-0086 deleted');
  }

  // 3. Delete bill request BR-0088
  if (br) {
    await BillRequest.deleteOne({ _id: br._id });
    console.log('✓ Bill request BR-0088 deleted');
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
