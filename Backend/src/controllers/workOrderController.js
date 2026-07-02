const { validationResult } = require('express-validator');
const WorkOrder    = require('../models/WorkOrder');
const Contractor   = require('../models/Contractor');
const Project      = require('../models/Project');
const Company      = require('../models/Company');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextWorkOrderNo } = require('../utils/codeGen');

exports.listWorkOrders = asyncHandler(async (req, res) => {
  const { projectId, vendorCode, status, search, assignedToMe } = req.query;
  const filter = {};
  if (projectId)  filter.projectId  = projectId;
  if (vendorCode) filter.vendorCode = vendorCode;
  if (status)     filter.status     = status;
  // DRI auto-filter: only their assigned work orders
  if (req.user.role === 'dri' || assignedToMe === 'true') {
    filter.assignedDRI = req.user._id;
  }
  if (search) {
    filter.$or = [
      { workOrderNo: { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { projectName: { $regex: search, $options: 'i' } },
    ];
  }
  const workOrders = await WorkOrder.find(filter)
    .populate('projectId', 'code name projectType')
    .populate('assignedDRI', 'name email')
    .sort({ createdAt: -1 });
  success(res, { workOrders });
});

exports.getWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id).populate('projectId', 'code name projectType');
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

  let workOrderNo = (req.body.workOrderNo || '').trim();
  if (workOrderNo) {
    const duplicate = await WorkOrder.findOne({ workOrderNo });
    if (duplicate) return conflict(res, `Work order number ${workOrderNo} already exists`);
  } else {
    workOrderNo = await nextWorkOrderNo();
  }

  let companyName = '';
  if (req.body.companyId) {
    const co = await Company.findById(req.body.companyId).select('name');
    if (co) companyName = co.name;
  }

  const workOrder   = await WorkOrder.create({
    ...req.body,
    workOrderNo,
    companyName,
    projectName: project.name,
    vendorName:  contractor.companyName,
    ownerName:   contractor.ownerName,
    mobile:      contractor.mobile,
    createdBy:   req.user._id,
  });

  created(res, { workOrder }, 'Work order created successfully');
});

exports.updateWorkOrder = asyncHandler(async (req, res) => {
  const { workOrderNo: _wo, ...updateData } = req.body;
  const workOrder = await WorkOrder.findByIdAndUpdate(
    req.params.id,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!workOrder) return notFound(res, 'Work order not found');
  success(res, { workOrder }, 'Work order updated successfully');
});

exports.deleteWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  await workOrder.deleteOne();
  success(res, null, `Work order ${workOrder.workOrderNo} deleted`);
});

exports.addScopeProgress = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');

  const { date, qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote } = req.body;
  if (!qtyAdded || qtyAdded <= 0) {
    return badRequest(res, 'qtyAdded must be greater than 0');
  }

  const remaining = item.plannedQty - (item.completedQty || 0);
  if (qtyAdded > remaining) {
    return badRequest(
      res,
      `Cannot exceed planned quantity. Only ${remaining.toLocaleString()} ${item.unit} remaining.`
    );
  }

  item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote });
  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status =
    item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0             ? 'running'
    :                                      'pending';

  await workOrder.save();
  success(res, { workOrder });
});

exports.editProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, progressId } = req.params;
  const { qtyAdded, date, remarks, tower, floor, flatNo, plotNo, locationNote } = req.body;

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');

  const entry = item.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');

  if (!qtyAdded || qtyAdded <= 0) return badRequest(res, 'qtyAdded must be greater than 0');

  // Total of all OTHER entries (excluding the one being edited)
  const otherTotal = item.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (otherTotal + qtyAdded > item.plannedQty) {
    const maxAllowed = item.plannedQty - otherTotal;
    return badRequest(res, `Cannot exceed planned quantity. Max allowed for this entry: ${maxAllowed.toLocaleString()} ${item.unit}`);
  }

  // Prevent reducing below already-billed quantity
  if (otherTotal + qtyAdded < (item.lastBilledQty || 0)) {
    const minAllowed = (item.lastBilledQty || 0) - otherTotal;
    return badRequest(res, `Cannot reduce below billed quantity. Min allowed: ${minAllowed.toLocaleString()} ${item.unit}`);
  }

  entry.qtyAdded = qtyAdded;
  if (date) entry.date = new Date(date);
  if (remarks !== undefined) entry.remarks = remarks;
  if (tower        !== undefined) entry.tower        = tower;
  if (floor        !== undefined) entry.floor        = floor;
  if (flatNo       !== undefined) entry.flatNo       = flatNo;
  if (plotNo       !== undefined) entry.plotNo       = plotNo;
  if (locationNote !== undefined) entry.locationNote = locationNote;

  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status = item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';

  await workOrder.save();
  success(res, { workOrder }, 'Progress entry updated');
});

exports.deleteProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, progressId } = req.params;

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');

  const entry = item.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');

  // Prevent deleting an entry if doing so would reduce completedQty below lastBilledQty
  const newCompletedQty = item.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (newCompletedQty < (item.lastBilledQty || 0)) {
    return badRequest(res, 'Cannot delete this entry — it covers work that has already been billed. Ask admin to reverse the bill first.');
  }

  item.progressEntries.pull(progressId);
  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status = item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';

  await workOrder.save();
  success(res, { workOrder }, 'Progress entry deleted');
});
