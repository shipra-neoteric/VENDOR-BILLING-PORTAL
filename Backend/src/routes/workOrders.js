const router     = require('express').Router();
const { body, validationResult } = require('express-validator');
const WorkOrder  = require('../models/WorkOrder');
const Contractor = require('../models/Contractor');
const Project    = require('../models/Project');
const { authenticate, authorize } = require('../middleware/auth');
const { nextWorkOrderNo } = require('../utils/codeGen');

router.use(authenticate);

// GET /api/work-orders
router.get('/', async (req, res) => {
  try {
    const { projectId, vendorCode, status, search } = req.query;
    const filter = {};
    if (projectId)  filter.projectId  = projectId;
    if (vendorCode) filter.vendorCode = vendorCode;
    if (status)     filter.status     = status;
    if (search) {
      filter.$or = [
        { workOrderNo: { $regex: search, $options: 'i' } },
        { vendorName:  { $regex: search, $options: 'i' } },
        { projectName: { $regex: search, $options: 'i' } },
      ];
    }
    const workOrders = await WorkOrder.find(filter)
      .populate('projectId', 'code name')
      .sort({ createdAt: -1 });
    res.json({ workOrders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', async (req, res) => {
  try {
    const workOrder = await WorkOrder.findById(req.params.id).populate('projectId', 'code name');
    if (!workOrder) return res.status(404).json({ message: 'Work order not found' });
    res.json({ workOrder });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/work-orders
router.post(
  '/',
  authorize('owner', 'gm', 'accounts'),
  [
    body('projectId').notEmpty().withMessage('Project is required'),
    body('vendorCode').notEmpty().withMessage('Vendor code is required'),
    body('issueDate').isISO8601().withMessage('Valid issue date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const project    = await Project.findById(req.body.projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const contractor = await Contractor.findOne({ vendorCode: req.body.vendorCode });
      if (!contractor) return res.status(404).json({ message: 'Contractor not found for this vendor code' });

      const workOrderNo = await nextWorkOrderNo();

      const workOrder = await WorkOrder.create({
        ...req.body,
        workOrderNo,
        projectName: project.name,
        vendorName:  contractor.companyName,
        ownerName:   contractor.ownerName,
        mobile:      contractor.mobile,
        createdBy:   req.user._id,
      });

      res.status(201).json({ workOrder });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/work-orders/:id
router.put('/:id', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const workOrder = await WorkOrder.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!workOrder) return res.status(404).json({ message: 'Work order not found' });
    res.json({ workOrder });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/work-orders/:id/scope-items/:itemId/progress
router.post('/:id/scope-items/:itemId/progress', async (req, res) => {
  try {
    const workOrder = await WorkOrder.findById(req.params.id);
    if (!workOrder) return res.status(404).json({ message: 'Work order not found' });

    const item = workOrder.scopeItems.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Scope item not found' });

    const { date, qtyAdded, remarks } = req.body;
    if (!qtyAdded || qtyAdded <= 0) {
      return res.status(400).json({ message: 'qtyAdded must be greater than 0' });
    }

    item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks });
    item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
    item.status = item.completedQty >= item.plannedQty ? 'completed'
                : item.completedQty > 0 ? 'running'
                : 'pending';

    await workOrder.save();
    res.json({ workOrder });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
