require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const bill = await RunningBill.findOne({ billNo: 'RA-0067' });
  const br   = await BillRequest.findOne({ reqNo: 'BR-0078' });

  console.log('RA-0067:', bill?.status, '| amount:', bill?.amount);
  console.log('BR-0078:', br?.status);

  // Roll back lastBilledQty on WO-0125
  if (bill?.workOrderId && bill.lineItems?.length) {
    const wo = await WorkOrder.findById(bill.workOrderId);
    if (wo) {
      let changed = false;
      for (const li of bill.lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = wo.scopeItems.id(li.scopeItemId);
        if (si) {
          const before = si.lastBilledQty || 0;
          si.lastBilledQty = Math.max(0, before - Number(li.billedQty));
          console.log(`  "${si.description}": ${before} → ${si.lastBilledQty}`);
          changed = true;
        }
      }
      if (changed) { await wo.save(); console.log('✓ WO-0125 lastBilledQty rolled back'); }
    }
  }

  if (bill) { await RunningBill.deleteOne({ _id: bill._id }); console.log('✓ RA-0067 deleted'); }
  if (br)   { await BillRequest.deleteOne({ _id: br._id });   console.log('✓ BR-0078 deleted'); }

  console.log('\nDone.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
