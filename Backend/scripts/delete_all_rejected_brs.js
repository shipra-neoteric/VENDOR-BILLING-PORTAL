// Delete all rejected BillRequests
require('dotenv').config();
const mongoose    = require('mongoose');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const brs = await BillRequest.find({ status: 'rejected' }).sort({ reqNo: 1 });
  console.log(`Found ${brs.length} rejected bill request(s)\n`);

  for (const br of brs) {
    console.log(`${br.reqNo} | ${br.workOrderNo} | ${br.vendorName} | ${br.projectName}`);

    // If linked bill still exists and is not paid, roll back and delete it
    if (br.billId) {
      const bill = await RunningBill.findById(br.billId);
      if (bill && bill.status !== 'paid') {
        // Rollback lastBilledQty
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
                if (before !== si.lastBilledQty)
                  console.log(`  Rolled back "${si.description}": ${before} → ${si.lastBilledQty}`);
                changed = true;
              }
            }
            if (changed) await wo.save();
          }
        }
        await RunningBill.deleteOne({ _id: bill._id });
        console.log(`  ✓ Linked ${bill.billNo} deleted`);
      }
    }

    await BillRequest.deleteOne({ _id: br._id });
    console.log(`  ✓ ${br.reqNo} deleted`);
  }

  console.log(`\n✓ All ${brs.length} rejected bill requests deleted.`);
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
