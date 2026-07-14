// Delete all rejected RunningBills + rollback lastBilledQty on linked WOs
require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder   = require('../src/models/WorkOrder');

async function deleteBill(bill) {
  console.log(`\n=== ${bill.billNo} | ${bill.vendorName} | ${bill.projectName} | ₹${bill.amount} ===`);

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
          if (before !== si.lastBilledQty) {
            console.log(`  "${si.description}": lastBilledQty ${before} → ${si.lastBilledQty}`);
            changed = true;
          }
        }
      }
      if (changed) { await wo.save(); console.log(`  ✓ ${wo.workOrderNo} lastBilledQty rolled back`); }
    }
  }

  // Ensure linked BillRequest is rejected
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br && br.status !== 'rejected') {
    br.status = 'rejected';
    br.rejectReason = `Bill ${bill.billNo} deleted by admin`;
    await br.save();
    console.log(`  ✓ ${br.reqNo} set to rejected`);
  } else if (br) {
    console.log(`  BR ${br.reqNo} already rejected`);
  }

  await RunningBill.deleteOne({ _id: bill._id });
  console.log(`  ✓ ${bill.billNo} deleted`);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const bills = await RunningBill.find({ status: 'rejected' }).sort({ billNo: 1 });
  console.log(`Found ${bills.length} rejected bill(s) to delete.\n`);

  for (const bill of bills) {
    await deleteBill(bill);
  }

  console.log(`\n✓ All ${bills.length} rejected bills deleted.`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
