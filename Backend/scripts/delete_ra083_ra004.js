// Delete RA-0083 (Submitted) and RA-0004 (Approved) for Ambikeshwar
// Rolls back lastBilledQty on linked work orders and syncs bill requests
require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder   = require('../src/models/WorkOrder');

async function deleteBill(billNo) {
  const bill = await RunningBill.findOne({ billNo });
  if (!bill) { console.log(`${billNo} not found — skipping`); return; }

  console.log(`\n=== ${billNo} | status: ${bill.status} | amount: ${bill.amount} ===`);

  // Roll back lastBilledQty on work order
  if (bill.workOrderId && bill.lineItems?.length) {
    const wo = await WorkOrder.findById(bill.workOrderId);
    if (wo) {
      let changed = false;
      for (const li of bill.lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = wo.scopeItems.id(li.scopeItemId);
        if (si) {
          const before = si.lastBilledQty || 0;
          si.lastBilledQty = Math.max(0, before - Number(li.billedQty));
          console.log(`  "${si.description}": lastBilledQty ${before} → ${si.lastBilledQty}`);
          changed = true;
        }
      }
      if (changed) { await wo.save(); console.log(`  ✓ ${wo.workOrderNo} lastBilledQty rolled back`); }
    }
  }

  // Sync linked bill request → rejected
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br) {
    br.status = 'rejected';
    br.rejectReason = `Bill ${billNo} deleted by admin`;
    await br.save();
    console.log(`  ✓ ${br.reqNo} set to rejected`);
  }

  await RunningBill.deleteOne({ _id: bill._id });
  console.log(`  ✓ ${billNo} deleted`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected');
  await deleteBill('RA-0083');
  await deleteBill('RA-0004');
  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
