const BillRequest = require('../models/BillRequest');
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const emitEvent   = require('../utils/emitEvent');
const { startInstance, advanceInstance, cancelInstance } = require('../utils/slaEngine');

async function nextReqNo() {
  const last = await BillRequest.findOne().sort({ createdAt: -1 }).select('reqNo');
  if (!last?.reqNo) return 'BR-0001';
  const num = parseInt(last.reqNo.replace('BR-', ''), 10) || 0;
  return 'BR-' + String(num + 1).padStart(4, '0');
}

async function nextBillNo() {
  const last = await RunningBill.findOne().sort({ createdAt: -1 }).select('billNo');
  if (!last?.billNo) return 'RA-0001';
  const m = last.billNo.match(/(\d+)$/);
  const num = m ? parseInt(m[1], 10) : 0;
  return 'RA-' + String(num + 1).padStart(4, '0');
}

// GET /api/bill-requests
exports.listBillRequests = asyncHandler(async (req, res) => {
  const { status, workOrderId, vendorCode, projectId, archived } = req.query;
  const filter = {};

  if (req.user.role === 'dri') filter.requestedBy = req.user._id;
  if (status)      filter.status      = status;
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (archived === 'true') filter.isArchived = true;
  else             filter.isArchived = { $ne: true };

  const requests = await BillRequest.find(filter)
    .populate('requestedBy', 'name email')
    .populate('processedBy', 'name')
    .populate('billId', 'billNo status amount paidAmount retentionPercent retentionAmount advanceRecovery gstPercent tdsPercent paymentDate paymentMode paymentUTR paymentBank paymentReleasedBy')
    .sort({ stageNo: 1, createdAt: 1 });

  success(res, { billRequests: requests });
});

// POST /api/bill-requests  — qty is auto-calculated, only remarks accepted from client
exports.createBillRequest = asyncHandler(async (req, res) => {
  const { workOrderId, remarks } = req.body;

  const wo = await WorkOrder.findById(workOrderId);
  if (!wo) return notFound(res, 'Work order not found');

  if (req.user.role === 'dri') {
    const isAssigned = (wo.assignedDRI || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!isAssigned) return forbidden(res, 'You are not assigned to this work order');
  }

  // Check no pending request already exists
  const existing = await BillRequest.findOne({ workOrderId: wo._id, status: 'pending' });
  if (existing) {
    return badRequest(res, `Stage ${existing.stageNo} (${existing.reqNo}) is already pending approval. Wait for admin review before submitting a new request.`);
  }

  // Auto-calculate pending qty per scope item
  const pendingItems = wo.scopeItems
    .map(si => ({
      scopeItemId:  si._id,
      description:  si.description,
      unit:         si.unit,
      completedQty: si.completedQty || 0,
      lastBilledQty:si.lastBilledQty || 0,
      billedQty:    Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)),
    }))
    .filter(it => it.billedQty > 0);

  if (!pendingItems.length) {
    return badRequest(res, 'No new progress to bill. Record daily progress first before generating a bill request.');
  }

  // Stage number and billing period
  const stageNo = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
  const lastBR  = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('createdAt periodTo');
  const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
  const periodTo   = new Date();

  const reqNo = await nextReqNo();

  const billRequest = await BillRequest.create({
    reqNo,
    stageNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectId:   wo.projectId || null,
    projectName: wo.projectName,
    projectLocation: wo.projectLocation,
    vendorCode:  wo.vendorCode,
    vendorName:  wo.vendorName,
    category:    wo.category    || '',
    subCategory: wo.subCategory || '',
    periodFrom,
    periodTo,
    items: pendingItems.map(it => ({
      scopeItemId: it.scopeItemId,
      description: it.description,
      unit:        it.unit,
      billedQty:   it.billedQty,
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

// PUT /api/bill-requests/:id/approve
exports.approveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

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
      unit:        item.unit,
      plannedQty:  scopeItem?.plannedQty ?? 0,
      billedQty:   item.billedQty,
      rate,
      amount,
    };
  });

  const totalAmount      = lineItems.reduce((s, l) => s + l.amount, 0);
  const retentionPercent = wo.retentionPercent ?? 0;
  const retentionAmount  = Math.round(totalAmount * retentionPercent / 100);
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
    billDate:    new Date(),
    lineItems,
    amount:           totalAmount,
    retentionPercent,
    retentionAmount,
    gstPercent:  wo.gstPercent ?? 18,
    tdsPercent:  0,
    generatedBy: req.user.name,
    status:      'submitted',
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

  await advanceInstance('BillRequest', br._id, req.user._id, 'Approved');

  success(res, { billRequest: br, bill: runningBill }, `Approved — Bill ${billNo} generated for Stage ${br.stageNo}`);
});

