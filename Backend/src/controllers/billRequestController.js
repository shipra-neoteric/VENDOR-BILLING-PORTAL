const mongoose    = require('mongoose');
const BillRequest = require('../models/BillRequest');
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const emitEvent   = require('../utils/emitEvent');
const { startInstance, advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { logAudit } = require('../utils/auditLog');
const { hasUnapprovedVariance, isWorkOrderApproved } = require('../utils/varianceCheck');
const { nextCode } = require('../utils/sequence');
const { nextBillNo } = require('../utils/codeGen');
const { recomputeAfterInvalidate } = require('../utils/progressHelpers');

// Gathers the DRI's day-to-day notes for whichever progress entries haven't
// been carried into a bill yet (marks them as consumed on the way out), so
// they ride along into the BillRequest/RunningBill line item instead of
// staying trapped on the WorkOrder document.
function collectAndMarkProgressRemarks(si, billRequestId) {
  const sources = (si.subItems && si.subItems.length > 0) ? si.subItems : [si];
  const notes = [];
  for (const src of sources) {
    for (const entry of src.progressEntries) {
      if (entry.billedInRequestId || entry.invalidated?.done) continue;
      if (entry.remarks && entry.remarks.trim()) notes.push(entry.remarks.trim());
      entry.billedInRequestId = billRequestId;
    }
  }
  return notes.join('; ');
}

const nextReqNo = () => nextCode('billRequestReqNo', 'BR-', 4);

// GET /api/bill-requests
exports.listBillRequests = asyncHandler(async (req, res) => {
  const { status, workOrderId, vendorCode, projectId, archived } = req.query;
  const filter = {};

  if (req.user.role === 'site-dri') filter.requestedBy = req.user._id;
  if (status)      filter.status      = status;
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (archived === 'true') filter.isArchived = true;
  else             filter.isArchived = { $ne: true };

  const requests = await BillRequest.find(filter)
    .populate('requestedBy', 'name email')
    .populate('processedBy', 'name')
    .populate('billId', 'billNo status amount paidAmount retentionPercent retentionAmount advanceRecovery gstPercent tdsPercent tdsAmount paymentDate paymentMode paymentUTR paymentBank paymentReleasedBy')
    .sort({ stageNo: 1, createdAt: 1 });

  success(res, { billRequests: requests });
});

// POST /api/bill-requests  — qty is auto-calculated, only remarks accepted from client
exports.createBillRequest = asyncHandler(async (req, res) => {
  const { workOrderId, remarks, scopeItemIds } = req.body;

  const wo = await WorkOrder.findById(workOrderId);
  if (!wo) return notFound(res, 'Work order not found');

  if (req.user.role === 'site-dri') {
    const isAssigned = (wo.assignedDRI || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!isAssigned) return forbidden(res, 'You are not assigned to this work order');
  }

  if (!isWorkOrderApproved(wo)) {
    return badRequest(res, `"${wo.workOrderNo}" has not completed its own approval chain yet (currently ${wo.approvalStatus}) — no bill request can be raised until Final Approval is given.`);
  }

  // Check no request already in flight (either stage) exists
  const existing = await BillRequest.findOne({ workOrderId: wo._id, status: { $in: ['pending', 'pending-gm'] } });
  if (existing) {
    return badRequest(res, `Stage ${existing.stageNo} (${existing.reqNo}) is already pending approval. Wait for admin review before submitting a new request.`);
  }

  // AGM/GM can hand-pick which completed items go into this cycle (checklist
  // on the Bill Review page); omitting scopeItemIds bills every pending item,
  // preserving Owner's existing one-click bypass behavior.
  const selectedIds = Array.isArray(scopeItemIds) && scopeItemIds.length > 0
    ? new Set(scopeItemIds.map(String))
    : null;
  const candidateItems = selectedIds
    ? wo.scopeItems.filter(si => selectedIds.has(String(si._id)))
    : wo.scopeItems;

  // Auto-calculate pending qty per scope item. Rate is snapshotted here too
  // (not just at gmApprove) purely so it's visible to whoever reviews the
  // request at L1/L2 — gmApprove still re-reads the WO's current rate fresh
  // when it actually builds the RunningBill, so a rate edited on the WO
  // in between never goes stale in what's actually billed.
  const pendingItems = candidateItems
    .map(si => ({
      scopeItemId:  si._id,
      description:  si.description,
      unit:         si.unit,
      completedQty: si.completedQty || 0,
      lastBilledQty:si.lastBilledQty || 0,
      billedQty:    Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)),
      rate:         si.rate || 0,
    }))
    .filter(it => it.billedQty > 0);

  if (!pendingItems.length) {
    return badRequest(res, 'No new progress to bill. Record daily progress first before generating a bill request.');
  }

  // Any item still over its planned qty (or one of its particulars) must be
  // explicitly signed off by AGM/GM before it can go into a bill.
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    if (hasUnapprovedVariance(si)) {
      return badRequest(res, `"${si.description}" has unapproved progress variance — approve it before billing.`);
    }
  }

  // Stage number and billing period
  const stageNo = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
  const lastBR  = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('createdAt periodTo');
  const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
  const periodTo   = new Date();

  const reqNo = await nextReqNo();
  const billRequestId = new mongoose.Types.ObjectId();

  // Carry each billed item's not-yet-billed progress-entry remarks along, and
  // mark those entries consumed (on the in-memory WO doc — saved below).
  const progressRemarksByItem = new Map();
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    progressRemarksByItem.set(String(pi.scopeItemId), collectAndMarkProgressRemarks(si, billRequestId));
  }

  const billRequest = await BillRequest.create({
    _id: billRequestId,
    reqNo,
    stageNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectId:   wo.projectId || null,
    projectName: wo.projectName,
    projectLocation: wo.projectLocation,
    vendorCode:  wo.vendorCode,
    vendorName:  wo.vendorName,
    companyName: wo.companyName,
    category:    wo.category    || '',
    subCategory: wo.subCategory || '',
    periodFrom,
    periodTo,
    items: pendingItems.map(it => ({
      scopeItemId: it.scopeItemId,
      description: it.description,
      unit:        it.unit,
      billedQty:   it.billedQty,
      rate:        it.rate,
      amount:      it.rate * it.billedQty,
      progressRemarks: progressRemarksByItem.get(String(it.scopeItemId)) || '',
    })),
    remarks:     remarks || '',
    requestedBy: req.user._id,
  });

  // Lock in lastBilledQty on each scope item so it can't be double-billed
  for (const pi of pendingItems) {
    const si = wo.scopeItems.id(pi.scopeItemId);
    if (si) si.lastBilledQty = pi.completedQty;
  }
  await wo.save();

  emitEvent('BILL_REQUESTED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: billRequest._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo,
    user:          req.user,
    metadata:      { reqNo },
  });

  const estimatedAmount = pendingItems.reduce((s, it) => s + it.billedQty * (wo.scopeItems.id(it.scopeItemId)?.rate || 0), 0);
  await startInstance('BillRequest', billRequest._id, billRequest.reqNo, req.user._id, {
    projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: estimatedAmount,
  });

  created(res, { billRequest }, `Stage ${stageNo} bill request ${reqNo} submitted successfully`);
});

