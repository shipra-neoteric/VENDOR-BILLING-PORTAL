// One-off: move all data (RunningBills, BillRequests, activity log) from
// PRJ-014 "Nature park" (a pre-existing duplicate) onto PRJ-030 "Nature Park"
// (the new sub-project under the "Nature Park" parent), then delete PRJ-014.
require('dotenv').config();
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const WorkOrder = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const ProjectEvent = require('../src/models/ProjectEvent');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const from = await Project.findOne({ code: 'PRJ-014' });
  const to = await Project.findOne({ code: 'PRJ-030' });
  if (!from) { console.log('PRJ-014 not found'); return; }
  if (!to) { console.log('PRJ-030 not found'); return; }
  console.log(`Moving data: ${from.code} "${from.name}" -> ${to.code} "${to.name}"`);

  const bills = await RunningBill.updateMany(
    { projectId: from._id },
    { $set: { projectId: to._id, projectName: to.name } }
  );
  console.log(`RunningBills moved: ${bills.modifiedCount}`);

  const billReqs = await BillRequest.updateMany(
    { projectId: from._id },
    { $set: { projectId: to._id, projectName: to.name } }
  );
  console.log(`BillRequests moved: ${billReqs.modifiedCount}`);

  const events = await ProjectEvent.updateMany(
    { projectId: from._id },
    { $set: { projectId: to._id } }
  );
  console.log(`ProjectEvents (activity log) moved: ${events.modifiedCount}`);

  const remainingWOs = await WorkOrder.countDocuments({ projectId: from._id });
  const remainingBills = await RunningBill.countDocuments({ projectId: from._id });
  const remainingBillReqs = await BillRequest.countDocuments({ projectId: from._id });
  console.log(`\nPRJ-014 remaining refs -> WOs: ${remainingWOs}, RunningBills: ${remainingBills}, BillRequests: ${remainingBillReqs}`);

  if (remainingWOs === 0 && remainingBills === 0 && remainingBillReqs === 0) {
    await Project.deleteOne({ _id: from._id });
    console.log(`Deleted ${from.code} "${from.name}"`);
  } else {
    console.log('NOT deleting PRJ-014 — some references remain.');
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
