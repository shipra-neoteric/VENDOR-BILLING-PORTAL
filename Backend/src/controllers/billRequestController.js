const BillRequest = require('../models/BillRequest');
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const emitEvent   = require('../utils/emitEvent');

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
  const { status, workOrderId, vendorCode, projectId } = req.query;
  const filter = {};

  if (req.user.role === 'dri') filter.requestedBy = req.user._id;
  if (status)      filter.status      = status;
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;

  const requests = await BillRequest.find(filter)
    .populate('requestedBy', 'name email')
    .populate('processedBy', 'name')
    .populate('billId', 'billNo status amount paidAmount retentionPercent retentionAmount paymentDate')
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

  if (br.billId) {
    const billUpdate = {
      status:             'paid',
      paymentDate:        new Date(),
      paymentReleasedBy:  req.user.name,
      ...(req.body.paymentUTR  ? { paymentUTR:  req.body.paymentUTR  } : {}),
      ...(req.body.paidAmount  != null ? { paidAmount:       req.body.paidAmount              } : {}),
      ...(req.body.holdAmount  != null ? { retentionAmount:  Number(req.body.holdAmount)      } : {}),
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
