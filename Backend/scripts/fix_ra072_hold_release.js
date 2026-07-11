// RA-0072: bill was ₹22,500 but ₹72,500 was paid (₹50,000 was hold release)
// Set retentionReleased = 50000 so the receipt shows the breakdown correctly
require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const bill = await RunningBill.findOne({ billNo: 'RA-0072' });
  if (!bill) { console.log('RA-0072 not found'); return; }

  console.log('RA-0072  paidAmount:', bill.paidAmount, '| amount:', bill.amount);
  const holdRelease = Math.round(bill.paidAmount - bill.amount);
  console.log('Computed hold release:', holdRelease);

  bill.retentionReleased      = holdRelease > 0 ? holdRelease : 50000;
  bill.retentionReleaseRemark = 'Previous retention release';
  await bill.save();
  console.log('✓ RA-0072 retentionReleased set to', bill.retentionReleased);

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