// PUT /api/bill-requests/:id/agm-approve — Stage 1 (L1). Decides the actual
// hold/advance figures, but doesn't create the RunningBill yet — that only
// happens once GM signs off too (see gmApprove below).
exports.agmApprove = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  const totalAmount = br.items.reduce((s, item) => {
    const scopeItem = item.scopeItemId ? wo.scopeItems.id(item.scopeItemId) : wo.scopeItems.find(si => si.description === item.description);
    return s + (scopeItem?.rate ?? 0) * item.billedQty;
  }, 0);
  const retentionPercent = wo.retentionPercent ?? 0;
  const defaultRetention = Math.round(totalAmount * retentionPercent / 100);
  // AGM sets the actual hold/advance figures as part of L1 approval — falls back
  // to the work order's automatic retention calc if AGM doesn't override it.
  // Persisted here (not just used once) since gmApprove reads them back later.
  const retentionAmount  = req.body.retentionAmount != null ? Number(req.body.retentionAmount) : defaultRetention;
  const advanceRecovery  = req.body.advanceRecovery != null ? Number(req.body.advanceRecovery) : 0;

  br.retentionAmount = retentionAmount;
  br.advanceRecovery = advanceRecovery;
  br.agmApprovedBy   = req.user._id;
  br.agmApprovedAt   = new Date();
  br.status          = 'pending-gm';
  br.approvalHistory.push({ stage: 'agm', action: 'approved', by: req.user._id, remarks: req.body.remarks || '' });
  await br.save();

  emitEvent('BILL_REQUEST_AGM_APPROVED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: br._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, totalAmount },
  });

  await advanceInstance('BillRequest', br._id, req.user._id, 'AGM approved');

  await logAudit({
    action: 'APPROVE', module: 'bill-requests', user: req.user,
    description: `AGM approved ${br.reqNo} — forwarded to GM`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
    changes: { retentionAmount: { from: null, to: retentionAmount }, advanceRecovery: { from: null, to: advanceRecovery } },
  });

  success(res, { billRequest: br }, `AGM approved — Stage ${br.stageNo} forwarded to GM`);
});

