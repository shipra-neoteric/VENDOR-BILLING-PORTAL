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
// unmodified per-system routes (final-approve/gm-approve/l3-approve/
// l4-approve/manual-gm-approve/manual-l3-approve/manual-l4-approve/
// l2-director-approve, and their reject/send-back counterparts).
//
// IMPORTANT: BillRequest/RunningBill-manual's "final" stage is NOT always
// L4. Per billRequestController.js's gmApproveHandler (~line 650-652) and
// l3ApproveHandler (~line 706-713), and billController.js's manual-chain
// mirrors of the same logic: each department has its own
// DepartmentApprovalConfig.requiredApprovals (2, 3, or 4), and whichever
// stage equals that count is the one that actually finalizes the
// request — gmApprove finalizes directly (skips l3/l4) when
// requiredApprovals < 3, l3Approve finalizes directly (skips l4) when
// requiredApprovals < 4. A department configured for 3 levels (seen in
// production: "civil") never produces a single pending-l4 row — its real
// final-approval-pending items sit at status/manualApprovalStatus ===
// 'pending-l3' forever. Hardcoding a pending-l4-only query silently
// dropped every such department's items from this page. finalStageFor()
// below re-derives, per document, which stage is actually final for it.
//
// Exact history stage/action strings used below were read directly off the
// real handlers, not guessed:
//   WorkOrder.finalApprove       (workOrderController.js:703) → stage:'final',        action:'approved'
//   WorkOrder.sendBack           (workOrderController.js:740-745) → from 'pending-final' → stage:'final', action:'sent-back'
//   BillRequest.gmApprove        (billRequestController.js:~652) → stage:'gm',  action:'approved' (finalizes when requiredApprovals<3)
//   BillRequest.l3ApproveHandler (billRequestController.js:704)   → stage:'l3', action:'approved' (finalizes when requiredApprovals<4)
//   BillRequest.l4Approve        (billRequestController.js:753)   → stage:'l4', action:'approved' (always final)
//   BillRequest.rejectBillRequest                                  → stage:<current status's stage>, action:'rejected'
//   RunningBill.manualGmApprove/manualL3Approve/manualL4Approve (billController.js) → stage:'manual-gm'/'manual-l3'/'manual-l4', action:'approved'
//   RunningBill.manualReject                                       → stage:'manual-<current>', action:'rejected'
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

function departmentOf(doc) {
  return doc.department === 'custom' ? (doc.customDepartment || '') : (doc.department || '');
}

// Given a BillRequest/RunningBill(manual) currently sitting at
// pending-gm/pending-l3/pending-l4, and its resolved approvalConfig,
// determines whether THIS stage is the one that will actually finalize it
// (matching gmApproveHandler/l3ApproveHandler's own totalLevels branching),
// and if so returns the stage key ('gm'/'l3'/'l4') approverAllowed()/the
// real per-system route expects. Returns null if this document is at a
// genuinely non-final intermediate stage (e.g. pending-gm for a 4-level
// department, which will advance to pending-l3 next, not finalize) — such
// items are correctly NOT final-approval-pending yet and are left out.
function finalStageFor(status, statusPrefix, config) {
  const totalLevels = config?.requiredApprovals ?? 2;
  const stage = status === `${statusPrefix}gm` ? 'gm' : status === `${statusPrefix}l3` ? 'l3' : status === `${statusPrefix}l4` ? 'l4' : null;
  if (!stage) return null;
  if (stage === 'gm' && totalLevels < 3) return 'gm';
  if (stage === 'l3' && totalLevels < 4) return 'l3';
  if (stage === 'l4') return 'l4';
  return null;
}

const STAGE_LABEL = { gm: 'GM Approval', l3: 'L3 Approval', l4: 'L4 Approval' };

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

// Scans gm/l3/l4 (in that order — l4 checked first since a 4-level
// department's history ALSO carries an earlier l3:'approved' entry from
// before it advanced, so checking l3 first would misidentify the real
// final stage) for whichever one actually carries the terminal
// approved/rejected entry — this is determined from the actual recorded
// history, not from re-deriving requiredApprovals, so it stays correct
// even if a department's config changes after the fact.
function findFinalHistoryEntry(history, stagePrefix, action) {
  for (const stage of ['l4', 'l3', 'gm']) {
    const entry = lastMatchingHistoryEntry(history, `${stagePrefix}${stage}`, action);
    if (entry) return { stage, entry };
  }
  return null;
}

