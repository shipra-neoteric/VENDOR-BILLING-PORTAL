const { validationResult } = require('express-validator');
const RunningBill  = require('../models/RunningBill');
const BillRequest  = require('../models/BillRequest');
const WorkOrder    = require('../models/WorkOrder');
const Company      = require('../models/Company');
const { resolvePayee } = require('../utils/vendorGroupHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextBillNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');
const { advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { logAudit, diffFields } = require('../utils/auditLog');
const { hasUnapprovedVarianceForLineItem, resolveBillableItem, findOverbilledLineItem, isWorkOrderApproved } = require('../utils/varianceCheck');
const { recomputeAfterInvalidate, recomputeParentFromSubItems, deriveStatus } = require('../utils/progressHelpers');
const { applyAdvanceRecoveries } = require('../utils/advanceRecovery');
const AdvanceSlip  = require('../models/AdvanceSlip');
const { nextCode } = require('../utils/sequence');
const { notifyStagePending, settleAllPendingForEntity } = require('../utils/slackApprovals');

const MODULE = 'accounts-payment';

// Fire-and-forget (mirrors emitEvent's un-awaited call sites) — a failed or
// unconfigured Slack push must never block the real approval-chain write that
// already happened.
function notifySlack(approvalType, bill) {
  notifyStagePending(approvalType, bill)
    .catch((err) => console.error(`[slack] ${approvalType} notify failed`, err.message));
}

// Advances the SLA tracker for whichever BillRequest generated this RunningBill —
// no-ops silently if there's no linked request or no in-progress instance, so it's
// safe to call unconditionally from every stage-transition action below.
async function advanceBillRequestInstance(bill, actorUserId, remarks) {
  const br = await BillRequest.findOne({ billId: bill._id }).select('_id');
  if (!br) return;
  await advanceInstance('BillRequest', br._id, actorUserId, remarks);
}

// Appends one entry to the bill's own append-only timeline — separate from
// logAudit (the system-wide audit log, already called at every transition
// below); this one drives just the Accounts Payment drawer's history view,
// same split WorkOrder.approvalHistory already uses.
function pushHistory(bill, stage, action, by, remarks) {
  bill.approvalHistory.push({ stage, action, by, remarks: remarks || '' });
}

const POPULATE_FIELDS = ['agmApprovedBy', 'makerBy', 'verifiedBy', 'checkerBy', 'approvedBy', 'paymentInitiatedBy', 'rejectedBy', 'verificationBy', 'l1ApprovedBy', 'l2ApprovedBy', 'holdBy', 'holdReleasedBy', 'lineItems.varianceApprovedBy', 'manualAgmApprovedBy', 'manualGmApprovedBy', 'manualRejectedBy'];

exports.listBills = asyncHandler(async (req, res) => {
  const { workOrderId, vendorCode, projectId, status, manualApprovalStatus, search, archived } = req.query;
  const filter = {};
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (status)      filter.status      = status;
  if (manualApprovalStatus) {
    filter.manualApprovalStatus = Array.isArray(manualApprovalStatus) ? { $in: manualApprovalStatus } : manualApprovalStatus;
  }
  if (archived === 'true') filter.isArchived = true;
  else if (archived !== 'all') filter.isArchived = { $ne: true };
  // archived === 'all' → no isArchived filter, returns both
  if (search) {
    filter.$or = [
      { billNo:      { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { workOrderNo: { $regex: search, $options: 'i' } },
      { generatedBy: { $regex: search, $options: 'i' } },
    ];
  }

  let query = RunningBill.find(filter);
  for (const f of POPULATE_FIELDS) query = query.populate(f, 'name role');
  const bills = await query.sort({ createdAt: -1 }).lean();

  success(res, { bills });
});

exports.getBill = asyncHandler(async (req, res) => {
  let query = RunningBill.findById(req.params.id);
  for (const f of POPULATE_FIELDS) query = query.populate(f, 'name role');
  const bill = await query.lean();
  if (!bill) return notFound(res, 'Bill not found');
  success(res, { bill });
});

// Manual bill entry — no BillRequest needed. Lands at 'draft' just like an
// AGM-approved bill request does, so it still needs an L1 maker confirm before
// entering the checker/approver chain — a manually-typed bill has no BillRequest/
// AGM sign-off upstream, so it's the case that most needs that first checkpoint,
// not least.
exports.createBill = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const workOrder = req.body.workOrderId
    ? await WorkOrder.findById(req.body.workOrderId)
    : null;
  if (req.body.workOrderId && !workOrder) {
    return notFound(res, 'Work order not found');
  }
  if (workOrder && !isWorkOrderApproved(workOrder)) {
    return badRequest(res, `"${workOrder.workOrderNo}" has not completed its own approval chain yet (currently ${workOrder.approvalStatus}) — no bill can be raised against it until Final Approval is given.`);
  }

  // A bill with no work order has no company to inherit from, so the maker
  // must say up front which group company this bill is being raised through.
  let company = null;
  if (!workOrder) {
    if (!req.body.companyId) {
      return badRequest(res, 'Company is required for a bill that is not linked to a work order.');
    }
    company = await Company.findById(req.body.companyId);
    if (!company) return notFound(res, 'Company not found');
  }

  const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
  if (lineItems.length === 0) {
    return badRequest(res, 'At least one work item is required');
  }

  // This manual entry path bypasses the Bill Review checklist entirely, so any
  // line linked to a WO scope item must still respect that item's variance
  // sign-off — otherwise it's a silent backdoor around the whole review flow.
  if (workOrder) {
    for (const li of lineItems) {
      if (!li.scopeItemId) continue;
      const si = workOrder.scopeItems.id(li.scopeItemId);
      if (si && hasUnapprovedVarianceForLineItem(si, li.subItemId)) {
        return badRequest(res, `"${si.description}" has unapproved progress variance — approve it on the Bill Review page before billing.`);
      }
    }

    // Hard-reject overbilling past a scope item's remaining unbilled qty —
    // cumulative across every bill ever raised against it, from either
    // billing path — instead of the old silent Math.min clamp further below.
    const overbilled = findOverbilledLineItem(workOrder, lineItems);
    if (overbilled) {
      const { si, remaining } = overbilled;
      return badRequest(res, `"${si.description}" — only ${remaining} ${si.unit || ''} remaining to bill (already billed ${si.lastBilledQty || 0} of ${si.plannedQty}).`);
    }
  }

  // Advance recovery decided at creation time — validate slip ownership up
  // front (before creating anything) so a mismatch fails cleanly with no
  // side effects, rather than after a bill/WO update has already landed.
  const recoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  const recoveryVendorCode = workOrder ? workOrder.vendorCode : req.body.vendorCode;
  if (recoveries.length) {
    const slips = await AdvanceSlip.find({ _id: { $in: recoveries.map(r => r.slipId).filter(Boolean) } }).select('contractorCode');
    const mismatch = slips.find(s => s.contractorCode !== recoveryVendorCode);
    if (mismatch) {
      return badRequest(res, `Advance slip ${mismatch._id} does not belong to this bill's contractor.`);
    }
  }

  const amount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const billNo = await nextBillNo();

  // Compute billingCycle for this WO
  const cycleCount = req.body.workOrderId
    ? await RunningBill.countDocuments({ workOrderId: req.body.workOrderId })
    : 0;

  // Build linkedBills with billNo enrichment
  const linkedBills = Array.isArray(req.body.linkedBills) ? req.body.linkedBills : [];

  // Who this bill's payment actually goes to — normally the work order's own
  // vendor, but a fellow Vendor Group member can be named instead (see
  // resolvePayee). req.body.vendorCode here is the frontend's "Pay To"
  // selection, not the WO's identity — that's always workOrder.vendorCode.
  const payee = workOrder
    ? await resolvePayee(workOrder.vendorCode, workOrder.vendorName, req.body.vendorCode)
    : { vendorCode: req.body.vendorCode, vendorName: req.body.vendorName };

  // Snapshotted from the WO's own paymentMilestones subdoc (embedded, not a
  // separate collection) at creation time — purely a display/reference tag,
  // doesn't feed into amount/GST/retention.
  const milestone = (workOrder && req.body.milestoneId)
    ? workOrder.paymentMilestones.id(req.body.milestoneId)
    : null;

  // A milestone with no scope items linked to it (lineItems here carry no
  // scopeItemId) has no plannedQty/lastBilledQty to guard against double
  // billing — findOverbilledLineItem above only checks scope-item-linked
  // lines. So for that lump-sum case specifically, block raising a second
  // bill against the same milestone outright (one active bill per milestone).
  if (milestone && !lineItems.some((li) => li.scopeItemId)) {
    const alreadyBilled = await RunningBill.exists({
      workOrderId: workOrder._id, milestoneId: milestone._id,
      isActive: { $ne: false }, status: { $ne: 'rejected' },
    });
    if (alreadyBilled) {
      return badRequest(res, `"${milestone.stage || milestone.type || 'This milestone'}" has already been billed — a lump-sum milestone can only be billed once.`);
    }
  }

  const bill = await RunningBill.create({
    ...req.body,
    billNo,
    amount,
    lineItems,
    linkedBills,
    billingCycle: cycleCount + 1,
    milestoneId:    milestone ? milestone._id : null,
    milestoneStage: milestone ? (milestone.stage || milestone.type || '') : '',
    ...(workOrder ? {
      workOrderNo: workOrder.workOrderNo,
      projectId:   workOrder.projectId,
      projectName: workOrder.projectName,
      projectLocation: workOrder.projectLocation,
      companyName: workOrder.companyName,
    } : {
      companyId:   company._id,
      companyName: company.name,
    }),
    vendorCode:  payee.vendorCode,
    vendorName:  payee.vendorName,
    status:      'draft',
    // This is exactly the manual-entry path — unlike a progress-driven bill
    // (born already 'approved' here, having gone through BillRequest's own
    // AGM/GM sign-off before this document existed), it needs that same
    // sign-off now, before Accounts can verify it.
    manualApprovalStatus: 'pending',
    createdBy:   req.user._id,
  });

  // Auto-link: mark superseded/revised/corrected bills as inactive
  const deactivatingRelationships = ['SUPERSEDES', 'REVISION_OF', 'CORRECTION_OF'];
  for (const link of linkedBills) {
    if (deactivatingRelationships.includes(link.relationshipType) && link.billId) {
      await RunningBill.findByIdAndUpdate(link.billId, {
        isActive:     false,
        supersededBy: bill._id,
      });
    }
  }

  // Update work order scope item progress (non-fatal) — the overbilling
  // check above already guarantees this addition stays within plannedQty
  // wherever one is set, so no clamp is needed here anymore.
  if (workOrder && lineItems.length > 0) {
    try {
      let changed = false;
      const touchedParents = new Set();
      for (const li of lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = workOrder.scopeItems.id(li.scopeItemId);
        if (!si) continue;
        const target = resolveBillableItem(si, li.subItemId);
        if (target) {
          target.lastBilledQty = (target.lastBilledQty || 0) + Number(li.billedQty);
          // A bill created directly here (bypassing DRI progress logging)
          // implies the billed work is actually done on site — otherwise it
          // wouldn't be billed — so billed qty is a floor on completed qty,
          // never lowering it if DRI progress already logged more.
          target.completedQty = Math.max(target.completedQty || 0, target.lastBilledQty);
          target.status = deriveStatus(target);
          if (li.subItemId) touchedParents.add(li.scopeItemId);
          changed = true;
        }
      }
      // Particulars drive their parent's own completedQty/status as a rollup —
      // recompute it for every scope item that had a particular billed here.
      for (const scopeItemId of touchedParents) {
        const si = workOrder.scopeItems.id(scopeItemId);
        if (si) recomputeParentFromSubItems(si);
      }
      if (changed) await workOrder.save();
    } catch (woErr) {
      console.error('Warning: could not update work order progress from bill:', woErr.message);
    }
  }

  // Apply the (already-validated) advance recoveries now that the bill
  // exists, real-time reducing the AdvanceSlip's own balance immediately —
  // same shape/helper as the late-stage submitPaymentDetails recovery, just
  // applied at creation instead of waiting for the bill to reach 'paid'.
  if (recoveries.length) {
    const applied = await applyAdvanceRecoveries(recoveries, { billNo: bill.billNo, releasedBy: req.user.name });
    bill.advanceRecovery = (bill.advanceRecovery || 0) + applied.reduce((sum, a) => sum + a.amount, 0);
    if (applied.length) await bill.save();
  }

  // A Mobilisation Advance bill raised as ADVANCE_FOR future billing is, by
  // definition, money paid out ahead of work done — the same thing an
  // Advance Slip already exists to track (outstanding balance, recoveries
  // against later bills). Auto-create one here instead of relying on
  // someone to remember to raise it separately from Advance Payments.
  // Non-fatal: a slip needs a projectId, which a standalone (no work order)
  // bill never has — skip silently rather than fail the bill itself over it.
  if (bill.billType === 'advance_mobilization' && bill.relationshipType === 'ADVANCE_FOR' && bill.projectId) {
    try {
      const slipNo = await nextCode('advanceSlipNo', 'ADV-', 4);
      const slip = await AdvanceSlip.create({
        slipNo,
        contractorCode: bill.vendorCode,
        contractorName: bill.vendorName,
        projectId:      bill.projectId,
        projectName:    bill.projectName,
        amount:         bill.amount,
        date:           bill.billDate,
        reference:      bill.billNo,
        notes:          `Auto-generated from Mobilisation Advance bill ${bill.billNo}`,
        createdBy:      req.user._id,
      });

      await logAudit({
        action: 'CREATE', module: 'advance-slips', user: req.user,
        description: `Advance slip ${slipNo} auto-created from bill ${bill.billNo} (₹${Number(bill.amount).toLocaleString('en-IN')})`,
        entityType: 'AdvanceSlip', entityId: slip._id, entityLabel: slip.slipNo,
      });
    } catch (advErr) {
      console.error('Warning: could not auto-create advance slip for bill', bill.billNo, advErr.message);
    }
  }

  await logAudit({
    action: 'CREATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} created`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  // This manual-entry path always starts manualApprovalStatus at 'pending'
  // (line 223 above) — a progress-driven bill (see billRequestController's
  // gmApprove) is born already past this and never reaches createBill at all.
  notifySlack('PAYMENT_MANUAL_AGM_APPROVAL', bill);

  created(res, { bill }, 'Bill created — awaiting maker confirmation');
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['sent-to-tms', 'paid'].includes(bill.status)) {
    return badRequest(res, 'A bill already sent to TMS or paid cannot be edited');
  }

  // Guard against overbilling being reintroduced through an edit — this
  // route updates lineItems.billedQty without touching the WorkOrder's own
  // lastBilledQty (unlike createBill), so "remaining" here must be computed
  // net of whatever this same bill already contributed, not just plannedQty
  // minus the WO's current lastBilledQty.
  if (Array.isArray(req.body.lineItems) && bill.workOrderId) {
    const workOrder = await WorkOrder.findById(bill.workOrderId);
    if (workOrder) {
      const itemKey = (scopeItemId, subItemId) => `${scopeItemId}:${subItemId || ''}`;
      const priorQtyByItem = {};
      for (const li of bill.lineItems) {
        if (li.scopeItemId) {
          const k = itemKey(li.scopeItemId, li.subItemId);
          priorQtyByItem[k] = (priorQtyByItem[k] || 0) + (Number(li.billedQty) || 0);
        }
      }
      for (const li of req.body.lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = workOrder.scopeItems.id(li.scopeItemId);
        if (!si) continue;
        const target = resolveBillableItem(si, li.subItemId);
        if (!target || !(target.plannedQty > 0)) continue;
        const prior = priorQtyByItem[itemKey(li.scopeItemId, li.subItemId)] || 0;
        const remaining = target.plannedQty - (target.lastBilledQty || 0) + prior;
        if (Number(li.billedQty) > remaining + 0.001) {
          return badRequest(res, `"${target.description}" — only ${remaining} ${target.unit || ''} remaining to bill (already billed ${(target.lastBilledQty || 0) - prior} of ${target.plannedQty} by other bills).`);
        }
      }
    }
  }

  const before = bill.toObject();
  Object.assign(bill, req.body);
  await bill.save();

  const changes = diffFields(before, bill.toObject(), Object.keys(req.body));
  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} updated`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    ...(changes ? { changes } : {}),
  });

  success(res, { bill }, 'Bill updated successfully');
});

// Verification — the single merged step (replaces the old separate Maker +
// Checker) that checks the bill against its work order and vendor details,
// and sets the one financial figure that stays in Accounts: TDS. Retention/
// Advance Recovery are NOT accepted here anymore — they're already set
// either at bill-creation time (createBill) or by AGM/GM during their own
// Site Progress approval (billRequestController.agmApprove/gmApprove).
exports.verifyBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'draft') {
    return badRequest(res, `Cannot verify a bill with status '${bill.status}'`);
  }
  if (bill.manualApprovalStatus !== 'approved') {
    return badRequest(res, `This bill needs AGM/GM sign-off on Bill Requests before it can be verified (currently ${bill.manualApprovalStatus === 'pending-gm' ? 'pending GM approval' : bill.manualApprovalStatus}).`);
  }

  const adjustmentAmount = req.body.adjustmentAmount != null ? Number(req.body.adjustmentAmount) : 0;
  if (adjustmentAmount !== 0 && !String(req.body.adjustmentRemark || '').trim()) {
    return badRequest(res, 'A remark is required when adjusting the net payable amount');
  }

  const before = { tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, adjustmentAmount: bill.adjustmentAmount };
  if (req.body.tdsPercent != null) bill.tdsPercent = Number(req.body.tdsPercent);
  if (req.body.tdsAmount  != null) bill.tdsAmount  = Number(req.body.tdsAmount);
  bill.adjustmentAmount = adjustmentAmount;
  bill.adjustmentRemark = adjustmentAmount !== 0 ? String(req.body.adjustmentRemark).trim() : '';
  const amountChanges = diffFields(before, { tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, adjustmentAmount: bill.adjustmentAmount }, ['tdsPercent', 'tdsAmount', 'adjustmentAmount']);

  bill.status         = 'verify-done';
  bill.verificationBy = req.user._id;
  bill.verificationAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(
    bill, 'verify', 'done', req.user._id,
    adjustmentAmount !== 0
      ? `${req.body.remarks || ''} [Adjustment ${adjustmentAmount > 0 ? '+' : ''}₹${adjustmentAmount}: ${bill.adjustmentRemark}]`.trim()
      : req.body.remarks
  );
  await bill.save();
  await bill.populate('verificationBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Verified');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: amountChanges
      ? `Verified bill ${bill.billNo} against its work order and set TDS`
      : `Verified bill ${bill.billNo} against its work order`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    ...(amountChanges ? { changes: amountChanges } : {}),
  });

  emitEvent('RUNNING_BILL_APPROVED', {
    projectId:    bill.projectId,
    workOrderId:  bill.workOrderId,
    workOrderNo:  bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:   bill.vendorCode,
    vendorName:   bill.vendorName,
    user:         req.user,
    metadata:     { billNo: bill.billNo, amount: bill.amount },
  });

  notifySlack('PAYMENT_L1_AGM_APPROVAL', bill);

  success(res, { bill }, 'Verified — ready for L1 AGM approval');
});

// ── Pre-Accounts AGM/GM sign-off for manually-created bills ─────────────
// Mirrors billRequestController's agmApprove/gmApprove/reject, just without
// re-deriving anything from a Work Order — a manual bill's amount/lineItems
// were already decided when it was created, so there's nothing to
// recompute here, only to sign off on.
exports.manualAgmApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.manualApprovalStatus !== 'pending') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }

  bill.manualAgmApprovedBy = req.user._id;
  bill.manualAgmApprovedAt = new Date();
  bill.manualApprovalStatus = 'pending-gm';
  pushHistory(bill, 'manual-agm', 'approved', req.user._id, req.body.remarks || '');
  await bill.save();
  await bill.populate('manualAgmApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `AGM signed off on manually-created bill ${bill.billNo} — forwarded to GM`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_MANUAL_GM_APPROVAL', bill);

  success(res, { bill }, 'AGM approved — forwarded to GM');
});

exports.manualGmApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.manualApprovalStatus !== 'pending-gm') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }

  bill.manualGmApprovedBy = req.user._id;
  bill.manualGmApprovedAt = new Date();
  bill.manualApprovalStatus = 'approved';
  pushHistory(bill, 'manual-gm', 'approved', req.user._id, req.body.remarks || '');
  await bill.save();
  await bill.populate('manualGmApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `GM signed off on manually-created bill ${bill.billNo} — ready for Accounts to verify`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_VERIFY_APPROVAL', bill);

  success(res, { bill }, 'GM approved — ready for Accounts to verify');
});

exports.manualReject = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!['pending', 'pending-gm'].includes(bill.manualApprovalStatus)) {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }
  const reason = req.body.reason || 'No reason provided';

  bill.manualApprovalStatus = 'rejected';
  bill.manualRejectedBy = req.user._id;
  bill.manualRejectReason = reason;
  // Terminal — same as a draft bill rejected in Accounts Payment (rejectBill
  // above); nothing downstream has happened yet for a bill still awaiting
  // this sign-off, so there's no WO progress or advance recovery to unwind
  // beyond what createBill already applied at creation time.
  bill.status = 'rejected';
  bill.rejectedBy = req.user._id;
  bill.rejectReason = reason;
  pushHistory(bill, bill.manualAgmApprovedAt ? 'manual-gm' : 'manual-agm', 'rejected', req.user._id, reason);
  await bill.save();

  await logAudit({
    action: 'REJECT', module: MODULE, user: req.user,
    description: `AGM/GM rejected manually-created bill ${bill.billNo} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
    .catch((err) => console.error('[slack] settle on manual reject failed', err.message));

  success(res, { bill }, 'Bill rejected');
});

// L1 AGM approval — pure approve-and-forward.
exports.l1AgmApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'verify-done') {
    return badRequest(res, `Cannot give L1 AGM approval for a bill with status '${bill.status}'`);
  }
  if (bill.verificationBy && bill.verificationBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'Whoever verified this bill cannot also give L1 AGM approval — segregation of duties requires a different approver.');
  }
  bill.status       = 'l1-approved';
  bill.l1ApprovedBy = req.user._id;
  bill.l1ApprovedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'l1-agm', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('l1ApprovedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'L1 AGM approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L1 AGM approved bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_L2_GM_APPROVAL', bill);

  success(res, { bill }, 'L1 AGM approved — ready for L2 Director approval');
});

