// Delete RA-0106, RA-0092 and BR-0117
require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder   = require('../src/models/WorkOrder');

async function deleteBill(billNo) {
  const bill = await RunningBill.findOne({ billNo });
  if (!bill) { console.log(`${billNo} not found — skipping`); return; }

  console.log(`\n=== ${billNo} | ${bill.vendorName} | ₹${bill.amount} ===`);

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
      if (changed) { await wo.save(); console.log(`  ✓ ${wo.workOrderNo} rolled back`); }
    }
  }

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

async function deleteBR(reqNo) {
  const br = await BillRequest.findOne({ reqNo });
  if (!br) { console.log(`\n${reqNo} not found — skipping`); return; }
  console.log(`\n=== ${reqNo} | ${br.vendorName} | ${br.projectName} ===`);
  await BillRequest.deleteOne({ _id: br._id });
  console.log(`  ✓ ${reqNo} deleted`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await deleteBill('RA-0106');
  await deleteBill('RA-0092');
  await deleteBR('BR-0117');
  console.log('\nDone.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
