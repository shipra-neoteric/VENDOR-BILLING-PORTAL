require('dotenv').config();
const mongoose    = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const bills = await RunningBill.find({ status: 'rejected' }).sort({ billNo: 1 });
  console.log(`Found ${bills.length} rejected bill(s):\n`);

  for (const b of bills) {
    const br = await BillRequest.findOne({ billId: b._id });
    console.log(`${b.billNo} | ${b.vendorName} | ${b.projectName} | ₹${b.amount} | BR: ${br?.reqNo || 'none'}`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