// L2 Director approval — the last internal sign-off. Pure DB write, no
// outbound network call, so an L2 approval never depends on TMS's
// availability/latency — sending to TMS is a deliberately separate action
// (sendToTms below), fired by the frontend right after a successful approval
// so it still feels like one click without coupling the two backend actions.
exports.l2DirectorApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'l1-approved') {
    return badRequest(res, `Cannot give L2 Director approval for a bill with status '${bill.status}'`);
  }
  if (bill.l1ApprovedBy && bill.l1ApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L1 AGM approver cannot also give L2 Director approval — segregation of duties requires a different approver.');
  }
  bill.status       = 'approved';
  bill.l2ApprovedBy = req.user._id;
  bill.l2ApprovedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'l2-director', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('l2ApprovedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'L2 Director approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L2 Director approved bill ${bill.billNo} — ready to send to TMS`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'L2 Director approved — ready to send to TMS');
});

// Approver can pause a payment before it's irreversibly handed to TMS — e.g.
// a dispute with the vendor, budget timing, etc. Only reachable from
// 'approved' (the last stage this system still controls); resumes via
// releaseHold below. Once a bill reaches 'sent-to-tms' there is no lever
// left on this side to pause or recall it — see sendToTms.
exports.holdBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, `Cannot hold a bill with status '${bill.status}'`);
  }
  const reason = (req.body.reason || '').trim();
  if (!reason) return badRequest(res, 'A reason is required to hold a payment');

  bill.status     = 'hold';
  bill.holdBy     = req.user._id;
  bill.holdAt     = new Date();
  bill.holdReason = reason;
  pushHistory(bill, 'hold', 'held', req.user._id, reason);
  await bill.save();
  await bill.populate('holdBy', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Payment held for bill ${bill.billNo} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Payment held');
});

// Returns a held bill to 'approved' (ready to send, not auto-resent) —
// leaves holdBy/holdAt/holdReason in place as the historical record of the
// episode, doesn't null them out.
exports.releaseHold = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'hold') {
    return badRequest(res, `Cannot release a hold on a bill with status '${bill.status}'`);
  }
  bill.status         = 'approved';
  bill.holdReleasedBy  = req.user._id;
  bill.holdReleasedAt  = new Date();
  pushHistory(bill, 'hold', 'released-hold', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('holdReleasedBy', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Hold released on bill ${bill.billNo} — ready to send to TMS`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Hold released — ready to send to TMS');
});

