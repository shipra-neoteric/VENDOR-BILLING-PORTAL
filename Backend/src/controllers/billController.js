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
const { hasUnapprovedVariance } = require('../utils/varianceCheck');

const MODULE = 'accounts-payment';

// Advances the SLA tracker for whichever BillRequest generated this RunningBill —
// no-ops silently if there's no linked request or no in-progress instance, so it's
// safe to call unconditionally from every stage-transition action below.
async function advanceBillRequestInstance(bill, actorUserId, remarks) {
  const br = await BillRequest.findOne({ billId: bill._id }).select('_id');
  if (!br) return;
  await advanceInstance('BillRequest', br._id, actorUserId, remarks);
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
      if (si && hasUnapprovedVariance(si)) {
        return badRequest(res, `"${si.description}" has unapproved progress variance — approve it on the Bill Review page before billing.`);
      }
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

  // Update work order scope item progress (non-fatal)
  if (workOrder && lineItems.length > 0) {
    try {
      let changed = false;
      for (const li of lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = workOrder.scopeItems.id(li.scopeItemId);
        if (si) {
          const cap = si.plannedQty || 999999;
          si.lastBilledQty = Math.min(cap, (si.lastBilledQty || 0) + Number(li.billedQty));
          changed = true;
        }
      }
      if (changed) await workOrder.save();
    } catch (woErr) {
      console.error('Warning: could not update work order progress from bill:', woErr.message);
    }
  }

  created(res, { bill }, 'Bill created — awaiting maker confirmation');
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['approved', 'payment-initiated', 'paid'].includes(bill.status)) {
    return badRequest(res, 'Approved, payment-initiated or paid bills cannot be edited');
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
  bill.status      = 'submitted';
  bill.submittedAt = new Date();
  bill.makerBy     = req.user._id;
  bill.makerAt     = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
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

  const before = { retentionAmount: bill.retentionAmount, advanceRecovery: bill.advanceRecovery };
  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  const amountChanges = diffFields(before, { retentionAmount: bill.retentionAmount, advanceRecovery: bill.advanceRecovery }, ['retentionAmount', 'advanceRecovery']);

  bill.status     = 'approved';
  bill.checkerBy  = req.user._id;
  bill.checkerAt  = new Date();
  bill.approvedBy = req.user._id;
  bill.approvedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  await bill.save();
  await bill.populate('checkerBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Checker approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: amountChanges
      ? `Checker verified bill ${bill.billNo} against its work order and adjusted hold/advance figures`
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

// Stage 3 — L3 approver gives final sign-off and enters TDS, initiating payment.
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
  if (req.body.tdsPercent != null) bill.tdsPercent = Number(req.body.tdsPercent);
  if (req.body.tdsAmount  != null) bill.tdsAmount  = Number(req.body.tdsAmount);
  if (req.body.remarks) bill.remarks = req.body.remarks;
  await bill.save();
  await bill.populate('paymentInitiatedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Approver initiated payment');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `Approver signed off on bill ${bill.billNo} — payment initiated, TDS ₹${(bill.tdsAmount || 0).toLocaleString('en-IN')}`,
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

  success(res, { bill }, 'Payment initiated — pending physical verification and release');
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
  bill.physicalVerification = {
    done:   true,
    by:     req.user._id,
    at:     new Date(),
    remark: req.body.remark || '',
  };
  await bill.save();
  await bill.populate('physicalVerification.by', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Physical verification completed for bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Physical verification recorded — ready for release');
});

exports.rejectBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['paid', 'rejected'].includes(bill.status)) {
    return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  }
  bill.status       = 'rejected';
  bill.rejectedBy   = req.user._id;
  bill.rejectReason = req.body.reason || 'No reason provided';
  await bill.save();
  await bill.populate('rejectedBy', 'name role');

  // Sync bill request status → rejected, roll back lastBilledQty so DRI can re-bill
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br) {
    br.status = 'rejected';
    br.rejectReason = req.body.reason || 'Bill rejected in Accounts Payment';
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
            changed = true;
          }
        }
        if (changed) await wo.save();
      }
    }
  }

  await logAudit({
    action: 'REJECT', module: MODULE, user: req.user,
    description: `Rejected bill ${bill.billNo}${bill.rejectReason ? ` — ${bill.rejectReason}` : ''}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Bill rejected');
});

// Stage 4 — final release, after physical verification. Also the single place
// AdvanceSlip recoveries get processed (ported in from the old, now-removed
// billRequestController.markMilestone, which used to be the only path that did
// this — releasing via this endpoint alone used to leave advance slips stale).
exports.releasePayment = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'payment-initiated') {
    return badRequest(res, 'Payment must be initiated (TDS entered) before it can be released');
  }
  if (!bill.physicalVerification?.done && req.user.role !== 'owner') {
    return badRequest(res, 'Complete physical verification (printed bill + work order attachments + physical sign-off) before releasing payment');
  }

  bill.status = 'paid';
  if (req.body.paymentUTR)        bill.paymentUTR        = req.body.paymentUTR;
  if (req.body.paymentChequeNo)   bill.paymentChequeNo   = req.body.paymentChequeNo;
  if (req.body.paymentDate)       bill.paymentDate       = new Date(req.body.paymentDate);
  if (req.body.paymentBank)       bill.paymentBank       = req.body.paymentBank;
  if (req.body.paymentMode)       bill.paymentMode       = req.body.paymentMode;
  if (req.body.paymentReleasedBy)       bill.paymentReleasedBy      = req.body.paymentReleasedBy;
  if (req.body.paidAmount != null)      bill.paidAmount              = Number(req.body.paidAmount);
  if (req.body.retentionReleased != null) bill.retentionReleased     = Number(req.body.retentionReleased);
  if (req.body.retentionReleaseRemark)  bill.retentionReleaseRemark  = req.body.retentionReleaseRemark;
  await bill.save();
  await advanceBillRequestInstance(bill, req.user._id, 'Payment released');

  // Keep the originating BillRequest's own "done" flag in sync.
  const br = await BillRequest.findOne({ billId: bill._id });
  if (br && !br.milestoneAchieved) {
    br.milestoneAchieved = true;
    br.milestoneDate = bill.paymentDate || new Date();
    await br.save();
  }

  // Process advance recoveries against outstanding AdvanceSlips, if any were
  // allocated as part of this release.
  const recoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  if (recoveries.length) {
    const AdvanceSlip = require('../models/AdvanceSlip');
    for (const rec of recoveries) {
      if (!rec.slipId || !rec.amount || rec.amount <= 0) continue;
      const slip = await AdvanceSlip.findById(rec.slipId);
      if (!slip) continue;
      slip.amountRecovered += rec.amount;
      slip.recoveries.push({
        amount:     rec.amount,
        date:       new Date(),
        releasedBy: req.user.name,
      });
      slip.status = slip.amountRecovered >= slip.amount
        ? 'recovered'
        : slip.amountRecovered > 0 ? 'partial' : 'outstanding';
      await slip.save();
    }
  }

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `Payment released for bill ${bill.billNo}${bill.paidAmount != null ? ` — ₹${Math.round(bill.paidAmount).toLocaleString('en-IN')} paid` : ''}${bill.paymentUTR ? ` (UTR ${bill.paymentUTR})` : ''}`,
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
    metadata:      { billNo: bill.billNo, amount: bill.amount, paymentMode: req.body.paymentMode, utr: req.body.paymentUTR },
  });

  success(res, { bill }, 'Payment recorded');
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
