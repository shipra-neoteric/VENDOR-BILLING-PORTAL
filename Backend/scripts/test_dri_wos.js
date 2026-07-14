require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const User      = require('../src/models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const dri = await User.findOne({ email: 'dri1@neotericgrp.in' });
  console.log('DRI 1 _id:', dri._id);

  // Simulate what listWorkOrders does for DRI role (no projectId filter)
  const all = await WorkOrder.find({ assignedDRI: dri._id }).lean();

  console.log(`\nTotal WOs for DRI 1: ${all.length}`);

  // Filter to Garden City Villa
  const gcv = all.filter(wo => wo.projectName === 'Garden City Villa');
  console.log(`\nGarden City Villa WOs: ${gcv.length}`);
  gcv.forEach(wo => {
    console.log(`  ${wo.workOrderNo} | ${wo.vendorName} | ${wo.vendorCode} | status=${wo.status}`);
  });

  // Specifically check WO-0148
  const wo148 = all.find(wo => wo.workOrderNo === 'WO-0148');
  console.log('\nWO-0148 in DRI results:', wo148 ? 'YES ✓' : 'NO ✗');

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