// Hands the bill off to the external Transaction Management System as an
// outgoing payment instruction. Serves both the first send and manual
// retries after a failed attempt — same handler, same 'approved' precondition
// either way, since a failed send never moves status off 'approved'.
exports.sendToTms = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, `Cannot send a bill with status '${bill.status}' to TMS — it must be fully approved (L2 Director) first.`);
  }

  const { sendBill } = require('../utils/tmsClient');
  bill.tmsSendAttempts = (bill.tmsSendAttempts || 0) + 1;
  bill.tmsLastAttemptAt = new Date();

  try {
    // bill.vendorCode is either a Contractor's vendorCode or a Consultant's
    // consultantCode (professional-services work orders) — both carry the
    // same bank-detail field names, so whichever collection matches is fine.
    const Contractor = require('../models/Contractor');
    const Consultant = require('../models/Consultant');
    const payee = bill.vendorCode
      ? (await Contractor.findOne({ vendorCode: bill.vendorCode })) || (await Consultant.findOne({ consultantCode: bill.vendorCode }))
      : null;
    await sendBill(bill, payee);
  } catch (err) {
    bill.tmsLastError = err.message || 'Failed to reach TMS';
    pushHistory(bill, 'tms-handoff', 'send-failed', req.user._id, bill.tmsLastError);
    await bill.save();
    await logAudit({
      action: 'UPDATE', module: MODULE, user: req.user,
      description: `Send-to-TMS failed for bill ${bill.billNo} (attempt ${bill.tmsSendAttempts}) — ${bill.tmsLastError}`,
      entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    });
    return badRequest(res, `Failed to send to TMS: ${bill.tmsLastError}`);
  }

  bill.status = 'sent-to-tms';
  bill.tmsSentAt = new Date();
  bill.tmsLastError = '';
  pushHistory(bill, 'tms-handoff', 'sent', req.user._id, req.body.remarks);
  await bill.save();
  await advanceBillRequestInstance(bill, req.user._id, 'Sent to TMS');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} sent to TMS for payment`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Sent to TMS — awaiting payment confirmation');
});

// Called from the unauthenticated /api/webhooks/tms-callback route once TMS
// confirms a payment. Only the success path is implemented for now — a
// TMS-reported failure callback is explicitly out of scope for this phase.
exports.tmsCallback = asyncHandler(async (req, res) => {
  const { reference, status, utr, paymentMode, paymentBank, paymentDate, paidAmount } = req.body;
  if (!reference) return badRequest(res, 'reference (billNo) is required');
  if (status !== 'paid') return badRequest(res, `Unsupported callback status '${status}'`);

  const bill = await RunningBill.findOne({ billNo: reference });
  if (!bill) return notFound(res, `No bill found for reference '${reference}'`);

  if (bill.status === 'paid') {
    // Idempotent duplicate delivery — webhook redelivery is the norm, not
    // the exception, so a repeat of an already-applied callback is a no-op,
    // not an error.
    return success(res, { bill }, 'Already recorded as paid');
  }
  if (bill.status !== 'sent-to-tms') {
    return conflict(res, `Bill ${bill.billNo} is not awaiting a TMS callback (current status '${bill.status}')`);
  }

  bill.status = 'paid';
  if (utr)         bill.paymentUTR   = utr;
  if (paymentMode) bill.paymentMode  = paymentMode;
  if (paymentBank) bill.paymentBank  = paymentBank;
  if (paymentDate) bill.paymentDate  = new Date(paymentDate);
  if (paidAmount != null) bill.paidAmount = Number(paidAmount);
  bill.tmsCallbackReceivedAt = new Date();
  pushHistory(bill, 'tms-callback', 'paid', null, 'Confirmed paid by TMS');
  await bill.save();

  const br = await BillRequest.findOne({ billId: bill._id });
  if (br && !br.milestoneAchieved) {
    br.milestoneAchieved = true;
    br.milestoneDate = bill.paymentDate || new Date();
    await br.save();
  }

  await logAudit({
    action: 'UPDATE', module: MODULE, user: { _id: null, name: 'TMS', role: 'system' },
    description: `TMS confirmed payment for bill ${bill.billNo}${bill.paidAmount != null ? ` — ₹${bill.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} paid` : ''}${bill.paymentUTR ? ` (UTR ${bill.paymentUTR})` : ''}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  emitEvent('PAYMENT_RELEASED', {
    projectId:     bill.projectId,
    workOrderId:   bill.workOrderId,
    workOrderNo:   bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:    bill.vendorCode,
    vendorName:    bill.vendorName,
    metadata:      { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Payment confirmed');
});

// Does this user hold the given module+action via the permission checklist
// (Owner always passes) — for the in-controller, status-dependent checks
// below, where the required permission isn't known until after the bill's
// current status is read, so the route-level authorizeOr/authorizeAnyOr
// gate has to stay broad.
function hasAction(user, module, action) {
  if (user.role === 'owner') return true;
  const perm = (user.permissions || []).find(p => p.module === module);
  return !!perm?.actions?.includes(action);
}

// Reject means two different things depending on where the bill currently
// sits. From 'draft' there's no prior actor to send it back to — that's the
// terminal "this bill was wrong from the start" case, which still triggers
// the full old behavior (BillRequest closed, WO lastBilledQty rolled back,
// progress entries auto-invalidated so they never silently re-enter a future
// bill). From every other in-flight status, reject is a **send-back** to the
// immediately preceding stage — the bill stays alive with the same
// lineItems/billedQty still validly attached, so none of those three
// terminal side-effects fire (freeing lastBilledQty here while the bill is
// still alive would let the same quantity get billed again elsewhere).
const REJECT_TARGET = {
  'verify-done':  { to: 'draft',        actions: ['verify'] },
  'l1-approved':  { to: 'verify-done',  actions: ['l1-agm-approve'] },
  'approved':     { to: 'l1-approved',  actions: ['l2-director-approve'] },
  // No entry for 'sent-to-tms' or beyond — once handed to TMS, this system
  // has no recall/reject action; TMS owns the bill fully from that point.
};

exports.rejectBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['paid', 'rejected'].includes(bill.status)) {
    return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  }
  if (bill.status === 'hold') {
    return badRequest(res, 'Release the hold before rejecting or sending this bill back');
  }
  const reason = req.body.reason || 'No reason provided';

  if (bill.status === 'draft') {
    // Terminal kill — the only case with no prior stage to send back to.
    bill.status       = 'rejected';
    bill.rejectedBy   = req.user._id;
    bill.rejectReason = reason;
    pushHistory(bill, 'verify', 'sent-back', req.user._id, reason);
    await bill.save();
    await bill.populate('rejectedBy', 'name role');

    const br = await BillRequest.findOne({ billId: bill._id });
    if (br) {
      br.status = 'rejected';
      br.rejectReason = 'Bill rejected in Accounts Payment';
      await br.save();
      await cancelInstance('BillRequest', br._id, `Rejected: ${br.rejectReason}`);

      if (bill.workOrderId) {
        const wo = await WorkOrder.findById(bill.workOrderId);
        if (wo) {
          let changed = false;
          for (const li of bill.lineItems || []) {
            if (!li.scopeItemId || !li.billedQty) continue;
            const si = wo.scopeItems.id(li.scopeItemId);
            if (si) {
              si.lastBilledQty = Math.max(0, (si.lastBilledQty || 0) - Number(li.billedQty));
              // A killed bill means the progress it was made from was wrong —
              // auto-invalidate those entries (reason = the rejection reason)
              // rather than just freeing them, so they stay visible as
              // history but never count toward progress/billing again.
              const sources = (si.subItems && si.subItems.length > 0) ? si.subItems : [si];
              for (const src of sources) {
                for (const entry of src.progressEntries) {
                  if (entry.billedInRequestId && String(entry.billedInRequestId) === String(br._id) && !entry.invalidated?.done) {
                    entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason };
                    entry.billedInRequestId = null;
                  }
                }
              }
              recomputeAfterInvalidate(si);
              changed = true;
            }
          }
          if (changed) await wo.save();
        }
      }
    }

    await logAudit({
      action: 'REJECT', module: MODULE, user: req.user,
      description: `Rejected bill ${bill.billNo} — ${reason}`,
      entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    });

    settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
      .catch((err) => console.error('[slack] settle on reject failed', err.message));

    return success(res, { bill }, 'Bill rejected');
  }

  // Send-back — every other in-flight status.
  const target = REJECT_TARGET[bill.status];
  if (!target) return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  if (!target.actions.some(a => hasAction(req.user, MODULE, a))) {
    return res.status(403).json({ message: `Role '${req.user.role}' does not have access to this action` });
  }

  const fromStatus = bill.status;
  bill.status = target.to;
  pushHistory(bill, target.actions[0], 'sent-back', req.user._id, reason);
  await bill.save();

  await logAudit({
    action: 'REJECT', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} sent back from ${fromStatus} to ${target.to} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
    .catch((err) => console.error('[slack] settle on send-back failed', err.message));

  success(res, { bill }, `Sent back — ${reason}`);
});