// PUT /api/bill-requests/:id/gm-approve — Stage 2 (L2), final. This is where
// the RunningBill actually gets created, using the retention/advance figures
// AGM already set at L1.
exports.gmApprove = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending-gm') return badRequest(res, `Request is already ${br.status}`);
  if (br.agmApprovedBy && br.agmApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The AGM who approved this cannot also give GM sign-off — segregation of duties requires a different approver.');
  }

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  // Re-check at the actual bill-creation moment, not just when the request
  // was first raised — an edit to Scope of Work/Payment Milestones between
  // then and now can reset the WO back into its own approval chain.
  if (!isWorkOrderApproved(wo)) {
    return badRequest(res, `"${wo.workOrderNo}" is no longer fully approved (currently ${wo.approvalStatus}) — it must clear its own approval chain again before this request can become a bill.`);
  }

  // Build line items with rates from WO
  const lineItems = br.items.map(item => {
    const scopeItem = item.scopeItemId
      ? wo.scopeItems.id(item.scopeItemId)
      : wo.scopeItems.find(si => si.description === item.description);

    const rate   = scopeItem?.rate   ?? 0;
    const amount = rate * item.billedQty;

    return {
      scopeItemId: item.scopeItemId,
      description: item.description,
      remarks:     scopeItem?.remarks   || '',
      progressRemarks: item.progressRemarks || '',
      unit:        item.unit,
      plannedQty:  scopeItem?.plannedQty ?? 0,
      billedQty:   item.billedQty,
      rate,
      amount,
    };
  });

  const totalAmount     = lineItems.reduce((s, l) => s + l.amount, 0);
  const retentionAmount = br.retentionAmount || 0;
  const advanceRecovery = br.advanceRecovery || 0;
  const billNo = await nextBillNo();

  const runningBill = await RunningBill.create({
    billNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectId:   wo.projectId,
    projectName: wo.projectName,
    projectLocation: wo.projectLocation,
    vendorCode:  wo.vendorCode,
    vendorName:  wo.vendorName,
    companyName: wo.companyName,
    billDate:    new Date(),
    lineItems,
    amount:           totalAmount,
    retentionPercent: wo.retentionPercent ?? 0,
    retentionAmount,
    advanceRecovery,
    gstPercent:  wo.gstPercent ?? 18,
    tdsPercent:  0,
    generatedBy: req.user.name,
    status:      'draft',
    agmApprovedBy: br.agmApprovedBy,
    agmApprovedAt: br.agmApprovedAt,
    // The GM who just approved this at L2 (gmApprove) — carried onto the bill
    // itself exactly like the AGM's L1 sign-off above, so the bill's own
    // AGM/GM pills reflect the pre-Accounts gate that already happened
    // rather than staying permanently blank until some later, unrelated
    // Accounts-side checker action (a separate stage — see checkerBy).
    verifiedBy:  req.user._id,
    verifiedAt:  new Date(),
    createdBy:   req.user._id,
  });

  br.items = br.items.map((item, i) => ({
    ...item.toObject(),
    rate:   lineItems[i].rate,
    amount: lineItems[i].amount,
  }));
  br.status      = 'approved';
  br.billId      = runningBill._id;
  br.processedBy = req.user._id;
  br.processedAt = new Date();
  br.approvalHistory.push({ stage: 'gm', action: 'approved', by: req.user._id, remarks: req.body.remarks || '' });
  await br.save();

  emitEvent('BILL_REQUEST_APPROVED', {
    projectId:     wo.projectId,
    workOrderId:   wo._id,
    workOrderNo:   wo.workOrderNo,
    billRequestId: br._id,
    runningBillId: runningBill._id,
    vendorCode:    wo.vendorCode,
    vendorName:    wo.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, billNo, totalAmount },
  });

  await advanceInstance('BillRequest', br._id, req.user._id, 'GM approved');

  await logAudit({
    action: 'APPROVE', module: 'bill-requests', user: req.user,
    description: `GM approved ${br.reqNo} — generated bill ${billNo} (₹${totalAmount.toLocaleString('en-IN')})`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  success(res, { billRequest: br, bill: runningBill }, `Approved — Bill ${billNo} generated for Stage ${br.stageNo}`);
});

