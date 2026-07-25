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

// When an item has particulars, its own status/completedQty are derived from
// them rather than tracked directly — called after any particular's progress
// changes so the parent automatically flips to "completed" once every
// particular is fully done.
function recomputeParentFromSubItems(item) {
  if (!item.subItems || item.subItems.length === 0) return;
  item.completedQty = item.subItems.reduce((s, si) => s + (si.completedQty || 0), 0);
  const allCompleted = item.subItems.every(si =>
    si.plannedQty > 0 ? si.completedQty >= si.plannedQty : si.status === 'completed'
  );
  const anyStarted = item.subItems.some(si => (si.completedQty || 0) > 0);
  item.status = allCompleted ? 'completed' : anyStarted ? 'running' : 'pending';
}

// Progress is never hard-blocked at plannedQty — AGM/GM see an over-logged item
// flagged (yellow ≤10% over, red beyond that, computed client-side) and must
// explicitly sign off before it can be billed. A prior sign-off only gets
// invalidated if completedQty actually changed since it was approved — not by
// an unrelated edit (e.g. fixing a remarks/location typo) that nets out to the
// same quantity.
function applyVarianceGate(target) {
  if (target.plannedQty > 0 && target.completedQty > target.plannedQty) {
    if (target.varianceApproved && target.completedQty !== target.varianceApprovedAtQty) {
      target.varianceApproved = false;
    }
  }
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
    // Every newly-created WO must travel the 4-level approval chain — existing
    // WOs predating this feature default to 'approved' at the schema level
    // (grandfathered), so only new documents ever start here.
    approvalStatus: 'draft',
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
  if (before.isLocked) return badRequest(res, 'This work order is locked and cannot be edited. Unlock it first.');
  if (!['draft', 'sent-back', 'approved'].includes(before.approvalStatus)) {
    return badRequest(res, `This work order is awaiting review (${before.approvalStatus}) and cannot be edited until it's approved or sent back.`);
  }

  // Editing a work order that had already cleared the full approval chain
  // (only possible once Owner has unlocked it) must send it back through the
  // chain from scratch — otherwise newly-added/changed scope items would sit
  // on a WO still flagged "Approved · Locked · Ready for Work Progress" without
  // anyone ever actually reviewing what changed.
  const reopening = before.approvalStatus === 'approved';
  if (reopening) updateData.approvalStatus = 'draft';

  const mongoUpdate = reopening
    ? { $set: updateData, $push: { approvalHistory: {
        stage: 'maker', action: 'reopened', by: req.user._id,
        remarks: 'Work order edited after approval — sent back through the full approval chain.',
      } } }
    : { $set: updateData };

  const workOrder = await WorkOrder.findByIdAndUpdate(
    req.params.id,
    mongoUpdate,
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

  if (reopening) {
    await logAudit({
      action: 'UPDATE', module: 'work-orders', user: req.user,
      description: `Reopened work order ${workOrder.workOrderNo} for editing — sent back through the full approval chain`,
      entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
      changes: { approvalStatus: { from: 'approved', to: 'draft' } },
    });
  }

  success(res, { workOrder }, reopening
    ? 'Work order updated — approval chain reset, must be resubmitted for review'
    : 'Work order updated successfully');
});