// GET /api/bills/chain/:workOrderId — billing chain for a WO (all bills, sorted by cycle)
exports.getBillingChain = asyncHandler(async (req, res) => {
  const { workOrderId } = req.params;
  const bills = await RunningBill.find({ workOrderId })
    .populate('supersededBy', 'billNo billType')
    .populate('agmApprovedBy', 'name role')
    .populate('verificationBy', 'name role')
    .populate('l1ApprovedBy',   'name role')
    .populate('l2ApprovedBy',   'name role')
    .sort({ billingCycle: 1, createdAt: 1 })
    .lean();
  success(res, { bills });
});

// PATCH /api/bills/:id/deductions  — correct advance recovery / retention split on a paid bill
exports.patchDeductions = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'paid') return badRequest(res, 'Can only adjust deductions on paid bills');
  const before = { advanceRecovery: bill.advanceRecovery, retentionAmount: bill.retentionAmount };
  if (req.body.advanceRecovery != null) bill.advanceRecovery  = Number(req.body.advanceRecovery);
  if (req.body.retentionAmount  != null) bill.retentionAmount = Number(req.body.retentionAmount);
  await bill.save();

  const changes = diffFields(before, bill.toObject(), ['advanceRecovery', 'retentionAmount']);
  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Adjusted deductions on paid bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    changes,
  });

  success(res, { bill }, 'Deductions updated');
});