// PUT /api/bill-requests/:id/reject — from either L1 (pending) or L2 (pending-gm).
exports.rejectBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (!['pending', 'pending-gm'].includes(br.status)) return badRequest(res, `Request is already ${br.status}`);
  const rejectedStage = br.status === 'pending-gm' ? 'gm' : 'agm';

  const rejectReason = req.body.rejectReason || 'No reason provided';

  // Roll back lastBilledQty so DRI can re-bill after fixing their progress. A
  // rejected request means the progress it was made from was wrong — auto-
  // invalidate those entries (reason = the rejection reason) rather than just
  // freeing them, so they stay visible as history but never count toward
  // progress/billing again. The DRI logs fresh, correct progress from scratch.
  const wo = await WorkOrder.findById(br.workOrderId);
  if (wo) {
    for (const item of br.items) {
      if (item.scopeItemId) {
        const si = wo.scopeItems.id(item.scopeItemId);
        if (si) {
          si.lastBilledQty = Math.max(0, (si.lastBilledQty || 0) - item.billedQty);
          const sources = (si.subItems && si.subItems.length > 0) ? si.subItems : [si];
          for (const src of sources) {
            for (const entry of src.progressEntries) {
              if (entry.billedInRequestId && String(entry.billedInRequestId) === String(br._id) && !entry.invalidated?.done) {
                entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason: rejectReason };
                entry.billedInRequestId = null;
              }
            }
          }
          recomputeAfterInvalidate(si);
        }
      }
    }
    await wo.save();
  }

  br.status       = 'rejected';
  br.rejectReason = rejectReason;
  br.processedBy  = req.user._id;
  br.processedAt  = new Date();
  br.approvalHistory.push({ stage: rejectedStage, action: 'rejected', by: req.user._id, remarks: rejectReason });
  await br.save();

  emitEvent('BILL_REQUEST_REJECTED', {
    projectId:     br.projectId || (wo ? wo.projectId : undefined),
    workOrderId:   br.workOrderId,
    workOrderNo:   br.workOrderNo,
    billRequestId: br._id,
    vendorCode:    br.vendorCode,
    vendorName:    br.vendorName,
    stageNo:       br.stageNo,
    user:          req.user,
    metadata:      { reqNo: br.reqNo, reason: br.rejectReason },
  });

  await cancelInstance('BillRequest', br._id, `Rejected: ${br.rejectReason}`);

  await logAudit({
    action: 'REJECT', module: 'bill-requests', user: req.user,
    description: `Rejected ${br.reqNo}${br.rejectReason ? ` — ${br.rejectReason}` : ''}`,
    entityType: 'BillRequest', entityId: br._id, entityLabel: br.reqNo,
  });

  success(res, { billRequest: br }, `Stage ${br.stageNo} rejected — DRI can re-submit after corrections`);
});