// ── 4-level approval workflow ────────────────────────────────────────────
// Stage 1 — Maker submits a draft (or a work order sent back to them) for the
// checker to review. "Send Back" always returns here regardless of which
// later stage rejected it, so this is also the re-submit entry point.
exports.submitWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (!['draft', 'sent-back'].includes(workOrder.approvalStatus)) {
    return badRequest(res, `Cannot submit a work order with approval status '${workOrder.approvalStatus}'`);
  }
  workOrder.approvalStatus = 'pending-checker';
  workOrder.makerBy = req.user._id;
  workOrder.makerAt = new Date();
  workOrder.approvalHistory.push({ stage: 'maker', action: 'submitted', by: req.user._id, remarks: req.body.remarks || '' });
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Submitted work order ${workOrder.workOrderNo} for checker review`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  emitEvent('WORK_ORDER_SUBMITTED', {
    projectId: workOrder.projectId, workOrderId: workOrder._id, workOrderNo: workOrder.workOrderNo,
    vendorCode: workOrder.vendorCode, vendorName: workOrder.vendorName, user: req.user,
  });

  success(res, { workOrder }, 'Submitted — awaiting checker review');
});

// Stage 2 — Checker verifies the full work order (scope, BOQ, rates, contractor,
// documents) matches what was agreed, then approves it forward to the approver.
exports.checkerApprove = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.approvalStatus !== 'pending-checker') {
    return badRequest(res, `Cannot check a work order with approval status '${workOrder.approvalStatus}'`);
  }
  workOrder.approvalStatus = 'pending-approver';
  workOrder.checkerBy = req.user._id;
  workOrder.checkerAt = new Date();
  workOrder.checkerRemarks = req.body.remarks || '';
  workOrder.approvalHistory.push({ stage: 'checker', action: 'approved', by: req.user._id, remarks: workOrder.checkerRemarks });
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Checker verified & approved work order ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  emitEvent('WORK_ORDER_CHECKER_APPROVED', {
    projectId: workOrder.projectId, workOrderId: workOrder._id, workOrderNo: workOrder.workOrderNo,
    vendorCode: workOrder.vendorCode, vendorName: workOrder.vendorName, user: req.user,
  });

  success(res, { workOrder }, 'Verified & approved — forwarded to approver');
});

// Stage 3 — Approver reviews the full document plus the checker's remarks, then
// approves it forward to the final (CEO/Owner) sign-off.
exports.approverApprove = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.approvalStatus !== 'pending-approver') {
    return badRequest(res, `Cannot approve a work order with approval status '${workOrder.approvalStatus}'`);
  }
  workOrder.approvalStatus = 'pending-final';
  workOrder.approverBy = req.user._id;
  workOrder.approverAt = new Date();
  workOrder.approverRemarks = req.body.remarks || '';
  workOrder.approvalHistory.push({ stage: 'approver', action: 'approved', by: req.user._id, remarks: workOrder.approverRemarks });
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Approver verified & approved work order ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  emitEvent('WORK_ORDER_APPROVER_APPROVED', {
    projectId: workOrder.projectId, workOrderId: workOrder._id, workOrderNo: workOrder.workOrderNo,
    vendorCode: workOrder.vendorCode, vendorName: workOrder.vendorName, user: req.user,
  });

  success(res, { workOrder }, 'Approved — forwarded for final approval');
});

// Stage 4 — Final (CEO/Owner) approval completes the chain. Also locks the work
// order via the existing isLocked mechanism — same fields, same owner-only
// unlock endpoint that already existed before this workflow was built.
exports.finalApprove = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.approvalStatus !== 'pending-final') {
    return badRequest(res, `Cannot give final approval to a work order with approval status '${workOrder.approvalStatus}'`);
  }
  workOrder.approvalStatus = 'approved';
  workOrder.finalApprovedBy = req.user._id;
  workOrder.finalApprovedAt = new Date();
  workOrder.finalRemarks = req.body.remarks || '';
  workOrder.approvalHistory.push({ stage: 'final', action: 'approved', by: req.user._id, remarks: workOrder.finalRemarks });
  workOrder.isLocked = true;
  workOrder.lockedBy = req.user._id;
  workOrder.lockedAt = new Date();
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Final approval granted for work order ${workOrder.workOrderNo} — locked, ready for Work Progress`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  emitEvent('WORK_ORDER_FINAL_APPROVED', {
    projectId: workOrder.projectId, workOrderId: workOrder._id, workOrderNo: workOrder.workOrderNo,
    vendorCode: workOrder.vendorCode, vendorName: workOrder.vendorName, user: req.user,
  });

  success(res, { workOrder }, 'Final approval granted — work order locked and ready for Work Progress');
});

