// One-time backfill: fills in `department` ONLY for Work Orders (and their
// linked BillRequest/RunningBill, since `department` is denormalized onto
// those too) that don't already have one set — never overwrites an existing
// department. Rule: Professional Services -> Planning, Execution -> Civil,
// with 3 explicit exceptions always forced to Marketing regardless of
// contractType (even if they already have some other department set).
//
// Run with --apply to write; without it, prints what WOULD change (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');

const APPLY = process.argv.includes('--apply');
const MARKETING_EXCEPTIONS = ['WO-0267', 'WO-0266', 'WO-0222'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const workOrders = await WorkOrder.find().select('workOrderNo contractType department').lean();
  let civilCount = 0, planningCount = 0, marketingCount = 0, skippedCount = 0;
  let billsUpdated = 0, runningBillsUpdated = 0;

  for (const wo of workOrders) {
    const isException = MARKETING_EXCEPTIONS.includes(wo.workOrderNo);

    // Already has a department, and isn't one of the forced exceptions —
    // leave it exactly as-is.
    if (!isException && wo.department) { skippedCount++; continue; }

    const dept = isException ? 'marketing' : (wo.contractType === 'professional-services' ? 'planning' : 'civil');
    if (dept === 'civil') civilCount++;
    else if (dept === 'planning') planningCount++;
    else marketingCount++;

    if (wo.department === dept) continue; // exception already correctly set, nothing to change

    console.log(`${APPLY ? 'SET' : '[dry-run] would set'} ${wo.workOrderNo}: department ${wo.department || '(blank)'} -> ${dept}`);
    if (APPLY) {
      await WorkOrder.updateOne({ _id: wo._id }, { $set: { department: dept, customDepartment: '' } });
      // Only fills in bills that don't already have their own department —
      // same "never overwrite existing data" rule as the Work Order above.
      const brRes = await BillRequest.updateMany(
        { workOrderId: wo._id, $or: [{ department: '' }, { department: { $exists: false } }] },
        { $set: { department: dept } }
      );
      const rbRes = await RunningBill.updateMany(
        { workOrderId: wo._id, $or: [{ department: '' }, { department: { $exists: false } }] },
        { $set: { department: dept } }
      );
      billsUpdated += brRes.modifiedCount;
      runningBillsUpdated += rbRes.modifiedCount;
    }
  }

  console.log(`\nWould newly set — Civil: ${civilCount}, Planning: ${planningCount}, Marketing: ${marketingCount}.`);
  console.log(`Left untouched (already had a department): ${skippedCount} of ${workOrders.length} work orders.`);
  if (APPLY) console.log(`Also filled in ${billsUpdated} BillRequest(s) and ${runningBillsUpdated} RunningBill(s) that had no department yet.`);
  else console.log('Re-run with --apply to write these changes.');

  await mongoose.disconnect();
})();
