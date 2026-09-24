// Aggregator for the "MD/CEO Approvals" screen — surfaces the final
// pending-action item (tab=pending), plus the already-decided history
// (tab=approved / tab=rejected) across every approval chain in the system
// (WorkOrder's 4-level chain, BillRequest's pre-chain, RunningBill's manual
// chain, and RunningBill's main Accounts chain) in one list, filtered down
// to only what THIS requesting user is actually authorized to see.
//
// This file only reads and re-uses the existing, unmodified authorization
// functions each real handler already uses (woApproverAllowed/approverAllowed/
// can/canActOnDepartment) — it never invents a new access rule, and every
// action a user takes from this screen still goes through the real,
// unmodified per-system routes (final-approve/l4-approve/manual-l4-approve/
// l2-director-approve, and their reject/send-back counterparts).
//
// Exact history stage/action strings used below were read directly off the
// real handlers, not guessed:
//   WorkOrder.finalApprove       (workOrderController.js:703) → stage:'final',        action:'approved'
//   WorkOrder.sendBack           (workOrderController.js:740-745) → from 'pending-final' → stage:'final', action:'sent-back'
//   BillRequest.l4Approve        (billRequestController.js:753) → stage:'l4',          action:'approved'
//   BillRequest.reject           (billRequestController.js:767-825) → from 'pending-l4' → stage:'l4', action:'rejected'
//   RunningBill.manualL4Approve  (billController.js:1017) → stage:'manual-l4',         action:'approved'
//   RunningBill.manualReject     (billController.js:1035-1098) → from 'pending-l4' → stage:'manual-l4', action:'rejected'
//   RunningBill.l2DirectorApprove(billController.js:1161) → stage:'l2-director',        action:'approved'
//   RunningBill.rejectBill       (billController.js:1403-1515) → REJECT_TARGET['l1-approved'].actions[0] = 'l1-agm-approve' → stage:'l1-agm-approve', action:'sent-back'
const asyncHandler = require('../utils/asyncHandler');
const { success, forbidden, notFound, badRequest } = require('../utils/responseFormatter');
const { can } = require('../middleware/auth');
const { canActOnDepartment } = require('../utils/departmentAccess');
const { getApprovalConfig, approverAllowed } = require('../utils/approvalRules');
const { getWoApprovalConfig, woApproverAllowed } = require('../utils/woApprovalRules');

const WorkOrder   = require('../models/WorkOrder');
const BillRequest = require('../models/BillRequest');
const RunningBill = require('../models/RunningBill');

const DAY_MS = 86400000;
const dayFloor = (from, to) => Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS));

// Exact stage/action pair each source's decided-history entry carries, per
// decision bucket — read off the real handlers (see header comment above).
const DECIDED_MARKERS = {
  WorkOrder: {
    approved: { stage: 'final', action: 'approved' },
    rejected: { stage: 'final', action: 'sent-back' },
  },
  BillRequest: {
    approved: { stage: 'l4', action: 'approved' },
    rejected: { stage: 'l4', action: 'rejected' },
  },
  'RunningBill-Manual': {
    approved: { stage: 'manual-l4', action: 'approved' },
    rejected: { stage: 'manual-l4', action: 'rejected' },
  },
  'RunningBill-Accounts': {
    approved: { stage: 'l2-director', action: 'approved' },
    rejected: { stage: 'l1-agm-approve', action: 'sent-back' },
  },
};

// The history entries already snapshot byName/byRole at the moment the
// decision was made (see each model's approvalHistory schema comment) — no
// separate User lookup/populate is needed to resolve "decided by" to a name.
function lastMatchingHistoryEntry(history, stage, action) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].stage === stage && history[i].action === action) return history[i];
  }
  return null;
}

function departmentOf(doc) {
  return doc.department === 'custom' ? (doc.customDepartment || '') : (doc.department || '');
}