// Available at any of the 3 review stages — always returns to the maker (L1),
// never just "one level back", per how this system's segregation is designed.
exports.sendBack = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return badRequest(res, 'A reason is required to send a work order back');

  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  const stageAtRejection = { 'pending-checker': 'checker', 'pending-approver': 'approver', 'pending-final': 'final' }[workOrder.approvalStatus];
  if (!stageAtRejection) {
    return badRequest(res, `Cannot send back a work order with approval status '${workOrder.approvalStatus}'`);
  }
  workOrder.approvalStatus = 'sent-back';
  workOrder.approvalHistory.push({ stage: stageAtRejection, action: 'sent-back', by: req.user._id, remarks: reason.trim() });
  await workOrder.save();

  await logAudit({
    action: 'REJECT', module: 'work-orders', user: req.user,
    description: `Sent work order ${workOrder.workOrderNo} back to maker — ${reason.trim()}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  emitEvent('WORK_ORDER_SENT_BACK', {
    projectId: workOrder.projectId, workOrderId: workOrder._id, workOrderNo: workOrder.workOrderNo,
    vendorCode: workOrder.vendorCode, vendorName: workOrder.vendorName, user: req.user,
    metadata: { reason: reason.trim() },
  });

  success(res, { workOrder }, 'Sent back to maker');
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

exports.lockWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.isLocked) return badRequest(res, 'Work order is already locked');

  workOrder.isLocked = true;
  workOrder.lockedBy  = req.user._id;
  workOrder.lockedAt  = new Date();
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Locked work order ${workOrder.workOrderNo} — rates and terms can no longer be edited`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
    changes: { isLocked: { from: false, to: true } },
  });

  success(res, { workOrder }, 'Work order locked');
});

exports.unlockWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (!workOrder.isLocked) return badRequest(res, 'Work order is not locked');

  workOrder.isLocked = false;
  workOrder.lockedBy  = undefined;
  workOrder.lockedAt  = undefined;
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Unlocked work order ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
    changes: { isLocked: { from: true, to: false } },
  });

  success(res, { workOrder }, 'Work order unlocked');
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
  if (item.subItems && item.subItems.length > 0) {
    return badRequest(res, 'This item has particulars — add progress against the individual particular instead.');
  }

  const { date, qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote, plannedQty } = req.body;
  if (!qtyAdded || qtyAdded <= 0) {
    return badRequest(res, 'qtyAdded must be greater than 0');
  }

  // Allow setting planned qty at progress-entry time when it wasn't set on creation
  if (plannedQty !== undefined && Number(plannedQty) > 0) {
    item.plannedQty = Number(plannedQty);
  }

  // Progress is allowed to exceed plannedQty — never hard-blocked here. AGM/GM
  // see the overage flagged (yellow/red) on the Bill Review page and must sign
  // off on it before that item is billable.
  item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote });
  item.completedQty = item.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  item.status =
    item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0                                      ? 'running'
    :                                                               'pending';
  applyVarianceGate(item);

  await workOrder.save();

  emitEvent('PROGRESS_ADDED', {
    projectId:   workOrder.projectId,
    workOrderId: workOrder._id,
    workOrderNo: workOrder.workOrderNo,
    vendorCode:  workOrder.vendorCode,
    vendorName:  workOrder.vendorName,
    user:        req.user,
    remarks:     remarks || '',
    metadata:    {
      scopeItem: item.description, qtyAdded, unit: item.unit,
      plannedQty: item.plannedQty, completedQty: item.completedQty,
    },
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

  // Prevent reducing below already-billed quantity — the only remaining hard
  // cap; exceeding plannedQty itself is allowed (flagged for AGM/GM instead).
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
  item.status = item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(item);

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
  item.status = item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(item);

  await workOrder.save();
  success(res, { workOrder }, 'Progress entry deleted');
});

// ── Particular (sub-item) progress — same rules as a scope item's own progress,
// but scoped to one particular, with the parent item's status/completedQty then
// re-derived from all of its particulars.
exports.addSubItemProgress = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.status === 'cancelled') return badRequest(res, 'Cannot add progress to a cancelled work order');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const subItem = item.subItems.id(req.params.subItemId);
  if (!subItem) return notFound(res, 'Particular not found');

  const { date, qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote, plannedQty } = req.body;
  if (!qtyAdded || qtyAdded <= 0) return badRequest(res, 'qtyAdded must be greater than 0');

  if (plannedQty !== undefined && Number(plannedQty) > 0) {
    subItem.plannedQty = Number(plannedQty);
  }

  subItem.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote });
  subItem.completedQty = subItem.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  subItem.status =
    subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0                                            ? 'running'
    :                                                                       'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();

  emitEvent('PROGRESS_ADDED', {
    projectId:   workOrder.projectId,
    workOrderId: workOrder._id,
    workOrderNo: workOrder.workOrderNo,
    vendorCode:  workOrder.vendorCode,
    vendorName:  workOrder.vendorName,
    user:        req.user,
    remarks:     remarks || '',
    metadata:    {
      scopeItem: `${item.description} — ${subItem.description}`, qtyAdded, unit: subItem.unit,
      plannedQty: subItem.plannedQty, completedQty: subItem.completedQty,
    },
  });

  success(res, { workOrder });
});

