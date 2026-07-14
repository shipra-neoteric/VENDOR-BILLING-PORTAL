// Delete paid bill RA-0058 (Girraj Prajapati / WO-0018 / Daily Wages / ₹3000)
require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const bill = await RunningBill.findOne({ billNo: 'RA-0058' });
  if (!bill) { console.log('RA-0058 not found'); return; }

  console.log(`RA-0058 | status=${bill.status} | amount=₹${bill.amount} | paidAmount=₹${bill.paidAmount}`);

  // Roll back lastBilledQty on WO-0018
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

  // Reject linked BillRequest
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br) {
    br.status = 'rejected';
    br.rejectReason = 'Bill RA-0058 deleted by admin';
    await br.save();
    console.log(`  ✓ ${br.reqNo} set to rejected`);
  }

  await RunningBill.deleteOne({ _id: bill._id });
  console.log('  ✓ RA-0058 deleted');

  console.log('\nDone.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