async function buildPendingItems(user) {
  const [workOrders, billRequests, manualBills, accountsBills] = await Promise.all([
    // status !== 'cancelled' — approvalStatus and status are independent
    // fields; a WO can be cancelled (e.g. "Duplicate work order") without
    // its approvalStatus ever being advanced past 'pending-final', which
    // would otherwise leave it stuck showing as a live pending approval.
    WorkOrder.find({ approvalStatus: 'pending-final', status: { $ne: 'cancelled' } }).populate('createdBy', 'name').lean(),
    BillRequest.find({ status: 'pending-l4' }).populate('requestedBy', 'name').lean(),
    RunningBill.find({ manualApprovalStatus: 'pending-l4' }).populate('createdBy', 'name').lean(),
    RunningBill.find({ status: 'l1-approved' }).populate('createdBy', 'name').lean(),
  ]);

  const items = [];
  const now = Date.now();

  for (const wo of workOrders) {
    if (!canActOnDepartment(user, wo)) continue;
    const config = await getWoApprovalConfig(wo);
    if (!woApproverAllowed(user, config, 'final')) continue;
    const pendingSince = wo.approverAt || wo.checkerAt || wo.createdAt;
    items.push({
      id: String(wo._id),
      system: 'WorkOrder',
      approvalType: 'Work Order Final Approval',
      referenceNumber: wo.workOrderNo,

      workOrderNo: wo.workOrderNo,


      isArchived: false,

      projectName: wo.projectName || null,

      vendorName: wo.vendorName || null,
      requester: wo.createdBy?.name || null,
      department: departmentOf(wo),
      amount: wo.contractValue || 0,
      submittedAt: wo.createdAt,
      pendingSince,
      daysPending: dayFloor(pendingSince, now),
      status: wo.approvalStatus,
      currentStage: 'Final Approval (CEO/Owner)',
    });
  }

  for (const br of billRequests) {
    if (!canActOnDepartment(user, br)) continue;
    const config = await getApprovalConfig(br);
    if (!approverAllowed(user, config, 'l4')) continue;
    const pendingSince = br.l3ApprovedAt || br.createdAt;
    items.push({
      id: String(br._id),
      system: 'BillRequest',
      approvalType: 'Bill Request L4 Approval',
      referenceNumber: br.reqNo,

      workOrderNo: br.workOrderNo || null,


      isArchived: !!br.isArchived,

      projectName: br.projectName || null,

      vendorName: br.vendorName || null,
      requester: br.requestedBy?.name || null,
      department: departmentOf(br),
      amount: (br.items || []).reduce((s, it) => s + (it.amount ?? (it.rate || 0) * it.billedQty), 0),
      submittedAt: br.createdAt,
      pendingSince,
      daysPending: dayFloor(pendingSince, now),
      status: br.status,
      currentStage: 'L4 Approval',
    });
  }

  const seenBillIds = new Set();
  for (const bill of manualBills) {
    if (!canActOnDepartment(user, bill)) continue;
    const config = await getApprovalConfig(bill);
    if (!approverAllowed(user, config, 'l4')) continue;
    seenBillIds.add(String(bill._id));
    const pendingSince = bill.manualL3ApprovedAt || bill.createdAt;
    items.push({
      id: String(bill._id),
      system: 'RunningBill-Manual',
      approvalType: 'Manual Bill L4 Approval',
      referenceNumber: bill.billNo,

      workOrderNo: bill.workOrderNo || null,


      isArchived: !!bill.isArchived,

      projectName: bill.projectName || null,

      vendorName: bill.vendorName || null,
      requester: bill.createdBy?.name || bill.generatedBy || null,
      department: departmentOf(bill),
      amount: bill.amount || 0,
      submittedAt: bill.createdAt,
      pendingSince,
      daysPending: dayFloor(pendingSince, now),
      status: bill.manualApprovalStatus,
      currentStage: 'L4 Approval (Manual Chain)',
    });
  }

  const hasL2DirectorAccess = can(user, 'accounts-payment', 'l2-director-approve');
  if (hasL2DirectorAccess) {
    for (const bill of accountsBills) {
      if (seenBillIds.has(String(bill._id))) continue;
      const pendingSince = bill.l1ApprovedAt || bill.createdAt;
      items.push({
        id: String(bill._id),
        system: 'RunningBill-Accounts',
        approvalType: 'Bill L2 Director Approval',
        referenceNumber: bill.billNo,

        workOrderNo: bill.workOrderNo || null,


        isArchived: !!bill.isArchived,

        projectName: bill.projectName || null,

        vendorName: bill.vendorName || null,
        requester: bill.createdBy?.name || bill.generatedBy || null,
        department: departmentOf(bill),
        amount: bill.amount || 0,
        submittedAt: bill.createdAt,
        pendingSince,
        daysPending: dayFloor(pendingSince, now),
        status: bill.status,
        currentStage: 'L2 Director Approval',
      });
    }
  }

  return items;
}

