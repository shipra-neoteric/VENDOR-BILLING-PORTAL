const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const WorkOrder    = require('../models/WorkOrder');
const Contractor   = require('../models/Contractor');
const Consultant   = require('../models/Consultant');
const Project      = require('../models/Project');
const Company      = require('../models/Company');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextWorkOrderNo, nextConsultancyOrderNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');
const { startInstance, advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { milestonesExceedContract } = require('../utils/validateMilestones');
const { documentsExceedLimit } = require('../utils/validateDocuments');
const { logAudit, diffFields } = require('../utils/auditLog');
const { sumActiveQty, applyVarianceGate, recomputeParentFromSubItems } = require('../utils/progressHelpers');

// vendorName/ownerName/mobile are snapshotted onto a WO at creation time, but
// address/GST/PAN/bank details never were — both listWorkOrders and
// getWorkOrder attach them fresh from the Contractor (or Consultant, for
// professional-services WOs) so every screen that shows this work order can
// display current contact + bank info without a second round-trip.
const BANK_DETAIL_FIELDS = 'address email gstNumber panNumber accountHolderName bankName accountNumber ifscCode branchName';
function toContractorDetails(party) {
  if (!party) return undefined;
  return {
    address: party.address || '', email: party.email || '',
    gstNumber: party.gstNumber || '', panNumber: party.panNumber || '',
    accountHolderName: party.accountHolderName || '', bankName: party.bankName || '',
    accountNumber: party.accountNumber || '', ifscCode: party.ifscCode || '', branchName: party.branchName || '',
  };
}

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

// recomputeParentFromSubItems / applyVarianceGate / sumActiveQty now live in
// ../utils/progressHelpers — shared with billController.js/billRequestController.js,
// which need the same recompute when auto-invalidating entries on bill rejection.

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// A brand-new scope item (just typed into the form, never saved before) only
// has the frontend's own temporary draft id (crypto.randomUUID()) at submit
// time — not a real Mongo ObjectId, since that's only assigned once this
// document is actually created. A Payment Milestone's own `scopeItemIds`
// field is a real ObjectId though (see paymentMilestoneSchema), so a
// milestone covering a brand-new scope item would otherwise send that
// temporary id straight through and fail Mongoose's cast.
//
// This pre-assigns a real ObjectId to every scope item whose incoming id
// isn't already one (mutating `scopeItems` in place so WorkOrder.create/
// findByIdAndUpdate persists that exact _id), and rewrites every milestone's
// scopeItemIds from the old temporary id to that new real one. An id that's
// already a valid ObjectId (an existing, previously-saved scope item) is
// left untouched — it already matches what's in the database.
function resolveScopeItemIdsForMilestones(scopeItems, paymentMilestones) {
  const idMap = new Map();
  for (const si of scopeItems || []) {
    if (si && si.id && !OBJECT_ID_RE.test(String(si.id))) {
      const newId = new mongoose.Types.ObjectId();
      idMap.set(String(si.id), newId);
      si._id = newId;
    }
  }
  for (const pm of paymentMilestones || []) {
    if (Array.isArray(pm.scopeItemIds)) {
      pm.scopeItemIds = pm.scopeItemIds
        .map((id) => (idMap.has(String(id)) ? idMap.get(String(id)) : (OBJECT_ID_RE.test(String(id)) ? id : null)))
        .filter(Boolean);
    }
  }
}

// Normalized signatures for the two things that actually define what an
// already-approved work order was approved on — Scope of Work and Payment
// Milestones. Only picking the contractual fields (never progressEntries/
// completedQty/lastBilledQty/status/varianceApproved*, which change on their
// own via day-to-day progress logging, not an edit) so those don't cause a
// false "this needs re-approval" trigger.
function scopeItemsSignature(items) {
  return JSON.stringify((items || []).map(si => ({
    description: si.description, remarks: si.remarks, unit: si.unit,
    plannedQty: si.plannedQty, rate: si.rate, amount: si.amount, gstPercent: si.gstPercent,
    plannedStart: si.plannedStart, plannedEnd: si.plannedEnd,
    subItems: (si.subItems || []).map(sub => ({
      description: sub.description, remarks: sub.remarks, unit: sub.unit,
      plannedQty: sub.plannedQty, rate: sub.rate, amount: sub.amount,
    })),
  })));
}
function paymentMilestonesSignature(milestones) {
  return JSON.stringify((milestones || []).map(m => ({
    stage: m.stage, date: m.date, type: m.type, mode: m.mode, amount: m.amount,
    amountMode: m.amountMode, amountPercent: m.amountPercent,
    gstPercent: m.gstPercent, gstType: m.gstType, payable: m.payable,
  })));
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
    .populate('assignedDRI', 'name email mobile')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  // Batched version of the same live lookup getWorkOrder does for a single
  // WO — one query per party type across the whole list, not one per WO.
  const contractorCodes = [...new Set(workOrders.filter(w => w.contractType !== 'professional-services' && w.vendorCode).map(w => w.vendorCode))];
  const consultantCodes = [...new Set(workOrders.filter(w => w.contractType === 'professional-services' && w.vendorCode).map(w => w.vendorCode))];
  const [contractors, consultants] = await Promise.all([
    contractorCodes.length ? Contractor.find({ vendorCode: { $in: contractorCodes } }).select(`vendorCode ${BANK_DETAIL_FIELDS}`).lean() : [],
    consultantCodes.length ? Consultant.find({ consultantCode: { $in: consultantCodes } }).select(`consultantCode ${BANK_DETAIL_FIELDS}`).lean() : [],
  ]);
  const contractorMap = new Map(contractors.map(c => [c.vendorCode, c]));
  const consultantMap = new Map(consultants.map(c => [c.consultantCode, c]));
  workOrders.forEach(w => {
    const party = w.contractType === 'professional-services' ? consultantMap.get(w.vendorCode) : contractorMap.get(w.vendorCode);
    const details = toContractorDetails(party);
    if (details) w.contractorDetails = details;
  });

  success(res, { workOrders });
});

