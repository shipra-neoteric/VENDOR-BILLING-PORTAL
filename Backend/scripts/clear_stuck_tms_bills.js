// One-time cleanup: TMS's payment-confirmed webhook isn't firing reliably
// (billController.js's tmsCallback is on hold), leaving some bills' SLA
// instances stuck in-progress at the "Payment Initiated"/"Payment Released"
// stage — the two stages that only ever complete via that callback. Finds
// every BillRequest stuck at exactly one of those two stages, marks its
// linked RunningBill as 'paid' (same fields tmsCallback itself would set),
// and completes the SLA instance — same effect as if TMS had actually
// called back for each one.
//
// Run with --apply to write; without it, prints what WOULD change (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const WorkflowInstance = require('../src/models/WorkflowInstance');
const { advanceInstance } = require('../src/utils/slaEngine');

const APPLY = process.argv.includes('--apply');
const TMS_STAGES = new Set(['Payment Initiated', 'Payment Released']);

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const instances = await WorkflowInstance.find({ entityType: 'BillRequest', status: 'in-progress' }).lean();
  const stuck = instances.filter(inst => {
    const stage = inst.stages[inst.currentStageIndex];
    return stage && stage.status === 'in-progress' && TMS_STAGES.has(stage.name);
  });
  console.log(`${stuck.length} BillRequest(s) stuck at a TMS-related stage.`);

  let cleared = 0, skippedAlreadyPaid = 0, skippedNoBill = 0;
  for (const inst of stuck) {
    const br = await BillRequest.findById(inst.entityId).select('_id reqNo billId milestoneAchieved').lean();
    if (!br || !br.billId) { skippedNoBill++; console.log(`${inst.entityLabel}: no linked RunningBill — skipped`); continue; }

    const bill = await RunningBill.findById(br.billId);
    if (!bill) { skippedNoBill++; console.log(`${inst.entityLabel}: linked RunningBill not found — skipped`); continue; }
    if (bill.status === 'paid') { skippedAlreadyPaid++; console.log(`${inst.entityLabel} / ${bill.billNo}: already paid, just completing its stuck SLA instance`); }
    else { cleared++; console.log(`${APPLY ? 'MARKING PAID' : '[dry-run] would mark paid'}: ${inst.entityLabel} / ${bill.billNo} (₹${(bill.amount || 0).toLocaleString('en-IN')})`); }

    if (!APPLY) continue;

    if (bill.status !== 'paid') {
      bill.status = 'paid';
      bill.tmsCallbackReceivedAt = new Date();
      bill.paymentDate = bill.paymentDate || new Date();
      if (bill.paidAmount == null) bill.paidAmount = bill.amount;
      bill.approvalHistory.push({ stage: 'tms-callback', action: 'paid', by: null, remarks: 'Manually cleared — TMS integration on hold, payment confirmed to have happened' });
      await bill.save();
    }

    // One call only completes the CURRENT stage — an instance sitting two
    // stages behind (e.g. still at "Payment Initiated" when both it and
    // "Payment Released" need closing) needs one call per remaining stage,
    // so keep advancing until the instance itself is no longer in-progress.
    for (let guard = 0; guard < 10; guard++) {
      const fresh = await WorkflowInstance.findById(inst._id).select('status').lean();
      if (!fresh || fresh.status !== 'in-progress') break;
      await advanceInstance('BillRequest', br._id, null, 'Manually cleared — TMS integration on hold, payment confirmed to have happened');
    }
    if (!br.milestoneAchieved) {
      await BillRequest.updateOne({ _id: br._id }, { $set: { milestoneAchieved: true, milestoneDate: bill.paymentDate || new Date() } });
    }
  }

  console.log(`\n${APPLY ? 'Cleared' : 'Would clear'}: ${cleared}. Already paid (instance-only fix): ${skippedAlreadyPaid}. Skipped (no linked bill): ${skippedNoBill}.`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');

  await mongoose.disconnect();
})();
