// One-time reconciliation for `WorkflowInstance` documents left stuck
// "in-progress" even though their real entity (WorkOrder/BillRequest) has
// already reached a terminal state in real life. This happens whenever an
// entity's approvalStatus/status changed via a path that never called
// slaEngine's advanceInstance/cancelInstance for every remaining stage
// (bulk-seeded/imported records, in particular) — the instance is then
// orphaned and its overdue-time calculation (now − dueAt) grows forever,
// producing nonsensical "SLA by User" numbers (see investigation: WO-0208,
// WO-0214, WO-0207, WO-0215, WO-0203, BR-0005 all already `approved` in
// reality but stuck in-progress on an old stage).
//
// Run with --apply to write; without it, prints what WOULD change (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const WorkflowInstance = require('../src/models/WorkflowInstance');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
require('../src/models/RunningBill'); // registers the 'RunningBill' schema billId.populate() below needs
const { overdueMinutesFor } = require('../src/utils/slaEngine');

const APPLY = process.argv.includes('--apply');

// Freezes every remaining (pending/in-progress) stage as completed at `now`
// — the in-progress one keeps whatever overdue it had already accrued
// (frozen, not fabricated), pending ones get no invented delay since they
// never actually started.
function freezeInstanceCompleted(instance) {
  const now = new Date();
  for (const stage of instance.stages) {
    if (stage.status === 'completed') continue;
    if (stage.status === 'in-progress') {
      stage.delayMinutes = overdueMinutesFor(stage, now);
      stage.completedAt = now;
      stage.status = 'completed';
    } else if (stage.status === 'pending') {
      stage.startedAt = now;
      stage.dueAt = now;
      stage.completedAt = now;
      stage.delayMinutes = 0;
      stage.status = 'completed';
    }
  }
  instance.status = 'completed';
  instance.completedAt = now;
}

function freezeInstanceCancelled(instance, reason) {
  instance.status = 'cancelled';
  instance.completedAt = new Date();
  const stage = instance.stages[instance.currentStageIndex];
  if (stage) stage.remarks = reason;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const instances = await WorkflowInstance.find({ status: 'in-progress' });
  let completedCount = 0, cancelledCount = 0, skippedCount = 0;

  for (const inst of instances) {
    let action = null; // 'complete' | 'cancel' | null (leave alone)
    let reason = '';

    if (inst.entityType === 'WorkOrder') {
      const wo = await WorkOrder.findById(inst.entityId).select('approvalStatus status').lean();
      if (!wo) { action = 'cancel'; reason = 'Work Order no longer exists'; }
      else if (wo.approvalStatus === 'approved') action = 'complete';
      else if (wo.status === 'cancelled') { action = 'cancel'; reason = 'Work Order cancelled'; }
    } else if (inst.entityType === 'BillRequest') {
      const br = await BillRequest.findById(inst.entityId).select('status billId').populate('billId', 'status').lean();
      if (!br) { action = 'cancel'; reason = 'Bill Request no longer exists'; }
      else if (br.status === 'rejected') { action = 'cancel'; reason = 'Bill Request rejected'; }
      else if (br.billId && br.billId.status === 'paid') action = 'complete';
    }

    if (action === 'complete') {
      console.log(`${APPLY ? 'COMPLETING' : '[dry-run] would complete'}: ${inst.entityType} ${inst.entityLabel} (instance ${inst._id})`);
      if (APPLY) { freezeInstanceCompleted(inst); await inst.save(); }
      completedCount++;
    } else if (action === 'cancel') {
      console.log(`${APPLY ? 'CANCELLING' : '[dry-run] would cancel'}: ${inst.entityType} ${inst.entityLabel} (instance ${inst._id}) — ${reason}`);
      if (APPLY) { freezeInstanceCancelled(inst, reason); await inst.save(); }
      cancelledCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Would apply'}: ${completedCount} completed, ${cancelledCount} cancelled, ${skippedCount} left untouched (still genuinely in progress).`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');

  await mongoose.disconnect();
})();