exports.editSubItemProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, subItemId, progressId } = req.params;
  const { qtyAdded, date, remarks, tower, floor, flatNo, plotNo, locationNote } = req.body;

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const subItem = item.subItems.id(subItemId);
  if (!subItem) return notFound(res, 'Particular not found');

  const entry = subItem.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');

  if (!qtyAdded || qtyAdded <= 0) return badRequest(res, 'qtyAdded must be greater than 0');

  const otherTotal = subItem.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (otherTotal + qtyAdded < (subItem.lastBilledQty || 0)) {
    const minAllowed = (subItem.lastBilledQty || 0) - otherTotal;
    return badRequest(res, `Cannot reduce below billed quantity. Min allowed: ${minAllowed.toLocaleString()} ${subItem.unit}`);
  }

  entry.qtyAdded = qtyAdded;
  if (date) entry.date = new Date(date);
  if (remarks !== undefined) entry.remarks = remarks;
  if (tower        !== undefined) entry.tower        = tower;
  if (floor        !== undefined) entry.floor        = floor;
  if (flatNo       !== undefined) entry.flatNo       = flatNo;
  if (plotNo       !== undefined) entry.plotNo       = plotNo;
  if (locationNote !== undefined) entry.locationNote = locationNote;

  subItem.completedQty = subItem.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  subItem.status = subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();
  success(res, { workOrder }, 'Progress entry updated');
});

exports.deleteSubItemProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, subItemId, progressId } = req.params;

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const subItem = item.subItems.id(subItemId);
  if (!subItem) return notFound(res, 'Particular not found');

  const entry = subItem.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');

  const newCompletedQty = subItem.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (newCompletedQty < (subItem.lastBilledQty || 0)) {
    return badRequest(res, 'Cannot delete this entry — it covers work that has already been billed. Ask admin to reverse the bill first.');
  }

  subItem.progressEntries.pull(progressId);
  subItem.completedQty = subItem.progressEntries.reduce((s, e) => s + e.qtyAdded, 0);
  subItem.status = subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();
  success(res, { workOrder }, 'Progress entry deleted');
});

// AGM/GM sign off on a scope item's (or particular's) progress currently
// exceeding its planned quantity — required before that item can be selected
// into a bill request. See applyVarianceGate() for when this gets reset.
exports.approveScopeItemVariance = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');

  if (!(item.plannedQty > 0 && item.completedQty > item.plannedQty)) {
    return badRequest(res, 'This item has no unapproved variance');
  }

  item.varianceApproved = true;
  item.varianceApprovedBy = req.user._id;
  item.varianceApprovedAt = new Date();
  item.varianceApprovedAtQty = item.completedQty;
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Approved progress variance on ${item.description} for ${workOrder.workOrderNo} (${item.completedQty}/${item.plannedQty} ${item.unit})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Variance approved');
});

exports.approveSubItemVariance = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');

  const item = workOrder.scopeItems.id(req.params.itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const subItem = item.subItems.id(req.params.subItemId);
  if (!subItem) return notFound(res, 'Particular not found');

  if (!(subItem.plannedQty > 0 && subItem.completedQty > subItem.plannedQty)) {
    return badRequest(res, 'This particular has no unapproved variance');
  }

  subItem.varianceApproved = true;
  subItem.varianceApprovedBy = req.user._id;
  subItem.varianceApprovedAt = new Date();
  subItem.varianceApprovedAtQty = subItem.completedQty;
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Approved progress variance on ${item.description} — ${subItem.description} for ${workOrder.workOrderNo} (${subItem.completedQty}/${subItem.plannedQty} ${subItem.unit})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Variance approved');
});
