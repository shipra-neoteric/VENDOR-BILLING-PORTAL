const { validationResult } = require('express-validator');
const WorkOrder    = require('../models/WorkOrder');
const Contractor   = require('../models/Contractor');
const Project      = require('../models/Project');
const Company      = require('../models/Company');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextWorkOrderNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');
const { startInstance } = require('../utils/slaEngine');
const { milestonesExceedContract } = require('../utils/validateMilestones');
const { documentsExceedLimit } = require('../utils/validateDocuments');
const { logAudit, diffFields } = require('../utils/auditLog');

// Per-scope-item rate/plannedQty diff, keyed by scope item _id — this is what actually
// matters for an audit trail: did someone change the rate or planned qty on a line
// item that bills have already been raised against.
function diffScopeItems(before, after) {
  const changes = {};
  const beforeById = new Map((before || []).map(si => [String(si._id), si]));
  for (const si of after || []) {
    const prev = beforeById.get(String(si._id));
    if (!prev) continue;
    const itemChanges = diffFields(prev, si, ['rate', 'plannedQty', 'description']);
    if (itemChanges) changes[si.description || String(si._id)] = itemChanges;
  }
  return Object.keys(changes).length ? changes : null;
}

exports.listWorkOrders = asyncHandler(async (req, res) => {
  const { projectId, vendorCode, status, search, assignedToMe } = req.query;
  const filter = {};
  if (projectId)  filter.projectId  = projectId;
  if (vendorCode) filter.vendorCode = vendorCode;
  if (status)     filter.status     = status;
  // DRI auto-filter: only their assigned work orders
  if (req.user.role === 'site-dri' || assignedToMe === 'true') {
    filter.assignedDRI = req.user._id;
  }
  if (search) {
    filter.$or = [
      { workOrderNo: { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { projectName: { $regex: search, $options: 'i' } },
    ];
  }
  // Attached files are stored as base64 data URIs directly on the document, which can
  // run into MBs per work order — excluding the actual bytes here (keeping just the
  // file names, so document counts/badges still work) is what keeps this list fast.
  // Any screen that needs the real file content re-fetches the single work order.
  const workOrders = await WorkOrder.find(filter)
    .select('-documents.url -documentUrl')
    .populate('projectId', 'code name projectType')
    .populate('assignedDRI', 'name email')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();
  success(res, { workOrders });
});

exports.getWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('projectId', 'code name projectType')
    .populate('createdBy', 'name email')
    .lean();
  if (!workOrder) return notFound(res, 'Work order not found');
  success(res, { workOrder });
});

exports.createWorkOrder = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (milestonesExceedContract(req.body)) {
    return badRequest(res, "Payment milestones total exceeds the work order's contract value (incl. GST)");
  }

  const docCheck = documentsExceedLimit(req.body.documents);
  if (docCheck.exceeds) return badRequest(res, docCheck.reason);

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

  // If the creator is a DRI, auto-assign them so they can see the WO in Work Progress
  const assignedDRI = Array.isArray(req.body.assignedDRI) ? [...req.body.assignedDRI] : [];
  if (req.user.role === 'site-dri' && !assignedDRI.map(String).includes(String(req.user._id))) {
    assignedDRI.push(req.user._id);
  }

  const workOrder   = await WorkOrder.create({
    ...req.body,
    workOrderNo,
    companyName,
    projectName: project.name,
    projectLocation: req.body.projectLocation || '',
    vendorName:  contractor.companyName,
    ownerName:   contractor.ownerName,
    mobile:      contractor.mobile,
    assignedDRI,
    preparedByName:    req.user.name,
    preparedByContact: req.user.email,
    createdBy:   req.user._id,
  });

  emitEvent('WORK_ORDER_CREATED', {
    projectId:  project._id,
    workOrderId: workOrder._id,
    workOrderNo: workOrder.workOrderNo,
    vendorCode:  workOrder.vendorCode,
    vendorName:  workOrder.vendorName,
    user:        req.user,
    metadata:    { contractValue: workOrder.contractValue },
  });

  await startInstance('WorkOrder', workOrder._id, workOrder.workOrderNo, req.user._id, {
    projectId: workOrder.projectId, projectName: workOrder.projectName,
    vendorName: workOrder.vendorName, amount: workOrder.contractValue,
  });

  created(res, { workOrder }, 'Work order created successfully');
});

