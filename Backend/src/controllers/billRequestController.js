const BillRequest = require('../models/BillRequest');
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');

// Auto-generate request number BR-XXXX
async function nextReqNo() {
  const last = await BillRequest.findOne().sort({ createdAt: -1 }).select('reqNo');
  if (!last?.reqNo) return 'BR-0001';
  const num = parseInt(last.reqNo.replace('BR-', ''), 10) || 0;
  return 'BR-' + String(num + 1).padStart(4, '0');
}

// Auto-generate bill number for RunningBill
async function nextBillNo() {
  const last = await RunningBill.findOne().sort({ createdAt: -1 }).select('billNo');
  if (!last?.billNo) return 'RA-0001';
  const m = last.billNo.match(/(\d+)$/);
  const num = m ? parseInt(m[1], 10) : 0;
  return 'RA-' + String(num + 1).padStart(4, '0');
}

// GET /api/bill-requests
exports.listBillRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};

  // DRI can only see their own requests
  if (req.user.role === 'dri') {
    filter.requestedBy = req.user._id;
  }
  if (status) filter.status = status;

  const requests = await BillRequest.find(filter)
    .populate('requestedBy', 'name email')
    .populate('processedBy', 'name')
    .populate('billId', 'billNo status amount')
    .sort({ createdAt: -1 });

  success(res, { billRequests: requests });
});

// POST /api/bill-requests  (DRI only)
exports.createBillRequest = asyncHandler(async (req, res) => {
  const { workOrderId, items, remarks } = req.body;

  if (!items?.length) return badRequest(res, 'At least one scope item is required');

  const wo = await WorkOrder.findById(workOrderId);
  if (!wo) return notFound(res, 'Work order not found');

  // Verify DRI is assigned to this WO (owner/gm bypass)
  if (req.user.role === 'dri') {
    const isAssigned = (wo.assignedDRI || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!isAssigned) return forbidden(res, 'You are not assigned to this work order');
  }

  const reqNo = await nextReqNo();

  const billRequest = await BillRequest.create({
    reqNo,
    workOrderId: wo._id,
    workOrderNo: wo.workOrderNo,
    projectName: wo.projectName,
    vendorCode:  wo.vendorCode,
    vendorName:  wo.vendorName,
    category:    wo.category    || '',
    subCategory: wo.subCategory || '',
    items:       items.map(it => ({
      scopeItemId: it.scopeItemId,
      description: it.description,
      unit:        it.unit || '',
      billedQty:   it.billedQty,
    })),
    remarks:     remarks || '',
    requestedBy: req.user._id,
  });

  created(res, { billRequest }, `Bill request ${reqNo} submitted`);
});

// PUT /api/bill-requests/:id/approve  (owner / gm / accounts)
exports.approveBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  // Fetch work order to get rates
  const wo = await WorkOrder.findById(br.workOrderId);
  if (!wo) return notFound(res, 'Associated work order not found');

  // Build line items with rate × qty from WO scope items
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

  const totalAmount = lineItems.reduce((s, l) => s + l.amount, 0);
  const billNo = await nextBillNo();

  // Create RunningBill
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
    amount:      totalAmount,
    generatedBy: req.user.name,
    status:      'submitted',
    createdBy:   req.user._id,
  });

  // Update bill request items with rates + amounts
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

  success(res, { billRequest: br, bill: runningBill }, `Approved — bill ${billNo} generated`);
});

// PUT /api/bill-requests/:id/reject  (owner / gm / accounts)
exports.rejectBillRequest = asyncHandler(async (req, res) => {
  const br = await BillRequest.findById(req.params.id);
  if (!br) return notFound(res, 'Bill request not found');
  if (br.status !== 'pending') return badRequest(res, `Request is already ${br.status}`);

  br.status       = 'rejected';
  br.rejectReason = req.body.rejectReason || '';
  br.processedBy  = req.user._id;
  br.processedAt  = new Date();
  await br.save();

  success(res, { billRequest: br }, 'Bill request rejected');
});
