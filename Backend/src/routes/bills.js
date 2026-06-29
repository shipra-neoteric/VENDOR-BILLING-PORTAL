const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const RunningBill = require('../models/RunningBill');
const WorkOrder   = require('../models/WorkOrder');
const { authenticate, authorize } = require('../middleware/auth');
const { nextBillNo } = require('../utils/codeGen');

router.use(authenticate);

// GET /api/bills
router.get('/', async (req, res) => {
  try {
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

    res.json({ bills });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bills/:id
router.get('/:id', async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id)
      .populate('verifiedBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('rejectedBy', 'name role');
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    res.json({ bill });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/bills
router.post(
  '/',
  authorize('owner', 'gm', 'accounts', 'engineer', 'contractor'),
  [
    body('billDate').isISO8601().withMessage('Valid bill date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      // workOrderId is optional — bill can be raised without one
      const workOrder = req.body.workOrderId
        ? await WorkOrder.findById(req.body.workOrderId)
        : null;
      if (req.body.workOrderId && !workOrder) {
        return res.status(404).json({ message: 'Work order not found' });
      }

      const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
      if (lineItems.length === 0) {
        return res.status(400).json({ message: 'At least one work item is required' });
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

      // Update work order scope item completedQty for each billed line item
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
          // Non-fatal: bill is already saved; log and continue
          console.error('Warning: could not update work order progress from bill:', woErr.message);
        }
      }

      res.status(201).json({ bill });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/bills/:id  (draft edits only)
router.put('/:id', authorize('owner', 'gm', 'accounts', 'contractor'), async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (['approved', 'paid'].includes(bill.status)) {
      return res.status(400).json({ message: 'Approved or paid bills cannot be edited' });
    }
    Object.assign(bill, req.body);
    await bill.save();
    res.json({ bill });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/bills/:id/verify
router.patch('/:id/verify', authorize('owner', 'gm', 'engineer'), async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status !== 'submitted') {
      return res.status(400).json({ message: `Cannot verify a bill with status '${bill.status}'` });
    }
    bill.status     = 'verified';
    bill.verifiedBy = req.user._id;
    bill.verifiedAt = new Date();
    if (req.body.remarks) bill.remarks = req.body.remarks;
    await bill.save();
    await bill.populate('verifiedBy', 'name role');
    res.json({ bill, message: 'Bill verified — forwarded for approval' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/bills/:id/approve
router.patch('/:id/approve', authorize('owner', 'gm'), async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (!['submitted', 'verified'].includes(bill.status)) {
      return res.status(400).json({ message: `Cannot approve a bill with status '${bill.status}'` });
    }
    bill.status     = 'approved';
    bill.approvedBy = req.user._id;
    bill.approvedAt = new Date();
    if (req.body.remarks) bill.remarks = req.body.remarks;
    await bill.save();
    await bill.populate('approvedBy', 'name role');
    res.json({ bill, message: 'Bill approved and certified' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/bills/:id/reject
router.patch('/:id/reject', authorize('owner', 'gm', 'engineer'), async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (['approved', 'paid', 'rejected'].includes(bill.status)) {
      return res.status(400).json({ message: `Cannot reject a bill with status '${bill.status}'` });
    }
    bill.status       = 'rejected';
    bill.rejectedBy   = req.user._id;
    bill.rejectReason = req.body.reason || 'No reason provided';
    await bill.save();
    await bill.populate('rejectedBy', 'name role');
    res.json({ bill, message: 'Bill rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/bills/:id/pay
router.patch('/:id/pay', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const bill = await RunningBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    if (bill.status !== 'approved') {
      return res.status(400).json({ message: `Only approved bills can be marked as paid` });
    }
    bill.status = 'paid';
    if (req.body.paymentUTR)        bill.paymentUTR        = req.body.paymentUTR;
    if (req.body.paymentChequeNo)   bill.paymentChequeNo   = req.body.paymentChequeNo;
    if (req.body.paymentDate)       bill.paymentDate       = new Date(req.body.paymentDate);
    if (req.body.paymentBank)       bill.paymentBank       = req.body.paymentBank;
    if (req.body.paymentMode)       bill.paymentMode       = req.body.paymentMode;
    if (req.body.paymentReleasedBy) bill.paymentReleasedBy = req.body.paymentReleasedBy;
    await bill.save();
    res.json({ bill, message: 'Payment recorded' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
