const { validationResult } = require('express-validator');
const RunningBill  = require('../models/RunningBill');
const WorkOrder    = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextBillNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');

exports.listBills = asyncHandler(async (req, res) => {
  const { workOrderId, vendorCode, projectId, status, search } = req.query;
  const filter = {};
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (status)      filter.status      = status;
  if (search) {
    filter.$or = [
      { billNo:      { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { workOrderNo: { $regex: search, $options: 'i' } },
      { generatedBy: { $regex: search, $options: 'i' } },
    ];
  }

  const bills = await RunningBill.find(filter)
    .populate('verifiedBy', 'name role')
    .populate('approvedBy', 'name role')
    .populate('rejectedBy', 'name role')
    .sort({ createdAt: -1 });

  success(res, { bills });
});

exports.getBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id)
    .populate('verifiedBy', 'name role')
    .populate('approvedBy', 'name role')
    .populate('rejectedBy', 'name role');
  if (!bill) return notFound(res, 'Bill not found');
  success(res, { bill });
});

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

  const amount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const billNo = await nextBillNo();

  const bill = await RunningBill.create({
    ...req.body,
    billNo,
    amount,
    lineItems,
    ...(workOrder ? {
      workOrderNo: workOrder.workOrderNo,
      projectId:   workOrder.projectId,
      projectName: workOrder.projectName,
      vendorCode:  workOrder.vendorCode,
      vendorName:  workOrder.vendorName,
    } : {}),
    status:      'submitted',
    submittedAt: new Date(),
    createdBy:   req.user._id,
  });

  // Update work order scope item progress (non-fatal)
  if (workOrder && lineItems.length > 0) {
    try {
      const woDoc = await WorkOrder.findById(workOrder._id);
      if (woDoc) {
        let changed = false;
        for (const li of lineItems) {
          if (!li.scopeItemId || !li.billedQty) continue;
          const si = woDoc.scopeItems.id(li.scopeItemId);
          if (si) {
            const cap = si.plannedQty || 999999;
            si.completedQty = Math.min(cap, (si.completedQty || 0) + Number(li.billedQty));
            changed = true;
          }
        }
        if (changed) await woDoc.save();
      }
    } catch (woErr) {
      console.error('Warning: could not update work order progress from bill:', woErr.message);
    }
  }

  created(res, { bill }, 'Bill submitted successfully');
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['approved', 'paid'].includes(bill.status)) {
    return badRequest(res, 'Approved or paid bills cannot be edited');
  }
  Object.assign(bill, req.body);
  await bill.save();
  success(res, { bill }, 'Bill updated successfully');
});

exports.verifyBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'submitted') {
    return badRequest(res, `Cannot verify a bill with status '${bill.status}'`);
  }
  bill.status     = 'verified';
  bill.verifiedBy = req.user._id;
  bill.verifiedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  await bill.save();
  await bill.populate('verifiedBy', 'name role');

  emitEvent('RUNNING_BILL_VERIFIED', {
    projectId:    bill.projectId,
    workOrderId:  bill.workOrderId,
    workOrderNo:  bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:   bill.vendorCode,
    vendorName:   bill.vendorName,
    user:         req.user,
    metadata:     { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Bill verified — forwarded for approval');
});

exports.approveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!['submitted', 'verified'].includes(bill.status)) {
    return badRequest(res, `Cannot approve a bill with status '${bill.status}'`);
  }
  bill.status     = 'approved';
  bill.approvedBy = req.user._id;
  bill.approvedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  await bill.save();
  await bill.populate('approvedBy', 'name role');

  emitEvent('RUNNING_BILL_APPROVED', {
    projectId:     bill.projectId,
    workOrderId:   bill.workOrderId,
    workOrderNo:   bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:    bill.vendorCode,
    vendorName:    bill.vendorName,
    user:          req.user,
    metadata:      { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Bill approved and certified');
});

exports.rejectBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['approved', 'paid', 'rejected'].includes(bill.status)) {
    return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  }
  bill.status       = 'rejected';
  bill.rejectedBy   = req.user._id;
  bill.rejectReason = req.body.reason || 'No reason provided';
  await bill.save();
  await bill.populate('rejectedBy', 'name role');
  success(res, { bill }, 'Bill rejected');
});

exports.payBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, 'Only approved bills can be marked as paid');
  }
  bill.status = 'paid';
  if (req.body.paymentUTR)        bill.paymentUTR        = req.body.paymentUTR;
  if (req.body.paymentChequeNo)   bill.paymentChequeNo   = req.body.paymentChequeNo;
  if (req.body.paymentDate)       bill.paymentDate       = new Date(req.body.paymentDate);
  if (req.body.paymentBank)       bill.paymentBank       = req.body.paymentBank;
  if (req.body.paymentMode)       bill.paymentMode       = req.body.paymentMode;
  if (req.body.paymentReleasedBy) bill.paymentReleasedBy = req.body.paymentReleasedBy;
  if (req.body.paidAmount != null) bill.paidAmount       = Number(req.body.paidAmount);
  await bill.save();

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

// PATCH /api/bills/:id/deductions  — correct advance recovery / retention split on a paid bill
exports.patchDeductions = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'paid') return badRequest(res, 'Can only adjust deductions on paid bills');
  if (req.body.advanceRecovery != null) bill.advanceRecovery  = Number(req.body.advanceRecovery);
  if (req.body.retentionAmount  != null) bill.retentionAmount = Number(req.body.retentionAmount);
  await bill.save();
  success(res, { bill }, 'Deductions updated');
});
