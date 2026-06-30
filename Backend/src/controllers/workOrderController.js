const { validationResult } = require('express-validator');
const WorkOrder    = require('../models/WorkOrder');
const Contractor   = require('../models/Contractor');
const Project      = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextWorkOrderNo } = require('../utils/codeGen');

exports.listWorkOrders = asyncHandler(async (req, res) => {
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
  success(res, { workOrders });
});

exports.getWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id).populate('projectId', 'code name');
  if (!workOrder) return notFound(res, 'Work order not found');
  success(res, { workOrder });
});

exports.createWorkOrder = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const project = await Project.findById(req.body.projectId);
  if (!project) return notFound(res, 'Project not found');

  const contractor = await Contractor.findOne({ vendorCode: req.body.vendorCode });
  if (!contractor) return notFound(res, 'Contractor not found for this vendor code');

  const workOrderNo = await nextWorkOrderNo();
  const workOrder   = await WorkOrder.create({
    ...req.body,
    workOrderNo,
    projectName: project.name,
    vendorName:  contractor.companyName,
    ownerName:   contractor.ownerName,
    mobile:      contractor.mobile,
    createdBy:   req.user._id,
  });

  created(res, { workOrder }, 'Work order created successfully');
});

exports.updateWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!workOrder) return notFound(res, 'Work order not found');
  success(res, { workOrder }, 'Work order updated successfully');
});

exports.addScopeProgress = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');

  const { date, qtyAdded, remarks } = req.body;
  if (!qtyAdded || qtyAdded <= 0) {
    return badRequest(res, 'qtyAdded must be greater than 0');
  }

  item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks });
  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status =
    item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0             ? 'running'
    :                                      'pending';

  await workOrder.save();
  success(res, { workOrder });
});