// decision: 'approved' | 'rejected'. Historical items are no longer "at" the
// stage in question, so re-checking woApproverAllowed/approverAllowed for the
// CURRENT stage state would be meaningless (the item already moved past it);
// department scoping is what still legitimately limits visibility, since the
// item was actually decided by someone eligible when it happened.
async function buildDecidedItems(user, decision) {
  const items = [];
  const now = Date.now();

  if (can(user, 'work-orders', 'ceo-approve')) {
    const marker = DECIDED_MARKERS.WorkOrder[decision];
    const rows = await WorkOrder.find({ approvalHistory: { $elemMatch: marker } })
      .populate('createdBy', 'name').lean();
    for (const wo of rows) {
      if (!canActOnDepartment(user, wo)) continue;
      const entry = lastMatchingHistoryEntry(wo.approvalHistory, marker.stage, marker.action);
      if (!entry) continue;
      const pendingSince = wo.approverAt || wo.checkerAt || wo.createdAt;
      items.push({
        id: String(wo._id),
        system: 'WorkOrder',
        approvalType: 'Work Order Final Approval',
        referenceNumber: wo.workOrderNo,

        workOrderNo: wo.workOrderNo,


        isArchived: false,

        projectName: wo.projectName || null,

        vendorName: wo.vendorName || null,
        requester: wo.createdBy?.name || null,
        department: departmentOf(wo),
        amount: wo.contractValue || 0,
        submittedAt: wo.createdAt,
        pendingSince,
        status: wo.approvalStatus,
        currentStage: 'Final Approval (CEO/Owner)',
        decision: entry.action === 'sent-back' ? 'sent-back' : entry.action,
        decidedBy: entry.byName || null,
        decidedAt: entry.at,
        daysToDecide: dayFloor(pendingSince, entry.at),
      });
    }
  }

  if (can(user, 'bill-requests', 'l4-approve')) {
    const marker = DECIDED_MARKERS.BillRequest[decision];
    const rows = await BillRequest.find({ approvalHistory: { $elemMatch: marker } })
      .populate('requestedBy', 'name').lean();
    for (const br of rows) {
      if (!canActOnDepartment(user, br)) continue;
      const entry = lastMatchingHistoryEntry(br.approvalHistory, marker.stage, marker.action);
      if (!entry) continue;
      const pendingSince = br.l3ApprovedAt || br.createdAt;
      items.push({
        id: String(br._id),
        system: 'BillRequest',
        approvalType: 'Bill Request L4 Approval',
        referenceNumber: br.reqNo,

        workOrderNo: br.workOrderNo || null,


        isArchived: !!br.isArchived,

        projectName: br.projectName || null,

        vendorName: br.vendorName || null,
        requester: br.requestedBy?.name || null,
        department: departmentOf(br),
        amount: (br.items || []).reduce((s, it) => s + (it.amount ?? (it.rate || 0) * it.billedQty), 0),
        submittedAt: br.createdAt,
        pendingSince,
        status: br.status,
        currentStage: 'L4 Approval',
        decision: entry.action,
        decidedBy: entry.byName || null,
        decidedAt: entry.at,
        daysToDecide: dayFloor(pendingSince, entry.at),
      });
    }
  }

  const hasBillsAccess = can(user, 'bill-requests', 'l4-approve') || can(user, 'accounts-payment', 'l2-director-approve');
  if (hasBillsAccess) {
    const manualMarker = DECIDED_MARKERS['RunningBill-Manual'][decision];
    const accountsMarker = DECIDED_MARKERS['RunningBill-Accounts'][decision];
    const rows = await RunningBill.find({
      $or: [{ approvalHistory: { $elemMatch: manualMarker } }, { approvalHistory: { $elemMatch: accountsMarker } }],
    }).populate('createdBy', 'name').lean();

    const seen = new Set();
    for (const bill of rows) {
      if (!canActOnDepartment(user, bill)) continue;
      const manualEntry = can(user, 'bill-requests', 'l4-approve')
        ? lastMatchingHistoryEntry(bill.approvalHistory, manualMarker.stage, manualMarker.action) : null;
      const accountsEntry = can(user, 'accounts-payment', 'l2-director-approve')
        ? lastMatchingHistoryEntry(bill.approvalHistory, accountsMarker.stage, accountsMarker.action) : null;

      if (manualEntry) {
        const key = `manual-${bill._id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const pendingSince = bill.manualL3ApprovedAt || bill.createdAt;
          items.push({
            id: String(bill._id),
            system: 'RunningBill-Manual',
            approvalType: 'Manual Bill L4 Approval',
            referenceNumber: bill.billNo,

            workOrderNo: bill.workOrderNo || null,


            isArchived: !!bill.isArchived,

            projectName: bill.projectName || null,

            vendorName: bill.vendorName || null,
            requester: bill.createdBy?.name || bill.generatedBy || null,
            department: departmentOf(bill),
            amount: bill.amount || 0,
            submittedAt: bill.createdAt,
            pendingSince,
            status: bill.manualApprovalStatus,
            currentStage: 'L4 Approval (Manual Chain)',
            decision: manualEntry.action,
            decidedBy: manualEntry.byName || null,
            decidedAt: manualEntry.at,
            daysToDecide: dayFloor(pendingSince, manualEntry.at),
          });
        }
      }
      if (accountsEntry) {
        const key = `accounts-${bill._id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const pendingSince = bill.l1ApprovedAt || bill.createdAt;
          items.push({
            id: String(bill._id),
            system: 'RunningBill-Accounts',
            approvalType: 'Bill L2 Director Approval',
            referenceNumber: bill.billNo,

            workOrderNo: bill.workOrderNo || null,


            isArchived: !!bill.isArchived,

            projectName: bill.projectName || null,

            vendorName: bill.vendorName || null,
            requester: bill.createdBy?.name || bill.generatedBy || null,
            department: departmentOf(bill),
            amount: bill.amount || 0,
            submittedAt: bill.createdAt,
            pendingSince,
            status: bill.status,
            currentStage: 'L2 Director Approval',
            decision: accountsEntry.action === 'sent-back' ? 'sent-back' : accountsEntry.action,
            decidedBy: accountsEntry.byName || null,
            decidedAt: accountsEntry.at,
            daysToDecide: dayFloor(pendingSince, accountsEntry.at),
          });
        }
      }
    }
  }

  return items;
}

