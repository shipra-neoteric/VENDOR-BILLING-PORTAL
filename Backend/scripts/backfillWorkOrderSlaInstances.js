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

  let cancelledOrphan = 0, cancelledWO = 0, cancelledStaleCycle = 0, cancelledLegacyApproved = 0, reconciled = 0, untouched = 0;

  for (const inst of stuck) {
    const wo = await WorkOrder.findById(inst.entityId)
      .select('workOrderNo approvalStatus status createdAt makerBy makerAt checkerBy checkerAt approverBy approverAt finalApprovedBy finalApprovedAt cancelledAt approvalHistory');

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
    const realActors = [wo.makerBy, wo.checkerBy, wo.approverBy, wo.finalApprovedBy];
    // A resubmit-after-reopen cycle overwrites makerAt/checkerAt/approverAt
    // as it goes, but does NOT clear a stale finalApprovedAt (or approverAt)
    // left over from an earlier, since-superseded cycle — e.g. a work order
    // sitting at 'pending-final' right now can still carry a finalApprovedAt
    // from before it was reopened and resubmitted. Cap how many stages we'll
    // trust to exactly what the CURRENT approvalStatus says has genuinely
    // completed, so a real still-open stage never gets marked done off a
    // stale timestamp from a previous cycle.
    const STATUS_STAGE_CAP = {
      draft: 0, 'sent-back': 0,
      'pending-checker': 1, 'pending-approver': 2, 'pending-final': 3, approved: 4,
    };
    const stageCap = STATUS_STAGE_CAP[wo.approvalStatus] ?? 0;

    let changed = false;
    for (let i = 0; i < inst.stages.length && i < realTimes.length && i < stageCap; i++) {
      const at = realTimes[i];
      const stage = inst.stages[i];
      if (!at || stage.status === 'completed') continue;

      stage.completedAt = at;
      stage.completedBy = realActors[i] || null;
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

    // Grandfathered / legacy-approved work order — approvalStatus is
    // 'approved' but NONE of the four real per-stage timestamps were ever
    // set, meaning it was approved outside the real digital flow entirely
    // (a one-off migration, or created already-approved) rather than by
    // walking through submit/checker/approver/final-approve. There is no
    // genuine per-stage timing to reconstruct for these, so the honest fix
    // is to close the tracking record rather than leave it stuck forever
    // or invent fake stage-by-stage history.
    const hasAnyRealTimestamp = realTimes.some(Boolean);
    if (wo.approvalStatus === 'approved' && inst.status === 'in-progress' && !hasAnyRealTimestamp) {
      inst.status = 'cancelled';
      inst.completedAt = wo.createdAt || new Date();
      changed = true;
      cancelledLegacyApproved++;
    }

    if (changed) {
      console.log(`[reconciled] ${wo.workOrderNo} — real status '${wo.approvalStatus}', instance now stage ${inst.currentStageIndex} (${inst.status})`);
      if (APPLY) await inst.save();
      reconciled++;
    } else {
      untouched++; // genuinely still open at whatever stage it's correctly sitting at
    }
  }

  console.log('\n── Summary (pass 1 — advance/close stuck instances) ──');
  console.log({ total: stuck.length, reconciled, cancelledStaleCycle, cancelledLegacyApproved, cancelledWO, cancelledOrphan, untouched });

  // ── Pass 2: repair completedBy on stages already marked 'completed' —
  // covers both real approvals that predate this whole fix and stages this
  // script's own earlier run (before this pass existed) already timestamped
  // without an actor. Without a real completedBy, the SLA-by-User report has
  // no user to attribute the stage to, so it either falls into a generic
  // "role" bucket or silently disappears now that those buckets are filtered
  // out — the exact "who does this belong to" gap this backfill exists to
  // close. Only patches when the actor field's own timestamp matches the
  // stage's completedAt exactly, so a stage from an abandoned, since-
  // superseded resubmit cycle never gets attributed to whoever holds that
  // actor field *now*.
  const allWoInstances = await WorkflowInstance.find({ entityType: 'WorkOrder' });
  console.log(`\nPass 2: scanning ${allWoInstances.length} total WorkOrder instance(s) for missing completedBy...`);
  let attributed = 0;
  for (const inst of allWoInstances) {
    const wo = await WorkOrder.findById(inst.entityId)
      .select('workOrderNo makerBy makerAt checkerBy checkerAt approverBy approverAt finalApprovedBy finalApprovedAt');
    if (!wo) continue;

    const realTimes = [wo.makerAt, wo.checkerAt, wo.approverAt, wo.finalApprovedAt];
    const realActors = [wo.makerBy, wo.checkerBy, wo.approverBy, wo.finalApprovedBy];
    let patched = false;
    for (let i = 0; i < inst.stages.length && i < realTimes.length; i++) {
      const stage = inst.stages[i];
      if (stage.status !== 'completed' || stage.completedBy || !realActors[i] || !realTimes[i] || !stage.completedAt) continue;
      if (new Date(stage.completedAt).getTime() !== new Date(realTimes[i]).getTime()) continue;
      stage.completedBy = realActors[i];
      patched = true;
    }
    if (patched) {
      console.log(`[attributed] ${wo.workOrderNo} — filled in completedBy for ${inst.stages.filter(s => s.completedBy).length} stage(s)`);
      if (APPLY) await inst.save();
      attributed++;
    }
  }
  console.log(`Pass 2 done: ${attributed} instance(s) had completedBy filled in.`);

  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  process.exit(0);
})();
