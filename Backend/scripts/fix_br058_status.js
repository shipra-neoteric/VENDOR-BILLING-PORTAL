// Fix BR-0058: running bill was rejected in Billing & Payments
// but bill request still shows "approved" — sync it to "rejected"
require('dotenv').config();
const mongoose    = require('mongoose');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected\n');

  const br = await BillRequest.findOne({ reqNo: 'BR-0058' });
  if (!br) { console.log('BR-0058 not found'); return; }

  console.log('BR-0058 status:', br.status);
  console.log('BR-0058 billId:', br.billId);

  const bill = br.billId ? await RunningBill.findById(br.billId) : null;
  console.log('Running bill:', bill?.billNo, '| status:', bill?.status);

  if (bill && bill.status === 'rejected') {
    br.status = 'rejected';
    br.rejectReason = 'Bill rejected in Billing & Payments';
    await br.save();
    console.log('✓ BR-0058 status updated to rejected');

    // Roll back lastBilledQty on work order
    if (bill.workOrderId) {
      const wo = await WorkOrder.findById(bill.workOrderId);
      if (wo) {
        let changed = false;
        for (const li of bill.lineItems || []) {
          if (!li.scopeItemId || !li.billedQty) continue;
          const si = wo.scopeItems.id(li.scopeItemId);
          if (si) {
            const before = si.lastBilledQty || 0;
            si.lastBilledQty = Math.max(0, before - Number(li.billedQty));
            console.log(`  "${si.description}": lastBilledQty ${before} → ${si.lastBilledQty}`);
            changed = true;
          }
        }
        if (changed) {
          await wo.save();
          console.log(`✓ ${wo.workOrderNo} lastBilledQty rolled back`);
        }
      }
    }
  } else {
    console.log('Running bill is not rejected — no changes made. Current status:', bill?.status);
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
