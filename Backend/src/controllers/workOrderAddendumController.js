// Add Scope ("addendum") on an approved work order.
//
// Further work for the same site + vendor + category goes onto the existing work order instead of a new
// one. An addendum carries NEW scope items only and travels the same checker → approver → final chain
// the work order itself did (2 levels skips the approver, per the department's woRequiredApprovals).
// While it is pending the work order stays approved and billable exactly as before: the new items are
// not in `scopeItems` yet, so nothing can be measured or billed against them. Final approval moves them
// into `scopeItems` and raises the contract value by their (pre-GST) amount.
const WorkOrder = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const { canActOnDepartment } = require('../utils/departmentAccess');
const { getWoApprovalConfig, woApproverAllowed } = require('../utils/woApprovalRules');
const { logAudit } = require('../utils/auditLog');

const OPEN_STATUSES = ['pending-checker', 'pending-approver', 'pending-final'];
const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function hasBoth(user, a, b) {
  if (user.role === 'owner' || user.role === 'CEO') return true;
  const actions = (user.permissions || []).find((p) => p.module === 'work-orders')?.actions || [];
  return actions.includes(a) && actions.includes(b);
}

function actor(user, action, stage, remarks) {
  return { stage, action, by: user._id, byName: user.name, byRole: user.role, remarks: remarks || '', at: new Date() };
}

async function loadWithAddendum(req, res) {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) { notFound(res, 'Work order not found'); return {}; }
  const addendum = workOrder.addenda.id(req.params.addendumId);
  if (!addendum) { notFound(res, 'Addendum not found'); return {}; }
  return { workOrder, addendum };
}

