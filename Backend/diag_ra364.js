require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('./src/models/RunningBill');
async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const bill = await RunningBill.findOne({ billNo: 'RA-0364' }).lean();
  if (!bill) { console.log('RA-0364 not found'); return; }
  console.log(JSON.stringify(bill, null, 2));
  await mongoose.disconnect();
}
main().catch(e=>{console.error(e); process.exit(1);});