// Payment release now happens exclusively via the Accounts Payment module
// (billController.releasePayment), which also syncs milestoneAchieved on this
// BillRequest and processes AdvanceSlip recoveries — see that function for the
// single canonical release path.

// POST /api/bill-requests/batch
// Creates one bill request per work order, all grouped under a shared batchId.
exports.createBatchBillRequest = asyncHandler(async (req, res) => {
  const { workOrderIds, remarks } = req.body;

  if (!Array.isArray(workOrderIds) || workOrderIds.length === 0) {
    return badRequest(res, 'Provide at least one work order ID');
  }

  const batchId = `BATCH-${Date.now()}`;
  const created = [];
  const skipped = [];

  for (const workOrderId of workOrderIds) {
    const wo = await WorkOrder.findById(workOrderId);
    if (!wo) { skipped.push({ workOrderId, reason: 'Not found' }); continue; }

    if (req.user.role === 'site-dri') {
      const isAssigned = (wo.assignedDRI || []).some(
        id => id.toString() === req.user._id.toString()
      );
      if (!isAssigned) { skipped.push({ workOrderId, reason: 'Not assigned' }); continue; }
    }

    if (!isWorkOrderApproved(wo)) {
      skipped.push({ workOrderId, reason: `Not yet fully approved (currently ${wo.approvalStatus})` });
      continue;
    }

    const existing = await BillRequest.findOne({ workOrderId: wo._id, status: { $in: ['pending', 'pending-gm'] } });
    if (existing) { skipped.push({ workOrderId, reason: `Stage ${existing.stageNo} already pending` }); continue; }

    const pendingItems = wo.scopeItems
      .map(si => ({
        scopeItemId:   si._id,
        description:   si.description,
        unit:          si.unit,
        completedQty:  si.completedQty  || 0,
        lastBilledQty: si.lastBilledQty || 0,
        billedQty:     Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)),
        rate:          si.rate || 0,
      }))
      .filter(it => it.billedQty > 0);

    if (!pendingItems.length) { skipped.push({ workOrderId, reason: 'No pending progress' }); continue; }

    const stageNo    = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
    const lastBR     = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('periodTo');
    const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
    const periodTo   = new Date();
    const reqNo      = await nextReqNo();
    const billRequestId = new mongoose.Types.ObjectId();

    // This is Owner's direct-bypass path — bills everything pending without a
    // variance gate, but still carries progress remarks through for free.
    const progressRemarksByItem = new Map();
    for (const pi of pendingItems) {
      const si = wo.scopeItems.id(pi.scopeItemId);
      progressRemarksByItem.set(String(pi.scopeItemId), collectAndMarkProgressRemarks(si, billRequestId));
    }

    const br = await BillRequest.create({
      _id: billRequestId,
      reqNo, stageNo,
      workOrderId: wo._id,
      workOrderNo: wo.workOrderNo,
      projectId:   wo.projectId || null,
      projectName: wo.projectName,
      projectLocation: wo.projectLocation,
      vendorCode:  wo.vendorCode,
      vendorName:  wo.vendorName,
      companyName: wo.companyName,
      category:    wo.category    || '',
      subCategory: wo.subCategory || '',
      periodFrom, periodTo,
      items: pendingItems.map(it => ({
        scopeItemId: it.scopeItemId,
        description: it.description,
        unit:        it.unit,
        billedQty:   it.billedQty,
        rate:        it.rate,
        amount:      it.rate * it.billedQty,
        progressRemarks: progressRemarksByItem.get(String(it.scopeItemId)) || '',
      })),
      remarks:     remarks || '',
      requestedBy: req.user._id,
      batchId,
    });

    for (const pi of pendingItems) {
      const si = wo.scopeItems.id(pi.scopeItemId);
      if (si) si.lastBilledQty = pi.completedQty;
    }
    await wo.save();

    emitEvent('BILL_REQUESTED', {
      projectId:     wo.projectId,
      workOrderId:   wo._id,
      workOrderNo:   wo.workOrderNo,
      billRequestId: br._id,
      vendorCode:    wo.vendorCode,
      vendorName:    wo.vendorName,
      stageNo,
      user:          req.user,
      metadata:      { reqNo, batchId },
    });

    const batchEstimatedAmount = pendingItems.reduce((s, it) => s + it.billedQty * (wo.scopeItems.id(it.scopeItemId)?.rate || 0), 0);
    await startInstance('BillRequest', br._id, br.reqNo, req.user._id, {
      projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: batchEstimatedAmount,
    });

    created.push(br);
  }

  if (!created.length) {
    return badRequest(res, `No work orders could be billed. ${skipped.map(s => s.reason).join('; ')}`);
  }

  res.status(201).json({
    success: true,
    message: `Bill request submitted for ${created.length} work order${created.length !== 1 ? 's' : ''} across ${new Set(created.map(b => b.projectName)).size} project${new Set(created.map(b => b.projectName)).size !== 1 ? 's' : ''}`,
    billRequests: created,
    batchId,
    skipped,
  });
});