// ── Archive / Unarchive ────────────────────────────────────────
// Archiving a bill also archives its originating Bill Request (linked via BillRequest.billId).
exports.archiveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  bill.isArchived = true;
  bill.archivedAt = new Date();
  await bill.save();
  await BillRequest.updateMany({ billId: bill._id }, { isArchived: true, archivedAt: new Date() });

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} archived`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Bill archived');
});

exports.unarchiveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  bill.isArchived = false;
  bill.archivedAt = null;
  await bill.save();
  await BillRequest.updateMany({ billId: bill._id }, { isArchived: false, archivedAt: null });

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} unarchived`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Bill unarchived');
});

// PATCH /api/bills/archive-bulk  — body: { ids: string[] }
exports.archiveBillsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill id');
  await RunningBill.updateMany({ _id: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  await BillRequest.updateMany({ billId: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  success(res, {}, `${ids.length} bill(s) archived`);
});

// PATCH /api/bills/unarchive-bulk  — body: { ids: string[] }
exports.unarchiveBillsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill id');
  await RunningBill.updateMany({ _id: { $in: ids } }, { isArchived: false, archivedAt: null });
  await BillRequest.updateMany({ billId: { $in: ids } }, { isArchived: false, archivedAt: null });
  success(res, {}, `${ids.length} bill(s) unarchived`);
});