async function buildPendingItems(user) {
  const [workOrders, billRequests, manualBills, accountsBills] = await Promise.all([
    WorkOrder.find({ approvalStatus: 'pending-final' }).populate('createdBy', 'name').lean(),
    BillRequest.find({ status: { $in: ['pending-gm', 'pending-l3', 'pending-l4'] } }).populate('requestedBy', 'name').lean(),
    RunningBill.find({ manualApprovalStatus: { $in: ['pending-gm', 'pending-l3', 'pending-l4'] } }).populate('createdBy', 'name').lean(),
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
      // WorkOrder has no isArchived field of its own — a cancelled WO IS
      // its "archived" state (same convention WorkItems/index.tsx already
      // uses: cancelled WOs are hidden by default, shown only via Show
      // Archived), so a pending-final WO that's also been cancelled (e.g.
      // "Duplicate work order") surfaces only under Archived here too,
      // rather than either always showing or being excluded outright.
      isArchived: wo.status === 'cancelled',
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
    const stage = finalStageFor(br.status, 'pending-', config);
    if (!stage) continue; // genuinely mid-chain for this department, not final yet
    if (!approverAllowed(user, config, stage)) continue;
    const pendingSince = stage === 'l4' ? (br.l3ApprovedAt || br.createdAt)
      : stage === 'l3' ? (br.gmApprovedAt || br.createdAt)
      : (br.agmApprovedAt || br.createdAt);
    items.push({
      id: String(br._id),
      system: 'BillRequest',
      approvalType: `Bill Request ${STAGE_LABEL[stage]}`,
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
      currentStage: STAGE_LABEL[stage],
      finalStage: stage,
    });
  }

  const seenBillIds = new Set();
  for (const bill of manualBills) {
    if (!canActOnDepartment(user, bill)) continue;
    const config = await getApprovalConfig(bill);
    const stage = finalStageFor(bill.manualApprovalStatus, 'pending-', config);
    if (!stage) continue;
    if (!approverAllowed(user, config, stage)) continue;
    seenBillIds.add(String(bill._id));
    const pendingSince = stage === 'l4' ? (bill.manualL3ApprovedAt || bill.createdAt)
      : stage === 'l3' ? (bill.manualGmApprovedAt || bill.createdAt)
      : (bill.manualAgmApprovedAt || bill.createdAt);
    items.push({
      id: String(bill._id),
      system: 'RunningBill-Manual',
      approvalType: `Manual Bill ${STAGE_LABEL[stage]}`,
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
      currentStage: `${STAGE_LABEL[stage]} (Manual Chain)`,
      finalStage: stage,
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
    const marker = decision === 'approved' ? { stage: 'final', action: 'approved' } : { stage: 'final', action: 'sent-back' };
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
        isArchived: wo.status === 'cancelled',
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

  if (can(user, 'bill-requests', 'l4-approve') || can(user, 'bill-requests', 'l3-approve') || can(user, 'bill-requests', 'gm-approve')) {
    const action = decision === 'approved' ? 'approved' : 'rejected';
    const rows = await BillRequest.find({
      approvalHistory: { $elemMatch: { stage: { $in: ['gm', 'l3', 'l4'] }, action } },
    }).populate('requestedBy', 'name').lean();
    for (const br of rows) {
      if (!canActOnDepartment(user, br)) continue;
      const found = findFinalHistoryEntry(br.approvalHistory, '', action);
      if (!found) continue;
      const { stage, entry } = found;
      const pendingSince = stage === 'l4' ? (br.l3ApprovedAt || br.createdAt)
        : stage === 'l3' ? (br.gmApprovedAt || br.createdAt)
        : (br.agmApprovedAt || br.createdAt);
      items.push({
        id: String(br._id),
        system: 'BillRequest',
        approvalType: `Bill Request ${STAGE_LABEL[stage]}`,
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
        currentStage: STAGE_LABEL[stage],
        decision: entry.action,
        decidedBy: entry.byName || null,
        decidedAt: entry.at,
        daysToDecide: dayFloor(pendingSince, entry.at),
      });
    }
  }

  const hasBillsAccess = can(user, 'bill-requests', 'l4-approve') || can(user, 'bill-requests', 'l3-approve') || can(user, 'bill-requests', 'gm-approve')
    || can(user, 'accounts-payment', 'l2-director-approve');
  if (hasBillsAccess) {
    const action = decision === 'approved' ? 'approved' : 'rejected';
    const accountsMarker = decision === 'approved' ? { stage: 'l2-director', action: 'approved' } : { stage: 'l1-agm-approve', action: 'sent-back' };
    const rows = await RunningBill.find({
      $or: [
        { approvalHistory: { $elemMatch: { stage: { $in: ['manual-gm', 'manual-l3', 'manual-l4'] }, action } } },
        { approvalHistory: { $elemMatch: accountsMarker } },
      ],
    }).populate('createdBy', 'name').lean();

    const seen = new Set();
    for (const bill of rows) {
      if (!canActOnDepartment(user, bill)) continue;
      const manualFound = (can(user, 'bill-requests', 'l4-approve') || can(user, 'bill-requests', 'l3-approve') || can(user, 'bill-requests', 'gm-approve'))
        ? findFinalHistoryEntry(bill.approvalHistory, 'manual-', action) : null;
      const accountsEntry = can(user, 'accounts-payment', 'l2-director-approve')
        ? lastMatchingHistoryEntry(bill.approvalHistory, accountsMarker.stage, accountsMarker.action) : null;

      if (manualFound) {
        const key = `manual-${bill._id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const { stage, entry } = manualFound;
          const pendingSince = stage === 'l4' ? (bill.manualL3ApprovedAt || bill.createdAt)
            : stage === 'l3' ? (bill.manualGmApprovedAt || bill.createdAt)
            : (bill.manualAgmApprovedAt || bill.createdAt);
          items.push({
            id: String(bill._id),
            system: 'RunningBill-Manual',
            approvalType: `Manual Bill ${STAGE_LABEL[stage]}`,
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
            currentStage: `${STAGE_LABEL[stage]} (Manual Chain)`,
            decision: entry.action,
            decidedBy: entry.byName || null,
            decidedAt: entry.at,
            daysToDecide: dayFloor(pendingSince, entry.at),
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

  // Base-access guard — a user holding NONE of the final-stage permissions
  // (including via role bypass, e.g. Owner) has no legitimate reason to even
  // probe this endpoint, so short-circuit before running any of the queries.
  // gm-approve/l3-approve are included alongside l4-approve since either can
  // be the REAL final stage for a given department (see finalStageFor above).
  const hasAnyBaseAccess =
    can(user, 'work-orders', 'ceo-approve') ||
    can(user, 'bill-requests', 'l4-approve') ||
    can(user, 'bill-requests', 'l3-approve') ||
    can(user, 'bill-requests', 'gm-approve') ||
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
  // check (now correctly resolved per-department, not hardcoded to l4); for
  // an already-decided item, department scoping (above) is sufficient —
  // re-checking the CURRENT stage state would be meaningless since the item
  // has moved past it.
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
    const config = await getApprovalConfig(doc);
    const stage = finalStageFor(doc.status, 'pending-', config);
    isPending = !!stage;
    if (isPending) {
      authorized = approverAllowed(user, config, stage);
    } else {
      authorized = can(user, 'bill-requests', 'l4-approve') || can(user, 'bill-requests', 'l3-approve') || can(user, 'bill-requests', 'gm-approve');
    }
  } else if (system === 'RunningBill-Manual') {
    const config = await getApprovalConfig(doc);
    const stage = finalStageFor(doc.manualApprovalStatus, 'pending-', config);
    isPending = !!stage;
    if (isPending) {
      authorized = approverAllowed(user, config, stage);
    } else {
      authorized = can(user, 'bill-requests', 'l4-approve') || can(user, 'bill-requests', 'l3-approve') || can(user, 'bill-requests', 'gm-approve');
    }
  } else if (system === 'RunningBill-Accounts') {
    isPending = doc.status === 'l1-approved';
    authorized = can(user, 'accounts-payment', 'l2-director-approve');
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
