// One-off backfill: workOrderController's submit/checker/approver/final-approve
// endpoints never called advanceInstance/cancelInstance until this fix, so every
// WorkOrder that went through (or was sent back/cancelled/reopened during) its
// real 4-level approval chain before today has a WorkflowInstance permanently
// stuck "in-progress" at L1 - Work Order Maker, even if the real work order is
// long since fully approved, sent back, cancelled, or reopened for editing.
// This is exactly why the SLA Report showed already-approved work orders as
// still "Overdue" at the Maker stage.
//
// This reconciles every stuck instance against the WorkOrder's own real
// makerAt/checkerAt/approverAt/finalApprovedAt timestamps (not "now"), so the
// backfilled stage history stays historically accurate instead of dumping a
// pile of fake same-day completions.
//
// Usage:
//   node scripts/backfillWorkOrderSlaInstances.js            (dry run — reports only)
//   node scripts/backfillWorkOrderSlaInstances.js --apply    (writes the fixes)

require('dotenv').config();
const mongoose = require('mongoose');
const WorkflowInstance = require('../src/models/WorkflowInstance');
const WorkOrder = require('../src/models/WorkOrder');
const { computeDueAt } = require('../src/utils/slaEngine');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`);

  const stuck = await WorkflowInstance.find({ entityType: 'WorkOrder', status: 'in-progress' });
  console.log(`Found ${stuck.length} in-progress WorkOrder SLA instance(s) to check.\n`);

  let cancelledOrphan = 0, cancelledWO = 0, cancelledStaleCycle = 0, reconciled = 0, untouched = 0;

  for (const inst of stuck) {
    const wo = await WorkOrder.findById(inst.entityId)
      .select('workOrderNo approvalStatus status makerAt checkerAt approverAt finalApprovedAt cancelledAt approvalHistory');

    if (!wo) {
      console.log(`[orphan] ${inst.entityLabel} — work order no longer exists, cancelling instance`);
      if (APPLY) { inst.status = 'cancelled'; inst.completedAt = new Date(); await inst.save(); }
      cancelledOrphan++;
      continue;
    }

    if (wo.status === 'cancelled') {
      console.log(`[cancelled-wo] ${wo.workOrderNo} — work order is cancelled, cancelling stale instance`);
      if (APPLY) { inst.status = 'cancelled'; inst.completedAt = wo.cancelledAt || new Date(); await inst.save(); }
      cancelledWO++;
      continue;
    }

    // Walk the real historical stage timestamps forward, exactly like
    // completeStageAt does, just using the actual recorded time for each
    // step instead of "now".
    const realTimes = [wo.makerAt, wo.checkerAt, wo.approverAt, wo.finalApprovedAt];
    let changed = false;
    for (let i = 0; i < inst.stages.length && i < realTimes.length; i++) {
      const at = realTimes[i];
      const stage = inst.stages[i];
      if (!at || stage.status === 'completed') continue;

      stage.completedAt = at;
      stage.status = 'completed';
      stage.delayMinutes = stage.dueAt ? Math.max(0, Math.round((at - stage.dueAt) / 60000)) : 0;

      const next = inst.stages[i + 1];
      if (next) {
        next.startedAt = at;
        next.dueAt = computeDueAt(at, next.slaHours, next.businessHoursOnly, next.workingDays);
        next.status = 'in-progress';
        inst.currentStageIndex = i + 1;
      } else {
        inst.status = 'completed';
        inst.completedAt = at;
      }
      changed = true;
    }

    // A work order sent back, or reopened after editing, resets to
    // 'sent-back'/'draft' — but the real timestamps above may have just
    // walked this same stale instance forward through stages from the
    // ABANDONED cycle. If it's still sitting past L1 with no matching live
    // approval status, that whole cycle is dead; close it out so the next
    // real submit starts a clean instance instead of resuming here.
    if (['sent-back', 'draft'].includes(wo.approvalStatus) && inst.currentStageIndex > 0 && inst.status === 'in-progress') {
      const lastResetEvent = [...(wo.approvalHistory || [])].reverse().find(h => h.action === 'sent-back' || h.action === 'reopened');
      inst.status = 'cancelled';
      inst.completedAt = lastResetEvent?.at || new Date();
      changed = true;
      cancelledStaleCycle++;
    }

    if (changed) {
      console.log(`[reconciled] ${wo.workOrderNo} — real status '${wo.approvalStatus}', instance now stage ${inst.currentStageIndex} (${inst.status})`);
      if (APPLY) await inst.save();
      reconciled++;
    } else {
      untouched++; // genuinely still open at whatever stage it's correctly sitting at
    }
  }

  console.log('\n── Summary ──');
  console.log({ total: stuck.length, reconciled, cancelledStaleCycle, cancelledWO, cancelledOrphan, untouched });
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  process.exit(0);
})();