exports.getWorkOrder = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id)
    .populate('projectId', 'code name projectType')
    .populate('createdBy', 'name email')
    .populate('assignedDRI', 'name email mobile')
    .populate('scopeItems.progressEntries.enteredBy', 'name')
    .populate('scopeItems.progressEntries.invalidated.by', 'name')
    .populate('scopeItems.subItems.progressEntries.enteredBy', 'name')
    .populate('scopeItems.subItems.progressEntries.invalidated.by', 'name')
    .lean();
  if (!workOrder) return notFound(res, 'Work order not found');

  // vendorName/ownerName/mobile are snapshotted onto the WO itself at creation
  // time, but address/GST/PAN/bank details never were — fetch them fresh from
  // the Contractor (or Consultant, for professional-services WOs) by vendorCode
  // so the detail view can show current contact + bank info without a second
  // round-trip from the frontend.
  if (workOrder.vendorCode) {
    const Party = workOrder.contractType === 'professional-services' ? Consultant : Contractor;
    const codeField = workOrder.contractType === 'professional-services' ? 'consultantCode' : 'vendorCode';
    const party = await Party.findOne({ [codeField]: workOrder.vendorCode }).select(BANK_DETAIL_FIELDS).lean();
    const details = toContractorDetails(party);
    if (details) workOrder.contractorDetails = details;
  }

  success(res, { workOrder });
});

