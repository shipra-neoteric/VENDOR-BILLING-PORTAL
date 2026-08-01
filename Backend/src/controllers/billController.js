const { validationResult } = require('express-validator');
const RunningBill  = require('../models/RunningBill');
const BillRequest  = require('../models/BillRequest');
const WorkOrder    = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextBillNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');
const { advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { logAudit, diffFields } = require('../utils/auditLog');
const { hasUnapprovedVarianceForLineItem, resolveBillableItem, findOverbilledLineItem, isWorkOrderApproved } = require('../utils/varianceCheck');
const { recomputeAfterInvalidate, recomputeParentFromSubItems, deriveStatus } = require('../utils/progressHelpers');
const { applyAdvanceRecoveries } = require('../utils/advanceRecovery');

const MODULE = 'accounts-payment';

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

const POPULATE_FIELDS = ['agmApprovedBy', 'makerBy', 'verifiedBy', 'checkerBy', 'approvedBy', 'paymentInitiatedBy', 'rejectedBy'];

exports.listBills = asyncHandler(async (req, res) => {
  const { workOrderId, vendorCode, projectId, status, search, archived } = req.query;
  const filter = {};
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (status)      filter.status      = status;
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
    const AdvanceSlip = require('../models/AdvanceSlip');
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

  const bill = await RunningBill.create({
    ...req.body,
    billNo,
    amount,
    lineItems,
    linkedBills,
    billingCycle: cycleCount + 1,
    ...(workOrder ? {
      workOrderNo: workOrder.workOrderNo,
      projectId:   workOrder.projectId,
      projectName: workOrder.projectName,
      projectLocation: workOrder.projectLocation,
      vendorCode:  workOrder.vendorCode,
      vendorName:  workOrder.vendorName,
      companyName: workOrder.companyName,
    } : {}),
    status:      'draft',
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

  created(res, { bill }, 'Bill created — awaiting maker confirmation');
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['approved', 'payment-initiated', 'paid'].includes(bill.status)) {
    return badRequest(res, 'Approved, payment-initiated or paid bills cannot be edited');
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

  Object.assign(bill, req.body);
  await bill.save();
  success(res, { bill }, 'Bill updated successfully');
});

// Stage 1 — L1 maker confirms the bill is ready and forwards it to the checker.
exports.makerConfirm = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'draft') {
    return badRequest(res, `Cannot confirm a bill with status '${bill.status}'`);
  }
  const checklist = req.body.makerChecklist || {};
  if (!checklist.tallyEntryDone) {
    return badRequest(res, 'Confirm the Tally entry is done before forwarding to the checker.');
  }
  // "New items added in Tally" doesn't apply to every bill (only ones that
  // actually introduced new items) — informational only, never blocks confirming.
  bill.makerChecklist = { tallyEntryDone: true, newItemsAddedInTally: !!checklist.newItemsAddedInTally };
  bill.status      = 'submitted';
  bill.submittedAt = new Date();
  bill.makerBy     = req.user._id;
  bill.makerAt     = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'maker', 'submitted', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('makerBy', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Maker confirmed bill ${bill.billNo} — forwarded to checker`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  emitEvent('RUNNING_BILL_MAKER_CONFIRMED', {
    projectId:    bill.projectId,
    workOrderId:  bill.workOrderId,
    workOrderNo:  bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:   bill.vendorCode,
    vendorName:   bill.vendorName,
    user:         req.user,
    metadata:     { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Confirmed — forwarded to checker');
});

// Stage 2 — L2 checker verifies the bill against its work order, sets hold/
// retention and advance recovery, and approves. Accepts legacy 'verified' bills
// (from before this stage existed) as valid input too, so nothing in flight
// under the old flow gets stuck.
exports.checkerApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!['submitted', 'verified'].includes(bill.status)) {
    return badRequest(res, `Cannot check a bill with status '${bill.status}'`);
  }
  if (bill.makerBy && bill.makerBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The maker cannot also check their own bill — segregation of duties requires a different checker.');
  }

  const before = { retentionAmount: bill.retentionAmount, advanceRecovery: bill.advanceRecovery, tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, retentionReleased: bill.retentionReleased };
  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  // TDS now entered here too (moved from the approver stage) — the checker is
  // the one already setting retention/advance, so all deduction figures come
  // from a single reviewer's pass over the bill instead of being split across
  // stages. Hold/Retention Release (settling a PRIOR period's withheld
  // retention via this bill) also belongs here for the same reason, rather
  // than at final release time.
  if (req.body.tdsPercent != null) bill.tdsPercent = Number(req.body.tdsPercent);
  if (req.body.tdsAmount  != null) bill.tdsAmount  = Number(req.body.tdsAmount);
  if (req.body.retentionReleased != null) bill.retentionReleased = Number(req.body.retentionReleased);
  if (req.body.retentionReleaseRemark != null) bill.retentionReleaseRemark = req.body.retentionReleaseRemark;
  const amountChanges = diffFields(before, { retentionAmount: bill.retentionAmount, advanceRecovery: bill.advanceRecovery, tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, retentionReleased: bill.retentionReleased }, ['retentionAmount', 'advanceRecovery', 'tdsPercent', 'tdsAmount', 'retentionReleased']);

  bill.status     = 'approved';
  bill.checkerBy  = req.user._id;
  bill.checkerAt  = new Date();
  bill.approvedBy = req.user._id;
  bill.approvedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'checker', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('checkerBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Checker approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: amountChanges
      ? `Checker verified bill ${bill.billNo} against its work order and set hold/advance/TDS figures`
      : `Checker verified bill ${bill.billNo} against its work order`,
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

  success(res, { bill }, 'Checker approved — ready for final sign-off');
});

// Stage 3 — L3 approver reviews everything the checker set (retention/advance/
// TDS, now all entered upstream) and forwards to payment. Pure approve-and-
// forward — TDS is no longer entered here, see checkerApprove.
exports.approverInitiate = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, `Cannot initiate payment for a bill with status '${bill.status}'`);
  }
  if (bill.checkerBy && bill.checkerBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The checker cannot also give final approval on the same bill — segregation of duties requires a different approver.');
  }
  bill.status = 'payment-initiated';
  bill.paymentInitiatedBy = req.user._id;
  bill.paymentInitiatedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'approver', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('paymentInitiatedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Approver initiated payment');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `Approver signed off on bill ${bill.billNo} — payment initiated (TDS ₹${(bill.tdsAmount || 0).toLocaleString('en-IN')} set earlier by checker)`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  emitEvent('PAYMENT_INITIATED', {
    projectId:     bill.projectId,
    workOrderId:   bill.workOrderId,
    workOrderNo:   bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:    bill.vendorCode,
    vendorName:    bill.vendorName,
    user:          req.user,
    metadata:      { billNo: bill.billNo, amount: bill.amount, tdsAmount: bill.tdsAmount },
  });

  success(res, { bill }, 'Payment initiated — pending payment preparation, physical verification and release');
});

// Approver can pause a payment mid-review instead of approving or rejecting
// outright — e.g. a dispute with the vendor, budget timing, etc. Only
// reachable from 'approved'; resumes via releaseHold below.
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

// Returns a held bill to the Approver's queue to decide again (approve /
// reject / hold once more) — leaves holdBy/holdAt/holdReason in place as the
// historical record of the episode, doesn't null them out.
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
    description: `Hold released on bill ${bill.billNo} — back with the approver`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Hold released — back with the approver');
});

// "Payment Maker" stage — Accounts picks the real payment mode and confirms a
// readiness checklist before Physical Verification is allowed. Gates
// physicalVerify below exactly the way physicalVerification already gates
// releasePayment.
exports.preparePayment = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'payment-initiated') {
    return badRequest(res, `Payment preparation only applies once payment has been initiated (current status '${bill.status}')`);
  }
  if (bill.paymentPreparation?.done) {
    return badRequest(res, 'Payment preparation already completed for this bill');
  }
  const { paymentMode, checklist = {} } = req.body;
  if (!paymentMode) return badRequest(res, 'Select a payment mode');
  if (!checklist.bankDetailsVerified || !checklist.fundsAvailable || !checklist.voucherPrepared) {
    return badRequest(res, 'Confirm all three checklist items before proceeding');
  }
  bill.paymentPreparation = {
    done: true, by: req.user._id, at: new Date(), paymentMode,
    checklist: { bankDetailsVerified: true, fundsAvailable: true, voucherPrepared: true },
    remark: req.body.remark || '',
  };
  pushHistory(bill, 'payment-maker', 'done', req.user._id, req.body.remark);
  await bill.save();
  await bill.populate('paymentPreparation.by', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Payment preparation completed for bill ${bill.billNo} — mode: ${paymentMode.toUpperCase()}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Payment preparation recorded — ready for physical verification');
});

// Physical-world checkpoint before release: bill printed, work order attachments
// pulled in, physically (wet-signature) signed off in the accounts section. A
// hard gate on release, not a soft warning — see releasePayment below.
exports.physicalVerify = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'payment-initiated') {
    return badRequest(res, `Physical verification only applies once payment has been initiated (current status '${bill.status}')`);
  }
  if (!bill.paymentPreparation?.done) {
    return badRequest(res, 'Complete payment preparation (mode + checklist) before physical verification');
  }
  bill.physicalVerification = {
    done:   true,
    by:     req.user._id,
    at:     new Date(),
    remark: req.body.remark || '',
  };
  pushHistory(bill, 'physical-verify', 'done', req.user._id, req.body.remark);
  await bill.save();
  await bill.populate('physicalVerification.by', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Physical verification completed for bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Physical verification recorded — ready for release');
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
  submitted: { to: 'draft',     actions: ['checker'] },
  verified:  { to: 'draft',     actions: ['checker'] },
  approved:  { to: 'submitted', actions: ['approver'] },
  // Any sub-stage actor within payment-initiated (Payment Maker, Physical
  // Verify, or Release) can flag something wrong and send it back.
  'payment-initiated': { to: 'approved', actions: ['payment-maker', 'physical-verify', 'release'] },
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
    pushHistory(bill, 'maker', 'sent-back', req.user._id, reason);
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

  success(res, { bill }, `Sent back — ${reason}`);
});

// Stage 4 — "Mark as Paid": confirms the payment physically went out, after
// physical verification. Deliberately minimal — none of the paperwork detail
// (mode/UTR/bank/released-by/exact amount) is required here, since that
// routinely lags behind the actual transfer by a day or more. See
// submitPaymentDetails below for where those get recorded.
exports.releasePayment = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'payment-initiated') {
    return badRequest(res, 'Payment must be initiated before it can be released');
  }
  if (!bill.physicalVerification?.done && req.user.role !== 'owner') {
    return badRequest(res, 'Complete physical verification (printed bill + work order attachments + physical sign-off) before releasing payment');
  }

  bill.status = 'paid';
  pushHistory(bill, 'release', 'done', req.user._id, req.body.remarks);
  await bill.save();
  await advanceBillRequestInstance(bill, req.user._id, 'Payment released');

  // Keep the originating BillRequest's own "done" flag in sync.
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br && !br.milestoneAchieved) {
    br.milestoneAchieved = true;
    br.milestoneDate = new Date();
    await br.save();
  }

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `Payment released for bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  emitEvent('PAYMENT_RELEASED', {
    projectId:     bill.projectId,
    workOrderId:   bill.workOrderId,
    workOrderNo:   bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:    bill.vendorCode,
    vendorName:    bill.vendorName,
    user:          req.user,
    metadata:      { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Payment recorded');
});

// Records the actual payment paperwork once it catches up with what already
// physically happened at releasePayment — mode/UTR/bank/released-by/exact
// amount, plus AdvanceSlip recovery processing (ported in from the old,
// now-removed billRequestController.markMilestone). Payment mode defaults to
// whatever was decided at the Payment Maker stage if not resent here.
exports.submitPaymentDetails = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'paid') {
    return badRequest(res, `Payment details only apply to paid bills (current status '${bill.status}')`);
  }
  if (bill.paymentDetails?.done) {
    return badRequest(res, 'Payment details already recorded for this bill');
  }

  if (req.body.paymentUTR)      bill.paymentUTR        = req.body.paymentUTR;
  if (req.body.paymentChequeNo) bill.paymentChequeNo   = req.body.paymentChequeNo;
  if (req.body.paymentDate)     bill.paymentDate       = new Date(req.body.paymentDate);
  if (req.body.paymentBank)     bill.paymentBank       = req.body.paymentBank;
  bill.paymentMode = req.body.paymentMode || bill.paymentPreparation?.paymentMode || bill.paymentMode;
  if (req.body.paymentReleasedBy)  bill.paymentReleasedBy = req.body.paymentReleasedBy;
  if (req.body.paidAmount != null) bill.paidAmount        = Number(req.body.paidAmount);
  bill.paymentDetails = { done: true, by: req.user._id, at: new Date(), remark: req.body.remark || '' };
  pushHistory(bill, 'payment-details', 'done', req.user._id, req.body.remark);
  await bill.save();

  if (bill.paymentDate) {
    const br = await BillRequest.findOne({ billId: bill._id });
    if (br) { br.milestoneDate = bill.paymentDate; await br.save(); }
  }

  // Process advance recoveries against outstanding AdvanceSlips, if any were
  // allocated as part of recording these payment details.
  await applyAdvanceRecoveries(req.body.advanceRecoveries, { billNo: bill.billNo, releasedBy: req.user.name });

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Payment details recorded for bill ${bill.billNo}${bill.paidAmount != null ? ` — ₹${Math.round(bill.paidAmount).toLocaleString('en-IN')} paid` : ''}${bill.paymentUTR ? ` (UTR ${bill.paymentUTR})` : ''}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Payment details recorded');
});

// GET /api/bills/chain/:workOrderId — billing chain for a WO (all bills, sorted by cycle)
exports.getBillingChain = asyncHandler(async (req, res) => {
  const { workOrderId } = req.params;
  const bills = await RunningBill.find({ workOrderId })
    .populate('supersededBy', 'billNo billType')
    .populate('agmApprovedBy', 'name role')
    .populate('makerBy',   'name role')
    .populate('checkerBy', 'name role')
    .populate('verifiedBy',   'name role')
    .populate('approvedBy',   'name role')
    .populate('paymentInitiatedBy', 'name role')
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
  success(res, { bill }, 'Bill archived');
});

exports.unarchiveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  bill.isArchived = false;
  bill.archivedAt = null;
  await bill.save();
  await BillRequest.updateMany({ billId: bill._id }, { isArchived: false, archivedAt: null });
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
