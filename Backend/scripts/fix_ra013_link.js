// Fix RA-0013: its workOrderId points to wrong doc; correct lastBilledQty for Sewer chamber
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const WorkOrder   = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo   = await WorkOrder.findOne({ workOrderNo: 'WO-0175' });
  const bill = await RunningBill.findOne({ billNo: 'RA-0013' });

  console.log('WO-0175 _id  :', wo._id);
  console.log('RA-0013 workOrderId:', bill.workOrderId);

  // Fix workOrderId on the bill so it points to the correct WO
  bill.workOrderId = wo._id;
  await bill.save();
  console.log('Fixed RA-0013 workOrderId → WO-0175');

  // Set lastBilledQty = 11 for Sewer chamber (billedQty from RA-0013)
  const si = wo.scopeItems.find(s => s.description === 'Sewer chamber');
  if (si) {
    si.lastBilledQty = 11;
    await wo.save();
    console.log('Fixed WO-0175 Sewer chamber lastBilledQty → 11');
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