exports.createWorkOrder = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  resolveScopeItemIdsForMilestones(req.body.scopeItems, req.body.paymentMilestones);

  if (milestonesExceedContract(req.body)) {
    return badRequest(res, "Payment milestones total exceeds the work order's contract value (incl. GST)");
  }

  const docCheck = documentsExceedLimit(req.body.documents);
  if (docCheck.exceeds) return badRequest(res, docCheck.reason);

  const project = await Project.findById(req.body.projectId);
  if (!project) return notFound(res, 'Project not found');

  // Professional-services WOs resolve their party against Consultant instead
  // of Contractor — vendorCode doubles as the lookup key into either
  // collection (CN-/VC- prefixes never collide).
  const isProfessionalServices = req.body.contractType === 'professional-services';
  const party = isProfessionalServices
    ? await Consultant.findOne({ consultantCode: req.body.vendorCode })
    : await Contractor.findOne({ vendorCode: req.body.vendorCode });
  if (!party) {
    return notFound(res, isProfessionalServices
      ? 'Consultant not found for this consultant code'
      : 'Contractor not found for this vendor code');
  }

  let workOrderNo = (req.body.workOrderNo || '').trim();
  if (workOrderNo) {
    const duplicate = await WorkOrder.findOne({ workOrderNo });
    if (duplicate) return conflict(res, `Work order number ${workOrderNo} already exists`);
  } else {
    workOrderNo = isProfessionalServices ? await nextConsultancyOrderNo() : await nextWorkOrderNo();
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
    vendorName:  isProfessionalServices ? party.firmName : party.companyName,
    ownerName:   isProfessionalServices ? party.principalName : party.ownerName,
    mobile:      party.mobile,
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

  await logAudit({
    action: 'CREATE', module: 'work-orders', user: req.user,
    description: `Work order ${workOrder.workOrderNo} created`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  created(res, { workOrder }, 'Work order created successfully');
});

exports.updateWorkOrder = asyncHandler(async (req, res) => {
  const { workOrderNo: _wo, ...updateData } = req.body;

  if (updateData.scopeItems) {
    resolveScopeItemIdsForMilestones(updateData.scopeItems, updateData.paymentMilestones);
  }

  if (updateData.paymentMilestones && milestonesExceedContract(updateData)) {
    return badRequest(res, "Payment milestones total exceeds the work order's contract value (incl. GST)");
  }

  const docCheck = documentsExceedLimit(updateData.documents);
  if (docCheck.exceeds) return badRequest(res, docCheck.reason);

  // companyName is denormalized off companyId (same as createWorkOrder does) —
  // without this, editing the Issuing Company dropdown saved the id but never
  // refreshed the display name, so it kept showing blank everywhere the name
  // is what's actually rendered (PDF, WO detail view).
  if ('companyId' in updateData) {
    if (updateData.companyId) {
      const co = await Company.findById(updateData.companyId).select('name');
      updateData.companyName = co ? co.name : '';
    } else {
      updateData.companyName = '';
    }
  }

  const before = await WorkOrder.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Work order not found');
  if (before.isLocked) return badRequest(res, 'This work order is locked and cannot be edited. Unlock it first.');

  // Editing a work order mid-chain (pending-checker/approver/final) or after
  // it already cleared the full chain (only possible once Owner has unlocked
  // it) sends it back through the chain from scratch — but only when the edit
  // actually touches Scope of Work or Payment Milestones, the two things the
  // approval was actually granted on. Everything else (vendor/company details,
  // GST/retention %, dates, remarks, documents) can be corrected at any stage,
  // mid-review included, without disrupting whoever's currently reviewing it.
  const MID_CYCLE_STATUSES = ['pending-checker', 'pending-approver', 'pending-final'];
  const newScopeItems = updateData.scopeItems !== undefined ? updateData.scopeItems : before.scopeItems;
  const newMilestones = updateData.paymentMilestones !== undefined ? updateData.paymentMilestones : before.paymentMilestones;
  const approvalCriticalChanged =
    scopeItemsSignature(before.scopeItems) !== scopeItemsSignature(newScopeItems) ||
    paymentMilestonesSignature(before.paymentMilestones) !== paymentMilestonesSignature(newMilestones);

  const wasMidCycle = MID_CYCLE_STATUSES.includes(before.approvalStatus);
  const reopening = (before.approvalStatus === 'approved' || wasMidCycle) && approvalCriticalChanged;
  if (reopening) updateData.approvalStatus = 'draft';

  const mongoUpdate = reopening
    ? { $set: updateData, $push: { approvalHistory: {
        stage: 'maker', action: 'reopened', by: req.user._id,
        byName: req.user.name, byRole: req.user.role,
        remarks: wasMidCycle
          ? `Scope of Work / Payment Milestones edited while ${before.approvalStatus.replace('pending-', 'pending ')} — sent back through the full approval chain.`
          : 'Scope of Work / Payment Milestones edited after approval — sent back through the full approval chain.',
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

  // Keep already-generated bills/bill-requests in sync when work order header details change
  // (company, vendor, category, project/location) — ensuring changing these non-approval fields
  // reflects everywhere in the system, including pre-existing bills and bill requests.
  const projectChanged = String(before.projectId || '') !== String(after.projectId || '');
  const locationChanged = (before.projectLocation || '') !== (after.projectLocation || '');
  const companyChanged = (before.companyName || '') !== (after.companyName || '');
  const vendorChanged = (before.vendorCode || '') !== (after.vendorCode || '') || (before.vendorName || '') !== (after.vendorName || '');
  const categoryChanged = (before.category || '') !== (after.category || '') || (before.subCategory || '') !== (after.subCategory || '');

  if (projectChanged || locationChanged || companyChanged || vendorChanged || categoryChanged) {
    const syncUpdate = {};
    if (projectChanged || locationChanged) {
      syncUpdate.projectId = after.projectId;
      syncUpdate.projectName = after.projectName;
      syncUpdate.projectLocation = after.projectLocation;
    }
    if (companyChanged) {
      syncUpdate.companyName = after.companyName;
    }
    if (vendorChanged) {
      syncUpdate.vendorCode = after.vendorCode;
      syncUpdate.vendorName = after.vendorName;
    }
    if (categoryChanged) {
      syncUpdate.category = after.category;
      syncUpdate.subCategory = after.subCategory;
    }

    const brUpdate = { ...syncUpdate };
    const rbUpdate = { ...syncUpdate };
    delete rbUpdate.category;
    delete rbUpdate.subCategory;

    const [brResult, rbResult] = await Promise.all([
      BillRequest.updateMany({ workOrderId: workOrder._id }, brUpdate),
      RunningBill.updateMany({ workOrderId: workOrder._id }, rbUpdate),
    ]);
    const totalSynced = (brResult.modifiedCount || 0) + (rbResult.modifiedCount || 0);
    if (totalSynced > 0) {
      const changedDesc = [];
      if (companyChanged) changedDesc.push(`company (${before.companyName || '—'} → ${after.companyName || '—'})`);
      if (projectChanged || locationChanged) changedDesc.push(`project/location (${before.projectName || '—'} → ${after.projectName || '—'})`);
      if (vendorChanged) changedDesc.push(`vendor (${before.vendorCode || '—'} → ${after.vendorCode || '—'})`);
      if (categoryChanged) changedDesc.push(`category (${before.category || '—'} → ${after.category || '—'})`);

      await logAudit({
        action: 'UPDATE', module: 'work-orders', user: req.user,
        description: `Synced updated ${changedDesc.join(', ')} to ${totalSynced} existing bill(s)/request(s) for ${workOrder.workOrderNo}`,
        entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
      });
    }
  }

  if (reopening) {
    // Whatever SLA instance was tracking the old cycle (sitting in-progress
    // at L2/L3/L4, or already completed if this WO was fully approved) is
    // now stale — close it out so the next submitWorkOrder starts a clean
    // one at L1 instead of resuming/advancing the wrong stage.
    await cancelInstance('WorkOrder', workOrder._id, 'Reopened for editing — approval chain reset to L1');

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
  workOrder.approvalHistory.push({ stage: 'maker', action: 'submitted', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: req.body.remarks || '' });
  await workOrder.save();

  // The first submit advances the instance startInstance already created at
  // creation time (L1 -> L2). A re-submit after sendBack has no in-progress
  // instance left (sendBack cancels it) — startInstance's own findOne no-ops
  // into a fresh one there, then this same advanceInstance moves it straight
  // to L2, so a corrected resubmission gets its own clean SLA clock.
  await startInstance('WorkOrder', workOrder._id, workOrder.workOrderNo, req.user._id, {
    projectId: workOrder.projectId, projectName: workOrder.projectName,
    vendorName: workOrder.vendorName, amount: workOrder.contractValue,
  });
  await advanceInstance('WorkOrder', workOrder._id, req.user._id, 'Maker submitted for checker review');

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
  workOrder.approvalHistory.push({ stage: 'checker', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: workOrder.checkerRemarks });
  await workOrder.save();

  await advanceInstance('WorkOrder', workOrder._id, req.user._id, 'Checker approved — forwarded to approver');

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
  workOrder.approvalHistory.push({ stage: 'approver', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: workOrder.approverRemarks });
  await workOrder.save();

  await advanceInstance('WorkOrder', workOrder._id, req.user._id, 'Approver approved — forwarded for final approval');

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
  workOrder.approvalHistory.push({ stage: 'final', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: workOrder.finalRemarks });
  workOrder.isLocked = true;
  workOrder.lockedBy = req.user._id;
  workOrder.lockedAt = new Date();
  await workOrder.save();

  await advanceInstance('WorkOrder', workOrder._id, req.user._id, 'Final approval granted');

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
  workOrder.approvalHistory.push({ stage: stageAtRejection, action: 'sent-back', by: req.user._id, byName: req.user.name, byRole: req.user.role, remarks: reason.trim() });
  await workOrder.save();

  await cancelInstance('WorkOrder', workOrder._id, `Sent back to maker: ${reason.trim()}`);

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

  await cancelInstance('WorkOrder', workOrder._id, `Work order cancelled: ${remark.trim()}`);

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
  item.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote, enteredBy: req.user._id });
  item.completedQty = sumActiveQty(item.progressEntries);
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

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry added for scope item "${item.description}" (${workOrder.workOrderNo}) — ${qtyAdded} ${item.unit}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
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

  if (entry.invalidated?.done) return badRequest(res, 'This entry has been invalidated and is read-only.');
  if (entry.billedInRequestId) return badRequest(res, 'This entry is attached to a bill and cannot be edited — invalidate it instead (once that bill is rejected) or ask admin to reject the bill first.');
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

  item.completedQty = sumActiveQty(item.progressEntries);
  item.status = item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(item);

  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry edited for scope item "${item.description}" (${workOrder.workOrderNo})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

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

  if (entry.invalidated?.done) return badRequest(res, 'This entry has been invalidated and is read-only.');
  if (entry.billedInRequestId) return badRequest(res, 'This entry is attached to a bill and cannot be deleted — invalidate it instead (once that bill is rejected) or ask admin to reject the bill first.');

  // Prevent deleting an entry if doing so would reduce completedQty below lastBilledQty
  const newCompletedQty = item.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (newCompletedQty < (item.lastBilledQty || 0)) {
    return badRequest(res, 'Cannot delete this entry — it covers work that has already been billed. Ask admin to reverse the bill first.');
  }

  item.progressEntries.pull(progressId);
  item.completedQty = sumActiveQty(item.progressEntries);
  item.status = item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(item);

  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry deleted for scope item "${item.description}" (${workOrder.workOrderNo})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Progress entry deleted');
});

// Marks a progress entry as wrong data (kept visible for audit, but excluded
// from completedQty and future billing) — the recourse when a bill made from
// it gets rejected for bad data (not just bad bundling), since the entry
// can't simply be edited/deleted once a bill has touched it.
exports.invalidateProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, progressId } = req.params;
  const { reason } = req.body;
  if (!reason || !reason.trim()) return badRequest(res, 'A reason is required to invalidate a progress entry');

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');
  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const entry = item.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');
  if (entry.invalidated?.done) return badRequest(res, 'This entry is already invalidated');

  entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason: reason.trim() };
  entry.billedInRequestId = null;

  item.completedQty = sumActiveQty(item.progressEntries);
  item.status = item.plannedQty > 0 && item.completedQty >= item.plannedQty ? 'completed'
    : item.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(item);

  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Invalidated a progress entry on "${item.description}" (${workOrder.workOrderNo}) — ${reason.trim()}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Progress entry invalidated');
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

  subItem.progressEntries.push({ date: date || new Date(), qtyAdded, remarks, tower, floor, flatNo, plotNo, locationNote, enteredBy: req.user._id });
  subItem.completedQty = sumActiveQty(subItem.progressEntries);
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

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry added for particular "${item.description} — ${subItem.description}" (${workOrder.workOrderNo}) — ${qtyAdded} ${subItem.unit}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
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

  if (entry.invalidated?.done) return badRequest(res, 'This entry has been invalidated and is read-only.');
  if (entry.billedInRequestId) return badRequest(res, 'This entry is attached to a bill and cannot be edited — invalidate it instead (once that bill is rejected) or ask admin to reject the bill first.');
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

  subItem.completedQty = sumActiveQty(subItem.progressEntries);
  subItem.status = subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry edited for particular "${item.description} — ${subItem.description}" (${workOrder.workOrderNo})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

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

  if (entry.invalidated?.done) return badRequest(res, 'This entry has been invalidated and is read-only.');
  if (entry.billedInRequestId) return badRequest(res, 'This entry is attached to a bill and cannot be deleted — invalidate it instead (once that bill is rejected) or ask admin to reject the bill first.');

  const newCompletedQty = subItem.progressEntries
    .filter(e => String(e._id) !== String(progressId))
    .reduce((s, e) => s + e.qtyAdded, 0);

  if (newCompletedQty < (subItem.lastBilledQty || 0)) {
    return badRequest(res, 'Cannot delete this entry — it covers work that has already been billed. Ask admin to reverse the bill first.');
  }

  subItem.progressEntries.pull(progressId);
  subItem.completedQty = sumActiveQty(subItem.progressEntries);
  subItem.status = subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Progress entry deleted for particular "${item.description} — ${subItem.description}" (${workOrder.workOrderNo})`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Progress entry deleted');
});

// Sub-item equivalent of invalidateProgressEntry — see that function for rationale.
exports.invalidateSubItemProgressEntry = asyncHandler(async (req, res) => {
  const { id, itemId, subItemId, progressId } = req.params;
  const { reason } = req.body;
  if (!reason || !reason.trim()) return badRequest(res, 'A reason is required to invalidate a progress entry');

  const workOrder = await WorkOrder.findById(id);
  if (!workOrder) return notFound(res, 'Work order not found');
  const item = workOrder.scopeItems.id(itemId);
  if (!item) return notFound(res, 'Scope item not found');
  const subItem = item.subItems.id(subItemId);
  if (!subItem) return notFound(res, 'Particular not found');
  const entry = subItem.progressEntries.id(progressId);
  if (!entry) return notFound(res, 'Progress entry not found');
  if (entry.invalidated?.done) return badRequest(res, 'This entry is already invalidated');

  entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason: reason.trim() };
  entry.billedInRequestId = null;

  subItem.completedQty = sumActiveQty(subItem.progressEntries);
  subItem.status = subItem.plannedQty > 0 && subItem.completedQty >= subItem.plannedQty ? 'completed'
    : subItem.completedQty > 0 ? 'running' : 'pending';
  applyVarianceGate(subItem);

  recomputeParentFromSubItems(item);
  await workOrder.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Invalidated a progress entry on "${item.description} — ${subItem.description}" (${workOrder.workOrderNo}) — ${reason.trim()}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });

  success(res, { workOrder }, 'Progress entry invalidated');
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