// PUT /api/bill-requests/:id/reject
exports.rejectBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  // Roll back lastBilledQty so DRI can re-bill after fixing their progress
  const wo = await WorkOrder.findById(br.workOrderId);
  if (wo) {
    for (const item of br.items) {
      if (item.scopeItemId) {
        const si = wo.scopeItems.id(item.scopeItemId);
        if (si) si.lastBilledQty = Math.max(0, (si.lastBilledQty || 0) - item.billedQty);
      }
    }
    await wo.save();
  }

  br.status       = 'rejected';
  br.rejectReason = req.body.rejectReason || '';
  br.processedBy  = req.user._id;
  br.processedAt  = new Date();
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

  success(res, { billRequest: br }, `Stage ${br.stageNo} rejected — DRI can re-submit after corrections`);
});

// PUT /api/bill-requests/:id/milestone  — Mark payment released / milestone achieved
exports.markMilestone = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id).populate('billId', 'billNo status amount');
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'approved') return badRequest(res, 'Only approved bill requests can be marked as milestones');
  if (br.milestoneAchieved) return badRequest(res, 'Already marked as milestone');

  br.milestoneAchieved = true;
  br.milestoneDate     = new Date();
  await br.save();

  await advanceInstance('BillRequest', br._id, req.user._id, 'Payment released');

  if (br.billId) {
    const billUpdate = {
      status:             'paid',
      paymentDate:        new Date(),
      paymentReleasedBy:  req.user.name,
      ...(req.body.paymentUTR  ? { paymentUTR:  req.body.paymentUTR  } : {}),
      ...(req.body.paidAmount  != null ? { paidAmount:       Number(req.body.paidAmount)      } : {}),
      ...(req.body.holdAmount  != null ? { retentionAmount:  Number(req.body.holdAmount)      } : {}),
      ...(req.body.advanceRecoveries?.length
          ? { advanceRecovery: req.body.advanceRecoveries.reduce((s, r) => s + (r.amount || 0), 0) }
          : req.body.advanceRecoveryAmount != null
            ? { advanceRecovery: Number(req.body.advanceRecoveryAmount) }
            : {}),
    };
    await RunningBill.findByIdAndUpdate(br.billId, billUpdate);
  }

  // Process advance recoveries
  const AdvanceSlip = require('../models/AdvanceSlip');
  const recoveries  = req.body.advanceRecoveries || [];
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

  success(res, { billRequest: br }, `Stage ${br.stageNo} — Payment released! Milestone achieved.`);
});

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

    if (req.user.role === 'dri') {
      const isAssigned = (wo.assignedDRI || []).some(
        id => id.toString() === req.user._id.toString()
      );
      if (!isAssigned) { skipped.push({ workOrderId, reason: 'Not assigned' }); continue; }
    }

    const existing = await BillRequest.findOne({ workOrderId: wo._id, status: 'pending' });
    if (existing) { skipped.push({ workOrderId, reason: `Stage ${existing.stageNo} already pending` }); continue; }

    const pendingItems = wo.scopeItems
      .map(si => ({
        scopeItemId:   si._id,
        description:   si.description,
        unit:          si.unit,
        completedQty:  si.completedQty  || 0,
        lastBilledQty: si.lastBilledQty || 0,
        billedQty:     Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)),
      }))
      .filter(it => it.billedQty > 0);

    if (!pendingItems.length) { skipped.push({ workOrderId, reason: 'No pending progress' }); continue; }

    const stageNo    = await BillRequest.countDocuments({ workOrderId: wo._id }) + 1;
    const lastBR     = await BillRequest.findOne({ workOrderId: wo._id }).sort({ createdAt: -1 }).select('periodTo');
    const periodFrom = lastBR?.periodTo ?? wo.issueDate ?? new Date();
    const periodTo   = new Date();
    const reqNo      = await nextReqNo();

    const br = await BillRequest.create({
      reqNo, stageNo,
      workOrderId: wo._id,
      workOrderNo: wo.workOrderNo,
      projectId:   wo.projectId || null,
      projectName: wo.projectName,
      projectLocation: wo.projectLocation,
      vendorCode:  wo.vendorCode,
      vendorName:  wo.vendorName,
      category:    wo.category    || '',
      subCategory: wo.subCategory || '',
      periodFrom, periodTo,
      items: pendingItems.map(it => ({
        scopeItemId: it.scopeItemId,
        description: it.description,
        unit:        it.unit,
        billedQty:   it.billedQty,
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