// ── Archive / Unarchive ────────────────────────────────────────
// Archiving a request also archives its linked Running Bill (if approved and billed).
exports.archiveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  br.isArchived = true;
  br.archivedAt = new Date();
  await br.save();
  if (br.billId) await RunningBill.findByIdAndUpdate(br.billId, { isArchived: true, archivedAt: new Date() });
  success(res, { billRequest: br }, 'Bill request archived');
});

exports.unarchiveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  br.isArchived = false;
  br.archivedAt = null;
  await br.save();
  if (br.billId) await RunningBill.findByIdAndUpdate(br.billId, { isArchived: false, archivedAt: null });
  success(res, { billRequest: br }, 'Bill request unarchived');
});

// PATCH /api/bill-requests/archive-bulk  — body: { ids: string[] }
exports.archiveBillRequestsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill request id');
  const requests = await BillRequest.find({ _id: { $in: ids } }).select('billId');
  const billIds = requests.map(r => r.billId).filter(Boolean);
  await BillRequest.updateMany({ _id: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  if (billIds.length) await RunningBill.updateMany({ _id: { $in: billIds } }, { isArchived: true, archivedAt: new Date() });
  success(res, {}, `${ids.length} bill request(s) archived`);
});

// PATCH /api/bill-requests/unarchive-bulk  — body: { ids: string[] }
exports.unarchiveBillRequestsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill request id');
  const requests = await BillRequest.find({ _id: { $in: ids } }).select('billId');
  const billIds = requests.map(r => r.billId).filter(Boolean);
  await BillRequest.updateMany({ _id: { $in: ids } }, { isArchived: false, archivedAt: null });
  if (billIds.length) await RunningBill.updateMany({ _id: { $in: billIds } }, { isArchived: false, archivedAt: null });
  success(res, {}, `${ids.length} bill request(s) unarchived`);
});