exports.listMdApprovals = asyncHandler(async (req, res) => {
  const user = req.user;
  const tab = ['pending', 'approved', 'rejected'].includes(req.query.tab) ? req.query.tab : 'pending';

  // Base-access guard — a user holding NONE of the 3 final-stage permissions
  // (including via role bypass, e.g. Owner) has no legitimate reason to even
  // probe this endpoint, so short-circuit before running any of the queries.
  const hasAnyBaseAccess =
    can(user, 'work-orders', 'ceo-approve') ||
    can(user, 'bill-requests', 'l4-approve') ||
    can(user, 'accounts-payment', 'l2-director-approve');
  if (!hasAnyBaseAccess) return forbidden(res, 'You are not configured as a final-stage approver anywhere in this system.');

  const items = tab === 'pending' ? await buildPendingItems(user) : await buildDecidedItems(user, tab);

  success(res, { items, tab });
});

// ── Detail endpoint for the review drawer ──────────────────────────────────
const SYSTEM_MODELS = { WorkOrder, BillRequest, 'RunningBill-Manual': RunningBill, 'RunningBill-Accounts': RunningBill };

exports.getMdApprovalDetail = asyncHandler(async (req, res) => {
  const { system, id } = req.params;
  const user = req.user;
  const Model = SYSTEM_MODELS[system];
  if (!Model) return badRequest(res, `Unknown system '${system}'`);

  const populateField = system === 'BillRequest' ? 'requestedBy' : 'createdBy';
  let query = Model.findById(id).populate(populateField, 'name email');
  // BillRequest's own real detail view (BillDetailModal, reused verbatim by
  // the Review drawer — see ReviewDrawer.tsx) needs the linked RunningBill's
  // full lineItems + approval-chain stamps, plus who processed/AGM-approved
  // this request — none of which the generic `detail` shape below carries.
  if (system === 'BillRequest') {
    query = query
      .populate('processedBy', 'name role')
      .populate('agmApprovedBy', 'name role')
      .populate({
        path: 'billId',
        populate: [
          { path: 'verificationBy', select: 'name' },
          { path: 'l1ApprovedBy', select: 'name' },
          { path: 'l2ApprovedBy', select: 'name' },
          { path: 'agmApprovedBy', select: 'name role' },
        ],
      });
  }
  const doc = await query.lean();
  if (!doc) return notFound(res, 'Not found');
  if (!canActOnDepartment(user, doc)) return forbidden(res, 'This item belongs to a different department.');

  // Re-run the same authorization the list endpoint uses: for an item still
  // sitting at the relevant stage, the real "am I the configured approver"
  // check; for an already-decided item, department scoping (above) is
  // sufficient — re-checking the CURRENT stage state would be meaningless
  // since the item has moved past it.
  let authorized = false;
  let isPending = false;
  if (system === 'WorkOrder') {
    isPending = doc.approvalStatus === 'pending-final';
    if (isPending) {
      const config = await getWoApprovalConfig(doc);
      authorized = woApproverAllowed(user, config, 'final');
    } else {
      authorized = can(user, 'work-orders', 'ceo-approve');
    }
  } else if (system === 'BillRequest') {
    isPending = doc.status === 'pending-l4';
    if (isPending) {
      const config = await getApprovalConfig(doc);
      authorized = approverAllowed(user, config, 'l4');
    } else {
      authorized = can(user, 'bill-requests', 'l4-approve');
    }
  } else if (system === 'RunningBill-Manual') {
    isPending = doc.manualApprovalStatus === 'pending-l4';
    if (isPending) {
      const config = await getApprovalConfig(doc);
      authorized = approverAllowed(user, config, 'l4');
    } else {
      authorized = can(user, 'bill-requests', 'l4-approve');
    }
  } else if (system === 'RunningBill-Accounts') {
    isPending = doc.status === 'l1-approved';
    authorized = isPending
      ? can(user, 'accounts-payment', 'l2-director-approve')
      : can(user, 'accounts-payment', 'l2-director-approve');
  }
  if (!authorized) return forbidden(res, "You're not authorized to view this item.");

  const requester = doc.createdBy?.name || doc.requestedBy?.name || doc.generatedBy || null;
  const detail = {
    id: String(doc._id),
    system,
    referenceNumber: doc.workOrderNo || doc.reqNo || doc.billNo,
    requester,
    department: departmentOf(doc),
    vendorName: doc.vendorName || null,
    vendorCode: doc.vendorCode || null,
    projectId: doc.projectId ? String(doc.projectId) : null,
    amount: doc.contractValue ?? doc.amount ?? (doc.items || []).reduce((s, it) => s + (it.amount ?? (it.rate || 0) * it.billedQty), 0),
    scopeItems: doc.scopeItems || undefined,
    items: doc.items || undefined,
    lineItems: doc.lineItems || undefined,
    documents: doc.documents || [],
    createdAt: doc.createdAt,
    approvalHistory: (doc.approvalHistory || []).map((h) => ({
      stage: h.stage,
      action: h.action,
      by: h.byName || null,
      role: h.byRole || null,
      at: h.at,
      remarks: h.remarks || '',
    })),
  };

  // Raw, unreshaped fields the real BillDetailModal component (BillRequests'
  // own view, reused as-is by MD Approvals' Review drawer — see
  // ReviewDrawer.tsx / BillDetailModal.tsx's BillDetailRequest interface)
  // actually reads — only populated for 'BillRequest', since that's the only
  // system the drawer renders through BillDetailModal via this endpoint
  // (RunningBill-Manual instead reads straight off GET /bills/:id, which is
  // already fully populated for this purpose).
  if (system === 'BillRequest') {
    detail.billRequestRaw = {
      _id: String(doc._id),
      reqNo: doc.reqNo,
      stageNo: doc.stageNo,
      workOrderNo: doc.workOrderNo,
      projectName: doc.projectName,
      vendorName: doc.vendorName,
      category: doc.category,
      subCategory: doc.subCategory,
      items: doc.items || [],
      remarks: doc.remarks || '',
      periodFrom: doc.periodFrom,
      periodTo: doc.periodTo,
      status: doc.status === 'approved' ? 'approved' : doc.status === 'rejected' ? 'rejected' : 'pending',
      rejectReason: doc.rejectReason || '',
      requestedBy: doc.requestedBy ? { name: doc.requestedBy.name, email: doc.requestedBy.email } : undefined,
      processedBy: doc.processedBy ? { name: doc.processedBy.name, role: doc.processedBy.role } : null,
      processedAt: doc.processedAt,
      agmApprovedBy: doc.agmApprovedBy ? { name: doc.agmApprovedBy.name, role: doc.agmApprovedBy.role } : null,
      agmApprovedAt: doc.agmApprovedAt,
      approvalHistory: (doc.approvalHistory || []).map((h) => ({
        stage: h.stage, action: h.action, by: h.byName ? { name: h.byName, role: h.byRole } : null, at: h.at, remarks: h.remarks,
      })),
      billId: doc.billId ? {
        billNo: doc.billId.billNo,
        status: doc.billId.status,
        amount: doc.billId.amount,
        paidAmount: doc.billId.paidAmount,
        retentionPercent: doc.billId.retentionPercent,
        retentionAmount: doc.billId.retentionAmount,
        advanceRecovery: doc.billId.advanceRecovery,
        supersedeDeduction: doc.billId.supersedeDeduction,
        gstPercent: doc.billId.gstPercent,
        adjustmentAmount: doc.billId.adjustmentAmount,
        adjustmentRemark: doc.billId.adjustmentRemark,
        paymentUTR: doc.billId.paymentUTR,
        verificationBy: doc.billId.verificationBy ? { name: doc.billId.verificationBy.name } : null,
        verificationAt: doc.billId.verificationAt,
        l1ApprovedBy: doc.billId.l1ApprovedBy ? { name: doc.billId.l1ApprovedBy.name } : null,
        l1ApprovedAt: doc.billId.l1ApprovedAt,
        l2ApprovedBy: doc.billId.l2ApprovedBy ? { name: doc.billId.l2ApprovedBy.name } : null,
        l2ApprovedAt: doc.billId.l2ApprovedAt,
        tmsSentAt: doc.billId.tmsSentAt,
        tmsCallbackReceivedAt: doc.billId.tmsCallbackReceivedAt,
        agmApprovedBy: doc.billId.agmApprovedBy ? { name: doc.billId.agmApprovedBy.name, role: doc.billId.agmApprovedBy.role } : null,
        agmApprovedAt: doc.billId.agmApprovedAt,
        lineItems: doc.billId.lineItems || [],
      } : undefined,
      milestoneAchieved: doc.milestoneAchieved,
      milestoneDate: doc.milestoneDate,
      createdAt: doc.createdAt,
    };
  }

  success(res, { item: detail });
});