// POST /work-orders/:id/addenda — body { reason, items: [{ description, unit, plannedQty, rate, gstPercent, plannedStart, plannedEnd, remarks }] }
exports.createAddendum = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.id);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.status === 'cancelled') return badRequest(res, 'This work order is cancelled — scope cannot be added.');
  if (workOrder.approvalStatus !== 'approved') {
    return badRequest(res, 'Scope can only be added to an approved work order. Edit this one directly while it is still in approval.');
  }
  if (!canActOnDepartment(req.user, workOrder)) return forbidden(res, 'This work order belongs to a different department.');
  if (workOrder.addenda.some((a) => OPEN_STATUSES.includes(a.status))) {
    return badRequest(res, 'An earlier addition to this work order is still awaiting approval — finish or send it back first.');
  }

  const reason = String(req.body.reason || '').trim();
  if (!reason) return badRequest(res, 'A reason for the extra work is required.');
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (rawItems.length === 0) return badRequest(res, 'Add at least one work item.');
  if (rawItems.length > 50) return badRequest(res, 'Too many items in one addition (max 50).');

  const professional = workOrder.contractType === 'professional-services';
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const r = rawItems[i] || {};
    const description = String(r.description || '').trim();
    const plannedQty = Number(r.plannedQty);
    const rate = Number(r.rate);
    if (!description) return badRequest(res, `Item ${i + 1}: description is required`);
    if (!Number.isFinite(plannedQty) || plannedQty <= 0) return badRequest(res, `Item ${i + 1}: quantity must be greater than 0`);
    if (!Number.isFinite(rate) || rate < 0) return badRequest(res, `Item ${i + 1}: rate must be 0 or more`);
    if (!professional && (!r.plannedStart || !r.plannedEnd)) return badRequest(res, `Item ${i + 1}: start and end date are required`);
    items.push({
      description: description.slice(0, 300),
      remarks: String(r.remarks || '').trim().slice(0, 500),
      unit: String(r.unit || 'sq.ft').trim().slice(0, 30) || 'sq.ft',
      plannedQty, rate,
      amount: money2(plannedQty * rate),
      gstPercent: Number.isFinite(Number(r.gstPercent)) ? Number(r.gstPercent) : (workOrder.gstPercent ?? 18),
      plannedStart: r.plannedStart ? String(r.plannedStart) : undefined,
      plannedEnd: r.plannedEnd ? String(r.plannedEnd) : undefined,
    });
  }

  const no = (workOrder.addenda.reduce((m, a) => Math.max(m, a.no || 0), 0)) + 1;
  workOrder.addenda.push({
    no, reason, items,
    amount: money2(items.reduce((s, it) => s + it.amount, 0)),
    status: 'pending-checker',
    createdBy: req.user._id, createdByName: req.user.name,
    makerBy: req.user._id,
    history: [actor(req.user, 'submitted', 'maker', reason)],
  });
  await workOrder.save();

  const addendum = workOrder.addenda[workOrder.addenda.length - 1];
  await logAudit({
    action: 'CREATE', module: 'work-orders', user: req.user,
    description: `Added scope (Addendum ${no}, ₹${addendum.amount.toLocaleString('en-IN')}) to ${workOrder.workOrderNo} — sent for checker review: ${reason}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  created(res, { workOrder, addendum }, `Addendum ${no} submitted — awaiting checker review`);
});

exports.addendumCheckerApprove = asyncHandler(async (req, res) => {
  const { workOrder, addendum } = await loadWithAddendum(req, res);
  if (!addendum) return;
  if (addendum.status !== 'pending-checker') return badRequest(res, `Cannot check an addendum that is '${addendum.status}'`);
  if (addendum.makerBy && String(addendum.makerBy) === String(req.user._id) && !hasBoth(req.user, 'maker', 'checker')) {
    return badRequest(res, 'The person who added this scope cannot also give checker sign-off — a different approver is needed.');
  }
  if (!canActOnDepartment(req.user, workOrder)) return forbidden(res, 'This work order belongs to a different department.');
  const config = await getWoApprovalConfig(workOrder);
  if (!woApproverAllowed(req.user, config, 'checker')) return forbidden(res, "You're not configured as the checker for this department's work orders.");

  const levels = config?.woRequiredApprovals ?? 3;
  addendum.status = levels <= 2 ? 'pending-final' : 'pending-approver';
  addendum.checkerBy = req.user._id;
  addendum.history.push(actor(req.user, 'approved', 'checker', req.body.remarks));
  await workOrder.save();
  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Checker approved Addendum ${addendum.no} of ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  success(res, { workOrder, addendum }, levels <= 2 ? 'Checked — forwarded for final approval' : 'Checked — forwarded to approver');
});

exports.addendumApproverApprove = asyncHandler(async (req, res) => {
  const { workOrder, addendum } = await loadWithAddendum(req, res);
  if (!addendum) return;
  if (addendum.status !== 'pending-approver') return badRequest(res, `Cannot approve an addendum that is '${addendum.status}'`);
  if (addendum.checkerBy && String(addendum.checkerBy) === String(req.user._id) && !hasBoth(req.user, 'checker', 'approver')) {
    return badRequest(res, 'The checker cannot also give approver sign-off — a different approver is needed.');
  }
  if (!canActOnDepartment(req.user, workOrder)) return forbidden(res, 'This work order belongs to a different department.');
  const config = await getWoApprovalConfig(workOrder);
  if (!woApproverAllowed(req.user, config, 'approver')) return forbidden(res, "You're not configured as the approver for this department's work orders.");

  addendum.status = 'pending-final';
  addendum.approverBy = req.user._id;
  addendum.history.push(actor(req.user, 'approved', 'approver', req.body.remarks));
  await workOrder.save();
  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Approver approved Addendum ${addendum.no} of ${workOrder.workOrderNo}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  success(res, { workOrder, addendum }, 'Approved — forwarded for final approval');
});

exports.addendumFinalApprove = asyncHandler(async (req, res) => {
  const { workOrder, addendum } = await loadWithAddendum(req, res);
  if (!addendum) return;
  if (addendum.status !== 'pending-final') return badRequest(res, `Cannot give final approval to an addendum that is '${addendum.status}'`);
  const previous = addendum.approverBy || addendum.checkerBy;
  const previousAction = addendum.approverBy ? 'approver' : 'checker';
  if (previous && String(previous) === String(req.user._id) && !hasBoth(req.user, previousAction, 'ceo-approve')) {
    return badRequest(res, 'The previous approver cannot also give final approval — a different approver is needed.');
  }
  if (!canActOnDepartment(req.user, workOrder)) return forbidden(res, 'This work order belongs to a different department.');
  const config = await getWoApprovalConfig(workOrder);
  if (!woApproverAllowed(req.user, config, 'final')) return forbidden(res, "You're not configured as the final approver for this department's work orders.");

  // The new items join the scope and the contract value rises by their amount (pre-GST, same basis the
  // work order's contract value is entered on). The work order itself stays approved and locked.
  const contractBefore = Number(workOrder.contractValue) || 0;
  for (const it of addendum.items) {
    workOrder.scopeItems.push({
      description: it.description, remarks: it.remarks, unit: it.unit, plannedQty: it.plannedQty, rate: it.rate,
      amount: it.amount, gstPercent: it.gstPercent, plannedStart: it.plannedStart, plannedEnd: it.plannedEnd,
    });
  }
  workOrder.contractValue = money2(contractBefore + addendum.amount);
  addendum.status = 'approved';
  addendum.finalBy = req.user._id;
  addendum.approvedAt = new Date();
  addendum.contractBefore = contractBefore;
  addendum.contractAfter = workOrder.contractValue;
  addendum.history.push(actor(req.user, 'approved', 'final', req.body.remarks));
  await workOrder.save();

  await logAudit({
    action: 'APPROVE', module: 'work-orders', user: req.user,
    description: `Final approval on Addendum ${addendum.no} of ${workOrder.workOrderNo} — ${addendum.items.length} item${addendum.items.length !== 1 ? 's' : ''} added, contract value ₹${contractBefore.toLocaleString('en-IN')} → ₹${workOrder.contractValue.toLocaleString('en-IN')}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  success(res, { workOrder, addendum }, 'Final approval granted — new items added to the work order');
});

exports.addendumSendBack = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return badRequest(res, 'A reason is required to send this back');
  const { workOrder, addendum } = await loadWithAddendum(req, res);
  if (!addendum) return;
  const stage = { 'pending-checker': 'checker', 'pending-approver': 'approver', 'pending-final': 'final' }[addendum.status];
  if (!stage) return badRequest(res, `Cannot send back an addendum that is '${addendum.status}'`);
  if (!canActOnDepartment(req.user, workOrder)) return forbidden(res, 'This work order belongs to a different department.');

  addendum.status = 'sent-back';
  addendum.history.push(actor(req.user, 'sent-back', stage, reason));
  await workOrder.save();
  await logAudit({
    action: 'REJECT', module: 'work-orders', user: req.user,
    description: `Sent Addendum ${addendum.no} of ${workOrder.workOrderNo} back — ${reason}`,
    entityType: 'WorkOrder', entityId: workOrder._id, entityLabel: workOrder.workOrderNo,
  });
  success(res, { workOrder, addendum }, 'Sent back — the work order itself is unaffected');
});
