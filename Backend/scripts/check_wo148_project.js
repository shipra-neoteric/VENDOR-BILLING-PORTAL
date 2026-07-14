require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  // Compare projectIds for Garden City Villa WOs
  const wos = await WorkOrder.find({ projectName: 'Garden City Villa' })
    .select('workOrderNo projectId vendorName vendorCode')
    .lean();

  const ids = [...new Set(wos.map(wo => wo.projectId?.toString()))];
  console.log(`Garden City Villa has ${ids.length} distinct projectId(s):`);
  ids.forEach(id => {
    const count = wos.filter(wo => wo.projectId?.toString() === id).length;
    console.log(`  ${id} → ${count} WOs`);
  });

  const wo148 = wos.find(wo => wo.workOrderNo === 'WO-0148');
  const wo151 = wos.find(wo => wo.workOrderNo === 'WO-0151');
  console.log('\nWO-0148 projectId:', wo148?.projectId?.toString());
  console.log('WO-0151 projectId:', wo151?.projectId?.toString());
  console.log('Same projectId?', wo148?.projectId?.toString() === wo151?.projectId?.toString());

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
