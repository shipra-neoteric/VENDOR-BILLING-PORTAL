require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const User      = require('../src/models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0148' });
  if (!wo) { console.log('Not found'); return; }

  console.log('workOrderNo:', wo.workOrderNo);
  console.log('vendor:', wo.vendorName, '|', wo.vendorCode);
  console.log('project:', wo.projectName);
  console.log('assignedDRI:', wo.assignedDRI);

  // Find DRI 1
  const dri = await User.findOne({ email: 'dri1@neotericgrp.in' });
  console.log('\nDRI 1 _id:', dri?._id);
  console.log('Is DRI 1 assigned?', wo.assignedDRI?.toString() === dri?._id?.toString());

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