exports.updateWorkOrder = asyncHandler(async (req, res) => {
  const { workOrderNo: _wo, ...updateData } = req.body;

  if (updateData.paymentMilestones && milestonesExceedContract(updateData)) {
    return badRequest(res, "Payment milestones total exceeds the work order's contract value (incl. GST)");
  }

  const docCheck = documentsExceedLimit(updateData.documents);
  if (docCheck.exceeds) return badRequest(res, docCheck.reason);

  const before = await WorkOrder.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Work order not found');

  const workOrder = await WorkOrder.findByIdAndUpdate(
    req.params.id,
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!workOrder) return notFound(res, 'Work order not found');

  const after = workOrder.toObject();
  const topLevelChanges = diffFields(before, after, ['contractValue', 'retentionPercent', 'gstPercent', 'status']);
  const scopeItemChanges = diffScopeItems(before.scopeItems, after.scopeItems);
  const changes = (topLevelChanges || scopeItemChanges) ? { ...topLevelChanges, ...(scopeItemChanges ? { scopeItems: scopeItemChanges } : {}) } : null;
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'work-orders', user: req.user,
      description: `Updated work order ${workOrder.workOrderNo}`,
      entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
      changes,
    });
  }

  // Keep already-generated bills/bill-requests in sync when a work order's project
  // assignment (or just its location label) changes — otherwise the old project keeps
  // showing stale paid/certified amounts for money that's actually moved elsewhere.
  const projectChanged = String(before.projectId || '') !== String(after.projectId || '');
  const locationChanged = (before.projectLocation || '') !== (after.projectLocation || '');
  if (projectChanged || locationChanged) {
    const projectUpdate = {
      projectId: after.projectId,
      projectName: after.projectName,
      projectLocation: after.projectLocation,
    };
    const [brResult, rbResult] = await Promise.all([
      BillRequest.updateMany({ workOrderId: workOrder._id }, projectUpdate),
      RunningBill.updateMany({ workOrderId: workOrder._id }, projectUpdate),
    ]);
    const totalSynced = (brResult.modifiedCount || 0) + (rbResult.modifiedCount || 0);
    if (totalSynced > 0) {
      await logAudit({
        action: 'UPDATE', module: 'work-orders', user: req.user,
        description: `Synced project reassignment (${before.projectName || '—'} → ${after.projectName || '—'}) to ${totalSynced} existing bill(s)/request(s) for ${workOrder.workOrderNo}`,
        entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
      });
    }
  }

  success(res, { workOrder }, 'Work order updated successfully');
});

exports.cancelWorkOrder = asyncHandler(async (req, res) => {
  const { remark } = req.body;
  if (!remark || !remark.trim()) return badRequest(res, 'A remark is required to cancel a work order');

  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.status === 'cancelled') return badRequest(res, 'Work order is already cancelled');

  const previousStatus = workOrder.status;
  workOrder.status       = 'cancelled';
  workOrder.cancelReason = remark.trim();
  workOrder.cancelledBy  = req.user._id;
  workOrder.cancelledAt  = new Date();
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Cancelled work order ${workOrder.workOrderNo}: ${remark.trim()}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
    changes: { status: { from: previousStatus, to: 'cancelled' } },
  });

  success(res, { workOrder }, 'Work order cancelled');
});

exports.deleteWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  await workOrder.deleteOne();
  await logAudit({
    action: 'DELETE', module: 'work-orders', user: req.user,
    description: `Deleted work order ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  success(res, null, `Work order ${workOrder.workOrderNo} deleted`);
});

exports.addScopeProgress = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.status === 'cancelled') return badRequest(res, 'Cannot add progress to a cancelled work order');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');

  const { date, qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote, plannedQty } = req.body;
  if (!qtyAdded || qtyAdded <= 0) {
    return badRequest(res, 'qtyAdded must be greater than 0');
  }

  // Allow setting planned qty at progress-entry time when it wasn't set on creation
  if (plannedQty !== undefined && Number(plannedQty) > 0) {
    item.plannedQty = Number(plannedQty);
  }

  // Only enforce the cap when a planned qty is actually set
  if (item.plannedQty > 0) {
    const remaining = item.plannedQty - (item.completedQty || 0);
    if (qtyAdded > remaining) {
      return badRequest(
        res,
        `Cannot exceed planned quantity. Only ${remaining.toLocaleString()} ${item.unit} remaining.`
      );
    }
  }

  item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote });
  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status =
    item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0                                      ? 'running'
    :                                                               'pending';

  await workOrder.save();

  emitEvent('PROGRESS_ADDED', {
    projectId:   workOrder.projectId,
    workOrderId: workOrder._id,
    workOrderNo: workOrder.workOrderNo,
    vendorCode:  workOrder.vendorCode,
    vendorName:  workOrder.vendorName,
    user:        req.user,
    metadata:    { scopeItem: item.description, qtyAdded, unit: item.unit },
  });

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
