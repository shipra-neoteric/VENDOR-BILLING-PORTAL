// One-off backfill: `startInstance` only ever ran for WorkOrders/BillRequests
// created AFTER the SLA workflow template first existed (~mid-July 2026) —
// anything created before that, or anything whose instance never got created
// for some other reason, has NO WorkflowInstance at all. The SLA Report only
// ever reads WorkflowInstance records, so these are simply invisible to it —
// "0 pending" on a tile while the real WorkOrder.approvalStatus /
// BillRequest.status says otherwise (the exact gap that made WO-0040/0062/0142
// show as pending in Work Orders but not in the SLA Report).
//
// This creates the missing instance (via the same startInstance the real
// endpoints use) for every WorkOrder/BillRequest that's still genuinely
// pending per its own authoritative field, then walks it forward to the
// correct current stage using real recorded timestamps — same approach as
// backfillWorkOrderSlaInstances.js, just for instances that never existed
// rather than ones stuck mid-flow.
//
// Usage:
//   node scripts/backfillMissingSlaInstances.js            (dry run — reports only)
//   node scripts/backfillMissingSlaInstances.js --apply    (writes the fixes)

require('dotenv').config();
const mongoose = require('mongoose');
const WorkflowInstance = require('../src/models/WorkflowInstance');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
const { startInstance, computeDueAt } = require('../src/utils/slaEngine');

const APPLY = process.argv.includes('--apply');

// How many of the real approval-chain stages are genuinely done, given the
// entity's own authoritative status field — mirrors APPROVAL_STATUS_CFG on
// the Work Orders page (draft->L1, pending-checker->L2, pending-approver->L3,
// pending-final->L4, approved->done) and billRequestController's own
// pending->AGM/pending-gm->GM stages.
const WO_STAGE_CAP = { draft: 0, 'pending-checker': 1, 'pending-approver': 2, 'pending-final': 3, approved: 4 };
const BR_STAGE_CAP = { pending: 0, 'pending-gm': 1 };

async function ensureAndAdvance({ inst, entityLabel, realTimes, realActors, stageCap, createdAt }) {
  // This is always a JUST-created instance (startInstance stamps stage0 with
  // "now") — anchor it to when the record actually started instead, so its
  // SLA clock (and overdue time) reflects real history, not today.
  inst.startedAt = createdAt;
  inst.stages[0].startedAt = createdAt;
  inst.stages[0].dueAt = computeDueAt(createdAt, inst.stages[0].slaHours, inst.stages[0].businessHoursOnly, inst.stages[0].workingDays);
  let changed = true;

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

  console.log(`[created+advanced] ${entityLabel} — now stage ${inst.currentStageIndex} (${inst.status})`);
  return changed;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`);

  // ── Work Orders ──
  const pendingWOs = await WorkOrder.find({
    approvalStatus: { $in: ['draft', 'pending-checker', 'pending-approver', 'pending-final'] },
    status: { $ne: 'cancelled' },
  }).select('workOrderNo approvalStatus projectId projectName vendorName contractValue createdAt makerBy makerAt checkerBy checkerAt approverBy approverAt finalApprovedBy finalApprovedAt');

  console.log(`\nChecking ${pendingWOs.length} real-pending WorkOrder(s) for a missing instance...`);
  let woCreated = 0, woSkippedNoTemplate = 0, woAlreadyTracked = 0;

  for (const wo of pendingWOs) {
    const existing = await WorkflowInstance.findOne({ entityType: 'WorkOrder', entityId: wo._id, status: 'in-progress' });
    if (existing) { woAlreadyTracked++; continue; }

    if (!APPLY) {
      console.log(`[would create] ${wo.workOrderNo} — approvalStatus '${wo.approvalStatus}', created ${wo.createdAt.toISOString().slice(0, 10)}`);
      woCreated++;
      continue;
    }

    const inst = await startInstance('WorkOrder', wo._id, wo.workOrderNo, wo.makerBy || null, {
      projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: wo.contractValue,
    });
    if (!inst) { console.log(`[skip] ${wo.workOrderNo} — no active WorkOrder template configured`); woSkippedNoTemplate++; continue; }

    await ensureAndAdvance({
      inst, entityLabel: wo.workOrderNo, createdAt: wo.createdAt,
      realTimes: [wo.makerAt, wo.checkerAt, wo.approverAt, wo.finalApprovedAt],
      realActors: [wo.makerBy, wo.checkerBy, wo.approverBy, wo.finalApprovedBy],
      stageCap: WO_STAGE_CAP[wo.approvalStatus] ?? 0,
    });
    await inst.save();
    woCreated++;
  }

  // ── Bill Requests ──
  const pendingBRs = await BillRequest.find({ status: { $in: ['pending', 'pending-gm'] } })
    .select('reqNo status projectId projectName vendorName items createdAt requestedBy agmApprovedBy agmApprovedAt');

  console.log(`\nChecking ${pendingBRs.length} real-pending BillRequest(s) for a missing instance...`);
  let brCreated = 0, brSkippedNoTemplate = 0, brAlreadyTracked = 0;

  for (const br of pendingBRs) {
    const existing = await WorkflowInstance.findOne({ entityType: 'BillRequest', entityId: br._id, status: 'in-progress' });
    if (existing) { brAlreadyTracked++; continue; }

    if (!APPLY) {
      console.log(`[would create] ${br.reqNo} — status '${br.status}', created ${br.createdAt.toISOString().slice(0, 10)}`);
      brCreated++;
      continue;
    }

    const amount = (br.items || []).reduce((s, it) => s + (it.rate || 0) * (it.billedQty || 0), 0);
    const inst = await startInstance('BillRequest', br._id, br.reqNo, br.requestedBy || null, {
      projectId: br.projectId, projectName: br.projectName, vendorName: br.vendorName, amount,
    });
    if (!inst) { console.log(`[skip] ${br.reqNo} — no active BillRequest template configured`); brSkippedNoTemplate++; continue; }

    await ensureAndAdvance({
      inst, entityLabel: br.reqNo, createdAt: br.createdAt,
      realTimes: [br.agmApprovedAt],
      realActors: [br.agmApprovedBy],
      stageCap: BR_STAGE_CAP[br.status] ?? 0,
    });
    await inst.save();
    brCreated++;
  }

  console.log('\n── Summary ──');
  console.log({
    workOrders: { total: pendingWOs.length, created: woCreated, alreadyTracked: woAlreadyTracked, skippedNoTemplate: woSkippedNoTemplate },
    billRequests: { total: pendingBRs.length, created: brCreated, alreadyTracked: brAlreadyTracked, skippedNoTemplate: brSkippedNoTemplate },
  });
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  process.exit(0);
})();
