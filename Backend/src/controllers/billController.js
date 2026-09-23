const { validationResult } = require('express-validator');
const RunningBill  = require('../models/RunningBill');
const BillRequest  = require('../models/BillRequest');
const WorkOrder    = require('../models/WorkOrder');
const Company      = require('../models/Company');
const { resolvePayee } = require('../utils/vendorGroupHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict, forbidden } = require('../utils/responseFormatter');
const { canActOnDepartment } = require('../utils/departmentAccess');
const { can } = require('../middleware/auth');
const { nextBillNo, nextBillRequestReqNo } = require('../utils/codeGen');
const emitEvent    = require('../utils/emitEvent');
const { advanceInstance, cancelInstance } = require('../utils/slaEngine');
const { logAudit, diffFields } = require('../utils/auditLog');
const { hasUnapprovedVarianceForLineItem, resolveBillableItem, findOverbilledLineItem, isWorkOrderApproved } = require('../utils/varianceCheck');
const { recomputeAfterInvalidate, recomputeParentFromSubItems, deriveStatus } = require('../utils/progressHelpers');
const { applyAdvanceRecoveries, reverseAdvanceRecoveries } = require('../utils/advanceRecovery');
const AdvanceSlip  = require('../models/AdvanceSlip');
const Contractor   = require('../models/Contractor');
const { nextCode } = require('../utils/sequence');
const { notifyStagePending, settleAllPendingForEntity } = require('../utils/slackApprovals');
const { getApprovalConfig, approverAllowed, DEFAULT_AGM_ROLES, DEFAULT_GM_ROLES, DEFAULT_L3_ROLES, DEFAULT_L4_ROLES } = require('../utils/approvalRules');
const { notifyStageInApp, notifyByPermission } = require('../utils/notificationService');
const User = require('../models/User');

const MODULE = 'accounts-payment';

// Kill switch — TMS's payment-confirmed webhook isn't firing reliably, so
// every bill sent there gets stuck at 'sent-to-tms' awaiting a callback that
// never comes. While this stays false, "Send to TMS" skips the real TMS
// call/wait entirely and marks the bill 'paid' immediately instead — the
// real integration code below is untouched and starts being used again the
// moment this flips back to true (nothing else needs to change).
const TMS_INTEGRATION_ENABLED = false;

// Fire-and-forget (mirrors emitEvent's un-awaited call sites) — a failed or
// unconfigured Slack push must never block the real approval-chain write that
// already happened.
function notifySlack(approvalType, bill) {
  notifyStagePending(approvalType, bill)
    .catch((err) => console.error(`[slack] ${approvalType} notify failed`, err.message));
  notifyStageInApp(approvalType, bill)
    .catch((err) => console.error(`[notifications] ${approvalType} notify failed`, err.message));
}

// Contract Limits — informational only, fires no validation and blocks
// nothing (createBill/isWorkOrderApproved already gate what's allowed). Once
// a WO's total active-bill amount reaches 90% of its own contractValue, the
// people who can actually act on that work order (work-orders:edit, or
// owner/gm) get a heads-up before it's fully exhausted.
async function notifyContractLimitIfNear(workOrder) {
  if (!workOrder || !workOrder.contractValue) return;
  const bills = await RunningBill.find({ workOrderId: workOrder._id, isActive: { $ne: false } }).select('amount').lean();
  const totalBilled = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const pct = totalBilled / workOrder.contractValue;
  if (pct < 0.9) return;
  await notifyByPermission({
    module: 'work-orders', action: 'edit', roles: ['owner', 'gm'], entityDoc: workOrder, departmentScoped: true,
    type: 'WORK_ORDER_CONTRACT_LIMIT_NEAR', category: 'contract-limits',
    title: `${workOrder.workOrderNo} nearing its contract value`,
    message: `${workOrder.workOrderNo} (${workOrder.vendorName || ''}) has been billed ₹${Math.round(totalBilled).toLocaleString('en-IN')} of its ₹${Math.round(workOrder.contractValue).toLocaleString('en-IN')} contract value (${Math.round(pct * 100)}%).`,
    entityType: 'WorkOrder', entityId: workOrder._id, link: `/work-items/${workOrder._id}`,
  }).catch((err) => console.error('[notifications] WORK_ORDER_CONTRACT_LIMIT_NEAR notify failed', err.message));
}

// Advances the SLA tracker for whichever BillRequest generated this RunningBill —
// no-ops silently if there's no linked request or no in-progress instance, so it's
// safe to call unconditionally from every stage-transition action below.
async function advanceBillRequestInstance(bill, actorUserId, remarks) {
  const br = await BillRequest.findOne({ billId: bill._id }).select('_id');
  if (!br) return;
  await advanceInstance('BillRequest', br._id, actorUserId, remarks);
}

// Appends one entry to the bill's own append-only timeline — separate from
// logAudit (the system-wide audit log, already called at every transition
// below); this one drives just the Accounts Payment drawer's history view,
// same split WorkOrder.approvalHistory already uses.
function pushHistory(bill, stage, action, by, remarks) {
  bill.approvalHistory.push({ stage, action, by, remarks: remarks || '' });
}

// l3ApprovedBy/l4ApprovedBy were missing here — a 3/4-level department's
// BillRequest pre-chain carries these onto the bill (see
// billRequestController.finalizeBillRequest), but without populating them
// they stay raw ObjectIds, so the print signature block (which now renders
// an L3/L4 column when present) would show a bare id instead of a name.
const POPULATE_FIELDS = ['agmApprovedBy', 'gmApprovedBy', 'l3ApprovedBy', 'l4ApprovedBy', 'makerBy', 'verifiedBy', 'checkerBy', 'approvedBy', 'paymentInitiatedBy', 'rejectedBy', 'verificationBy', 'l1ApprovedBy', 'l2ApprovedBy', 'holdBy', 'holdReleasedBy', 'lineItems.varianceApprovedBy', 'manualAgmApprovedBy', 'manualGmApprovedBy', 'manualL3ApprovedBy', 'manualL4ApprovedBy', 'manualRejectedBy', 'sentForApprovalTo', 'sentForL2ApprovalTo'];

exports.listBills = asyncHandler(async (req, res) => {
  const { workOrderId, vendorCode, projectId, status, manualApprovalStatus, search, archived } = req.query;
  const filter = {};
  if (workOrderId) filter.workOrderId = workOrderId;
  if (vendorCode)  filter.vendorCode  = vendorCode;
  if (projectId)   filter.projectId   = projectId;
  if (status)      filter.status      = status;
  if (manualApprovalStatus) {
    filter.manualApprovalStatus = Array.isArray(manualApprovalStatus) ? { $in: manualApprovalStatus } : manualApprovalStatus;
    // 'approved'/'rejected' are also the schema's own default/end state for
    // every non-manual, progress-driven bill (manualApprovalStatus just sits
    // at 'approved' forever since nothing ever touches it) — so asking for
    // those two statuses alone would flood this manual-bill queue with bills
    // that were never actually manual. A bill that genuinely went through
    // manual-agm-approve/manual-reject always has one of these two fields
    // set, which a progress-driven bill never does — 'pending'/'pending-gm'
    // need no such guard since createBill always sets that status explicitly
    // only for genuinely manual bills.
    // $and (not two separate top-level $or keys, which would collide —
    // object keys are unique, so a second filter.$or here would silently
    // overwrite the marker-guard one above) collects every OR-shaped
    // condition below so both apply together.
    filter.$and = [];
    const statuses = Array.isArray(manualApprovalStatus) ? manualApprovalStatus : [manualApprovalStatus];
    if (statuses.every((s) => ['approved', 'rejected'].includes(s))) {
      filter.$and.push({ $or: [
        { manualAgmApprovedBy: { $exists: true, $ne: null } },
        { manualRejectedBy:    { $exists: true, $ne: null } },
      ] });
    }
    // Department-scoped visibility — only applied to this manual-bill L1/L2
    // approval queue (identified by the manualApprovalStatus filter itself),
    // never to the plain bill list Billing/Accounts Payment use, since those
    // legitimately need every bill regardless of department. Same bypasses
    // and empty-department fallback as the BillRequest queue — see there. A
    // bill with no department of its own stays visible to everyone (it
    // belongs to no one yet), and "custom" only matches the same custom
    // team name, not every custom department.
    if (!['owner', 'accounts'].includes(req.user.role) && req.user.department) {
      const deptOr = [
        { department: { $in: ['', null] } },
        req.user.department === 'custom'
          ? { department: 'custom', customDepartment: req.user.customDepartment || '' }
          : { department: req.user.department },
      ];
      if (req.user.additionalDepartments?.length) {
        deptOr.push({ department: { $in: req.user.additionalDepartments } });
      }
      filter.$and.push({ $or: deptOr });
    }
    if (filter.$and.length === 0) delete filter.$and;
  }
  if (archived === 'true') filter.isArchived = true;
  else if (archived !== 'all') filter.isArchived = { $ne: true };
  // archived === 'all' → no isArchived filter, returns both
  if (search) {
    filter.$or = [
      { billNo:      { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { workOrderNo: { $regex: search, $options: 'i' } },
      { generatedBy: { $regex: search, $options: 'i' } },
    ];
  }

  let query = RunningBill.find(filter);
  for (const f of POPULATE_FIELDS) query = query.populate(f, 'name role');
  // getBill below already populates this — listBills never did, so the
  // History timeline (built straight off whatever bill object the frontend
  // already has from this list, not a fresh getBill call) always showed
  // "—" for every "Verified by"/"Approved by" row instead of a real name.
  query = query.populate('approvalHistory.by', 'name role');
  const bills = await query.sort({ createdAt: -1 }).lean();

  // Advance Slips and pending Bill Requests are merged into the response
  // BELOW, but only for the plain Billing-page list (no manualApprovalStatus
  // in the query) — the Bill Approval page's Manual Bills table calls this
  // same endpoint six times, once per manualApprovalStatus value
  // (pending/pending-gm/pending-l3/pending-l4/approved/rejected), and
  // neither AdvanceSlip nor BillRequest carries a real manualApprovalStatus
  // (it's explicitly left `undefined` on both row shapes below) — appending
  // them unconditionally meant every one of those six stage-filtered calls
  // got the SAME full, unfiltered slip/request set glued on regardless of
  // which stage was actually requested, flooding e.g. the "Pending L3" tab
  // with AdvanceSlip rows that have nothing to do with that approval chain.
  const isManualBillQueueCall = !!manualApprovalStatus;

  // Advance Slips (Mobilisation Advances raised via Billing → New Bill, or
  // via the Advance Payments page directly) have no approval chain and no
  // RunningBill counterpart — they're merged in here, additively, purely so
  // they're visible in this same list. Every RunningBill row above is
  // untouched by this — these are appended as separate row-shaped objects.
  // AdvanceSlip has no `search`-matching fields beyond slipNo/contractorName/
  // projectName, and no workOrderNo/manualApprovalStatus at all, so the
  // search/status/manualApprovalStatus query filters above simply don't
  // apply to it; only the isArchived convention is mirrored here so an
  // archived slip behaves the same as an archived bill in this list.
  const slipFilter = {};
  if (archived === 'true') slipFilter.isArchived = true;
  else if (archived !== 'all') slipFilter.isArchived = { $ne: true };
  if (projectId) slipFilter.projectId = projectId;
  if (vendorCode) slipFilter.contractorCode = vendorCode;
  // `search` is intentionally NOT applied to slipFilter here (unlike bills/
  // requests above) — contractorName is a creation-time snapshot, and the
  // live-Contractor-name overlay below can change what's actually DISPLAYED
  // without touching what's stored. Filtering at the DB-query level against
  // the stale stored name would miss slips whose contractor was since
  // renamed, even though the corrected name is exactly what's shown and
  // exactly what a user would search for. AdvanceSlip result sets are small
  // (unlike RunningBill/BillRequest, which can be large enough that a DB
  // filter matters), so the search is instead applied in-memory, AFTER the
  // overlay, against whatever name is actually being shown — see below.
  // populate('createdBy') so the redesigned detail modal/print (mirroring
  // BillDetailModal/printBill's "Generated By") has a real name instead of
  // always showing "—" for a merged-in slip row.
  // AdvanceSlip has no workOrderId field at all (it's only ever linked to a
  // project + contractor, never a specific WorkOrder) — so a caller asking
  // for one WO's bills (e.g. the WO Dashboard's own Bills tab) can't be
  // scoped to just its slips; every slip for the whole project (or, with no
  // projectId either, the whole system) would show under an unrelated WO
  // instead. Safer to omit slips entirely for a workOrderId-scoped call than
  // to show ones that aren't actually this WO's.
  const slips = (isManualBillQueueCall || workOrderId) ? [] : await AdvanceSlip.find(slipFilter).populate('createdBy', 'name').sort({ createdAt: -1 }).lean();

  // contractorName is snapshotted onto the AdvanceSlip at creation time and
  // never re-synced if the Contractor master record is later corrected
  // (same class of bug as WorkOrder's vendorName/ownerName/mobile — see
  // workOrderController.js's overlayLiveContractorFields). Overlay the live
  // companyName here for display, falling back to the stored snapshot when
  // no live Contractor is found (e.g. it was deleted).
  if (slips.length) {
    const slipContractorCodes = [...new Set(slips.filter(s => s.contractorCode).map(s => s.contractorCode))];
    const liveContractors = slipContractorCodes.length
      ? await Contractor.find({ vendorCode: { $in: slipContractorCodes } }).select('vendorCode companyName').lean()
      : [];
    const liveContractorMap = new Map(liveContractors.map(c => [c.vendorCode, c.companyName]));
    slips.forEach((slip) => {
      const liveName = liveContractorMap.get(slip.contractorCode);
      if (liveName) slip.contractorName = liveName;
    });
  }

  // Applied here, in-memory, AFTER the live-name overlay above — see the
  // comment at slipFilter's declaration for why this isn't a DB-query filter.
  const filteredSlips = search
    ? slips.filter((slip) => {
        const q = search.toLowerCase();
        return (slip.slipNo || '').toLowerCase().includes(q) ||
          (slip.contractorName || '').toLowerCase().includes(q) ||
          (slip.projectName || '').toLowerCase().includes(q);
      })
    : slips;

  const slipRows = filteredSlips.map((slip) => ({
    id: slip._id,
    _id: slip._id,
    billNo: slip.slipNo,
    billType: 'advance_slip',
    workOrderId: undefined,
    workOrderNo: undefined,
    vendorCode: slip.contractorCode,
    vendorName: slip.contractorName || slip.contractorCode,
    projectId: slip.projectId,
    projectName: slip.projectName,
    amount: slip.amount,
    amountRecovered: slip.amountRecovered,
    reference: slip.reference,
    notes: slip.notes,
    lineItems: [],
    gstPercent: 0,
    // No approval chain applies to a slip — manualApprovalStatus stays unset
    // so the Approval column shows the same "—" a non-manual bill would.
    manualApprovalStatus: undefined,
    // Accounts column re-purposed to show the slip's own outstanding/partial/
    // recovered lifecycle instead of a RunningBill's payment-stage status —
    // the frontend distinguishes this via billType === 'advance_slip'.
    status: slip.status,
    billDate: slip.date || slip.createdAt,
    createdAt: slip.createdAt,
    generatedBy: slip.createdBy?.name,
  }));

  // Bill Requests still awaiting approval (never finalized into a
  // RunningBill) — merged in here too, additively, purely so a pending
  // request (e.g. BR-0363) is visible in this list rather than invisible
  // until it finalizes. Same convention as the AdvanceSlip merge above: no
  // department scoping (the plain bill list here has none either — that's
  // only applied to the manual-bill L1/L2 approval queue via
  // manualApprovalStatus, see above), just the same project/vendor/search/
  // isArchived filters this endpoint already honors for RunningBill rows.
  const reqFilter = { status: { $in: ['pending', 'pending-gm', 'pending-l3', 'pending-l4'] } };
  if (archived === 'true') reqFilter.isArchived = true;
  else if (archived !== 'all') reqFilter.isArchived = { $ne: true };
  if (workOrderId) reqFilter.workOrderId = workOrderId;
  if (vendorCode)  reqFilter.vendorCode  = vendorCode;
  if (projectId)   reqFilter.projectId   = projectId;
  if (search) {
    reqFilter.$or = [
      { reqNo:       { $regex: search, $options: 'i' } },
      { vendorName:  { $regex: search, $options: 'i' } },
      { workOrderNo: { $regex: search, $options: 'i' } },
      { projectName: { $regex: search, $options: 'i' } },
    ];
  }
  const pendingRequests = isManualBillQueueCall ? [] : await BillRequest.find(reqFilter).sort({ createdAt: -1 }).lean();

  const STAGE_LABEL = { pending: 'Pending L1', 'pending-gm': 'Pending L2', 'pending-l3': 'Pending L3', 'pending-l4': 'Pending L4' };
  const requestRows = pendingRequests.map((r) => ({
    id: r._id,
    _id: r._id,
    billNo: r.reqNo,
    billType: 'bill_request',
    workOrderId: r.workOrderId,
    workOrderNo: r.workOrderNo,
    vendorCode: r.vendorCode,
    vendorName: r.vendorName,
    projectId: r.projectId,
    projectName: r.projectName,
    department: r.department,
    customDepartment: r.customDepartment,
    // Same per-line total convention as BillRequests/index.tsx's own list
    // (items[].amount when set, else rate*billedQty) — this is a request,
    // not yet a bill, so there's no RunningBill.amount to read instead.
    amount: (r.items || []).reduce((s, it) => s + (it.amount ?? (it.rate ?? 0) * it.billedQty), 0),
    lineItems: [],
    gstPercent: 0,
    manualApprovalStatus: undefined,
    // Re-purposed, same as the AdvanceSlip merge — the frontend distinguishes
    // this via billType === 'bill_request' and shows the approval stage
    // label instead of a RunningBill payment-stage status.
    status: STAGE_LABEL[r.status] || r.status,
    billDate: r.createdAt,
    createdAt: r.createdAt,
  }));

  const rows = [...bills, ...slipRows, ...requestRows].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  success(res, { bills: rows });
});

exports.getBill = asyncHandler(async (req, res) => {
  let query = RunningBill.findById(req.params.id);
  for (const f of POPULATE_FIELDS) query = query.populate(f, 'name role');
  query = query.populate('approvalHistory.by', 'name role');
  const bill = await query.lean();
  if (!bill) return notFound(res, 'Bill not found');
  success(res, { bill });
});

// Manual bill entry — no BillRequest needed. Lands at 'draft' just like an
// AGM-approved bill request does, so it still needs an L1 maker confirm before
// entering the checker/approver chain — a manually-typed bill has no BillRequest/
// AGM sign-off upstream, so it's the case that most needs that first checkpoint,
// not least.
exports.createBill = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  // A Mobilisation Advance raised as ADVANCE_FOR future billing is, by
  // definition, money paid out ahead of any work — there is no bill to
  // approve/verify/pay here at all, only an AdvanceSlip's own
  // outstanding/partial/recovered lifecycle (tracked entirely in Advance
  // Payments). Bypass the whole RunningBill/approval chain and create the
  // AdvanceSlip directly, exactly as the New Advance Slip form on the
  // Advance Payments page would (see advanceSlipController.createAdvanceSlip)
  // — every other billType/relationshipType combination, including
  // advance_mobilization WITHOUT ADVANCE_FOR, falls through to the normal
  // RunningBill path below untouched.
  if (req.body.billType === 'advance_mobilization' && req.body.relationshipType === 'ADVANCE_FOR') {
    if (!req.body.projectId) {
      return badRequest(res, 'Project is required for a mobilisation advance.');
    }
    if (!req.body.vendorCode) {
      return badRequest(res, 'Contractor/consultant is required.');
    }
    const advLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
    const advAmount = advLineItems.length
      ? advLineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0)
      : Number(req.body.amount) || 0;
    if (!(advAmount > 0)) {
      return badRequest(res, 'Advance amount must be a valid number greater than 0');
    }

    const slipNo = await nextCode('advanceSlipNo', 'ADV-', 4);
    const slip = await AdvanceSlip.create({
      slipNo,
      contractorCode: req.body.vendorCode,
      contractorName: req.body.vendorName,
      projectId:      req.body.projectId,
      projectName:    req.body.projectName,
      amount:         advAmount,
      date:           req.body.billDate || new Date(),
      reference:      req.body.contractorRefNo || undefined,
      notes:          req.body.remarks || 'Mobilisation advance raised via Billing → New Bill',
      createdBy:      req.user._id,
    });

    await logAudit({
      action: 'CREATE', module: 'advance-slips', user: req.user,
      description: `Advance slip ${slipNo} created for ${slip.contractorName || slip.contractorCode} (₹${Number(advAmount).toLocaleString('en-IN')}) via Billing → New Bill`,
      entityType: 'AdvanceSlip', entityId: slip._id, entityLabel: slip.slipNo,
    });

    return created(res, { advanceSlip: slip }, `Advance slip ${slipNo} created`);
  }

  const workOrder = req.body.workOrderId
    ? await WorkOrder.findById(req.body.workOrderId)
    : null;
  if (req.body.workOrderId && !workOrder) {
    return notFound(res, 'Work order not found');
  }
  if (workOrder && !isWorkOrderApproved(workOrder)) {
    return badRequest(res, `"${workOrder.workOrderNo}" has not completed its own approval chain yet (currently ${workOrder.approvalStatus}) — no bill can be raised against it until Final Approval is given.`);
  }

  // A bill with no work order has no company to inherit from, so the maker
  // must say up front which group company this bill is being raised through.
  let company = null;
  if (!workOrder) {
    if (!req.body.companyId) {
      return badRequest(res, 'Company is required for a bill that is not linked to a work order.');
    }
    company = await Company.findById(req.body.companyId);
    if (!company) return notFound(res, 'Company not found');
  }

  const lineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
  if (lineItems.length === 0) {
    return badRequest(res, 'At least one work item is required');
  }

  // This manual entry path bypasses the Bill Review checklist entirely, so any
  // line linked to a WO scope item must still respect that item's variance
  // sign-off — otherwise it's a silent backdoor around the whole review flow.
  if (workOrder) {
    for (const li of lineItems) {
      if (!li.scopeItemId) continue;
      const si = workOrder.scopeItems.id(li.scopeItemId);
      if (si && hasUnapprovedVarianceForLineItem(si, li.subItemId)) {
        return badRequest(res, `"${si.description}" has unapproved progress variance — approve it on the Bill Review page before billing.`);
      }
    }

    // SUPERSEDES: exclude the superseded bills' own billedQty from the
    // overbill check below for whichever scope items/particulars they
    // touched — those bills stay active (unlike REVISION_OF/CORRECTION_OF,
    // they're never marked isActive:false anymore) so without this a "final"
    // bill could never re-claim the full planned quantity, only whatever was
    // left after the bills it's meant to replace.
    let supersedeQtyMap = null;
    if (req.body.relationshipType === 'SUPERSEDES' && Array.isArray(req.body.linkedBills) && req.body.linkedBills.length) {
      const supersededIds = req.body.linkedBills.map((l) => l.billId).filter(Boolean);
      const supersededBills = await RunningBill.find({ _id: { $in: supersededIds } }).select('lineItems').lean();
      supersedeQtyMap = {};
      for (const sb of supersededBills) {
        for (const sli of sb.lineItems || []) {
          if (!sli.scopeItemId) continue;
          const key = sli.scopeItemId.toString() + (sli.subItemId ? '|' + sli.subItemId.toString() : '');
          supersedeQtyMap[key] = (supersedeQtyMap[key] || 0) + (Number(sli.billedQty) || 0);
        }
      }
    }

    // Hard-reject overbilling past a scope item's remaining unbilled qty —
    // cumulative across every bill ever raised against it, from either
    // billing path — instead of the old silent Math.min clamp further below.
    const overbilled = findOverbilledLineItem(workOrder, lineItems, supersedeQtyMap);
    if (overbilled) {
      const { si, remaining } = overbilled;
      return badRequest(res, `"${si.description}" — only ${remaining} ${si.unit || ''} remaining to bill (already billed ${si.lastBilledQty || 0} of ${si.plannedQty}).`);
    }
  }

  // Advance recovery decided at creation time — validate slip ownership up
  // front (before creating anything) so a mismatch fails cleanly with no
  // side effects, rather than after a bill/WO update has already landed.
  const recoveries = Array.isArray(req.body.advanceRecoveries) ? req.body.advanceRecoveries : [];
  const recoveryVendorCode = workOrder ? workOrder.vendorCode : req.body.vendorCode;
  if (recoveries.length) {
    const slips = await AdvanceSlip.find({ _id: { $in: recoveries.map(r => r.slipId).filter(Boolean) } }).select('contractorCode');
    const mismatch = slips.find(s => s.contractorCode !== recoveryVendorCode);
    if (mismatch) {
      return badRequest(res, `Advance slip ${mismatch._id} does not belong to this bill's contractor.`);
    }
  }

  const amount = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  // A manually-created bill doesn't earn its real "RA-####" bill number until
  // its own AGM/GM(/L3/L4) sign-off chain fully clears (manualApprovalStatus
  // reaches 'approved') — same principle as a BillRequest-originated bill,
  // which has no RunningBill/billNo at all until finalizeBillRequest. Until
  // then this field holds a "BR-####" placeholder from the SAME counter
  // BillRequest.reqNo uses (see codeGen.js's nextBillRequestReqNo), so that
  // number is never ambiguous with an unrelated real BillRequest. Each
  // manual*Approve handler below overwrites this with a real nextBillNo()
  // once its sign-off is the department's last required level.
  const billNo = await nextBillRequestReqNo();

  // Compute billingCycle for this WO
  const cycleCount = req.body.workOrderId
    ? await RunningBill.countDocuments({ workOrderId: req.body.workOrderId })
    : 0;

  // Build linkedBills with billNo enrichment
  const linkedBills = Array.isArray(req.body.linkedBills) ? req.body.linkedBills : [];

  // Who this bill's payment actually goes to — normally the work order's own
  // vendor, but a fellow Vendor Group member can be named instead (see
  // resolvePayee). req.body.vendorCode here is the frontend's "Pay To"
  // selection, not the WO's identity — that's always workOrder.vendorCode.
  const payee = workOrder
    ? await resolvePayee(workOrder.vendorCode, workOrder.vendorName, req.body.vendorCode)
    : { vendorCode: req.body.vendorCode, vendorName: req.body.vendorName };

  // Snapshotted from the WO's own paymentMilestones subdoc (embedded, not a
  // separate collection) at creation time — purely a display/reference tag,
  // doesn't feed into amount/GST/retention. `milestoneIds` (plural) lets more
  // than one be billed together (e.g. two consultancy stages clearing at
  // once); `milestoneId`/`milestoneStage` (singular) still get set to the
  // first one for any older code/UI that only reads those.
  const requestedMilestoneIds = Array.isArray(req.body.milestoneIds) && req.body.milestoneIds.length
    ? req.body.milestoneIds
    : (req.body.milestoneId ? [req.body.milestoneId] : []);
  const milestones = workOrder
    ? requestedMilestoneIds.map((id) => workOrder.paymentMilestones.id(id)).filter(Boolean)
    : [];
  const milestone = milestones[0] || null;

  // A milestone with no scope items linked to it (lineItems here carry no
  // scopeItemId) has no plannedQty/lastBilledQty to guard against double
  // billing — findOverbilledLineItem above only checks scope-item-linked
  // lines. So for that lump-sum case specifically, block raising a second
  // bill against the same milestone outright (one active bill per milestone).
  if (milestones.length && !lineItems.some((li) => li.scopeItemId)) {
    for (const m of milestones) {
      const alreadyBilled = await RunningBill.exists({
        workOrderId: workOrder._id,
        $or: [{ milestoneId: m._id }, { milestoneIds: m._id }],
        isActive: { $ne: false }, status: { $ne: 'rejected' },
      });
      if (alreadyBilled) {
        return badRequest(res, `"${m.stage || m.type || 'This milestone'}" has already been billed — a lump-sum milestone can only be billed once.`);
      }
    }
  }

  const bill = await RunningBill.create({
    ...req.body,
    billNo,
    amount,
    lineItems,
    linkedBills,
    billingCycle: cycleCount + 1,
    milestoneId:    milestone ? milestone._id : null,
    milestoneStage: milestone ? (milestone.stage || milestone.type || '') : '',
    milestoneIds:    milestones.map((m) => m._id),
    milestoneStages: milestones.map((m) => m.stage || m.type || ''),
    ...(workOrder ? {
      workOrderNo: workOrder.workOrderNo,
      projectId:   workOrder.projectId,
      projectName: workOrder.projectName,
      projectLocation: workOrder.projectLocation,
      companyName: workOrder.companyName,
    } : {
      companyId:   company._id,
      companyName: company.name,
    }),
    vendorCode:  payee.vendorCode,
    vendorName:  payee.vendorName,
    status:      'draft',
    // This is exactly the manual-entry path — unlike a progress-driven bill
    // (born already 'approved' here, having gone through BillRequest's own
    // AGM/GM sign-off before this document existed), it needs that same
    // sign-off now, before Accounts can verify it.
    manualApprovalStatus: 'pending',
    createdBy:   req.user._id,
  });

  // Auto-link: mark revised/corrected bills as inactive. SUPERSEDES
  // deliberately does NOT deactivate its linked bills anymore — those bills
  // stay fully active/untouched, and their amount is instead deducted from
  // THIS bill's own payable (see supersedeDeduction, computed by the
  // frontend and trusted from req.body same as retentionAmount/advanceRecovery).
  const deactivatingRelationships = ['REVISION_OF', 'CORRECTION_OF'];
  for (const link of linkedBills) {
    if (deactivatingRelationships.includes(link.relationshipType) && link.billId) {
      await RunningBill.findByIdAndUpdate(link.billId, {
        isActive:     false,
        supersededBy: bill._id,
      });
    }
  }

  // Update work order scope item progress (non-fatal) — the overbilling
  // check above already guarantees this addition stays within plannedQty
  // wherever one is set, so no clamp is needed here anymore.
  if (workOrder && lineItems.length > 0) {
    try {
      let changed = false;
      const touchedParents = new Set();
      for (const li of lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = workOrder.scopeItems.id(li.scopeItemId);
        if (!si) continue;
        const target = resolveBillableItem(si, li.subItemId);
        if (target) {
          target.lastBilledQty = (target.lastBilledQty || 0) + Number(li.billedQty);
          // A bill created directly here (bypassing DRI progress logging)
          // implies the billed work is actually done on site — otherwise it
          // wouldn't be billed — so billed qty is a floor on completed qty,
          // never lowering it if DRI progress already logged more.
          target.completedQty = Math.max(target.completedQty || 0, target.lastBilledQty);
          target.status = deriveStatus(target);
          if (li.subItemId) touchedParents.add(li.scopeItemId);
          changed = true;
        }
      }
      // Particulars drive their parent's own completedQty/status as a rollup —
      // recompute it for every scope item that had a particular billed here.
      for (const scopeItemId of touchedParents) {
        const si = workOrder.scopeItems.id(scopeItemId);
        if (si) recomputeParentFromSubItems(si);
      }
      if (changed) await workOrder.save();
    } catch (woErr) {
      console.error('Warning: could not update work order progress from bill:', woErr.message);
    }
  }

  // Apply the (already-validated) advance recoveries now that the bill
  // exists, real-time reducing the AdvanceSlip's own balance immediately —
  // same shape/helper as the late-stage submitPaymentDetails recovery, just
  // applied at creation instead of waiting for the bill to reach 'paid'.
  if (recoveries.length) {
    const applied = await applyAdvanceRecoveries(recoveries, { billNo: bill.billNo, releasedBy: req.user.name });
    bill.advanceRecovery = (bill.advanceRecovery || 0) + applied.reduce((sum, a) => sum + a.amount, 0);
    if (applied.length) await bill.save();
  }

  // A Mobilisation Advance bill raised as ADVANCE_FOR future billing is, by
  // definition, money paid out ahead of work done — the same thing an
  // Advance Slip already exists to track (outstanding balance, recoveries
  // against later bills). Auto-create one here instead of relying on
  // someone to remember to raise it separately from Advance Payments.
  // Non-fatal: a slip needs a projectId, which a standalone (no work order)
  // bill never has — skip silently rather than fail the bill itself over it.
  if (bill.billType === 'advance_mobilization' && bill.relationshipType === 'ADVANCE_FOR' && bill.projectId) {
    try {
      const slipNo = await nextCode('advanceSlipNo', 'ADV-', 4);
      const slip = await AdvanceSlip.create({
        slipNo,
        contractorCode: bill.vendorCode,
        contractorName: bill.vendorName,
        projectId:      bill.projectId,
        projectName:    bill.projectName,
        amount:         bill.amount,
        date:           bill.billDate,
        reference:      bill.billNo,
        notes:          `Auto-generated from Mobilisation Advance bill ${bill.billNo}`,
        createdBy:      req.user._id,
      });

      await logAudit({
        action: 'CREATE', module: 'advance-slips', user: req.user,
        description: `Advance slip ${slipNo} auto-created from bill ${bill.billNo} (₹${Number(bill.amount).toLocaleString('en-IN')})`,
        entityType: 'AdvanceSlip', entityId: slip._id, entityLabel: slip.slipNo,
      });
    } catch (advErr) {
      console.error('Warning: could not auto-create advance slip for bill', bill.billNo, advErr.message);
    }
  }

  await logAudit({
    action: 'CREATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} created`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  // This manual-entry path always starts manualApprovalStatus at 'pending'
  // (line 223 above) — a progress-driven bill (see billRequestController's
  // gmApprove) is born already past this and never reaches createBill at all.
  notifySlack('PAYMENT_MANUAL_AGM_APPROVAL', bill);
  if (workOrder) notifyContractLimitIfNear(workOrder);

  created(res, { bill }, 'Bill created — awaiting maker confirmation');
});

exports.updateBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['sent-to-tms', 'paid'].includes(bill.status)) {
    return badRequest(res, 'A bill already sent to TMS or paid cannot be edited');
  }

  // Guard against overbilling being reintroduced through an edit — this
  // route updates lineItems.billedQty without touching the WorkOrder's own
  // lastBilledQty (unlike createBill), so "remaining" here must be computed
  // net of whatever this same bill already contributed, not just plannedQty
  // minus the WO's current lastBilledQty.
  if (Array.isArray(req.body.lineItems) && bill.workOrderId) {
    const workOrder = await WorkOrder.findById(bill.workOrderId);
    if (workOrder) {
      const itemKey = (scopeItemId, subItemId) => `${scopeItemId}:${subItemId || ''}`;
      const priorQtyByItem = {};
      for (const li of bill.lineItems) {
        if (li.scopeItemId) {
          const k = itemKey(li.scopeItemId, li.subItemId);
          priorQtyByItem[k] = (priorQtyByItem[k] || 0) + (Number(li.billedQty) || 0);
        }
      }
      for (const li of req.body.lineItems) {
        if (!li.scopeItemId || !li.billedQty) continue;
        const si = workOrder.scopeItems.id(li.scopeItemId);
        if (!si) continue;
        const target = resolveBillableItem(si, li.subItemId);
        if (!target || !(target.plannedQty > 0)) continue;
        const prior = priorQtyByItem[itemKey(li.scopeItemId, li.subItemId)] || 0;
        const remaining = target.plannedQty - (target.lastBilledQty || 0) + prior;
        if (Number(li.billedQty) > remaining + 0.001) {
          return badRequest(res, `"${target.description}" — only ${remaining} ${target.unit || ''} remaining to bill (already billed ${(target.lastBilledQty || 0) - prior} of ${target.plannedQty} by other bills).`);
        }
      }
    }
  }

  const before = bill.toObject();
  Object.assign(bill, req.body);
  await bill.save();

  const changes = diffFields(before, bill.toObject(), Object.keys(req.body));
  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} updated`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    ...(changes ? { changes } : {}),
  });

  success(res, { bill }, 'Bill updated successfully');
});

// Verification — the single merged step (replaces the old separate Maker +
// Checker) that checks the bill against its work order and vendor details,
// and sets the one financial figure that stays in Accounts: TDS. Retention/
// Advance Recovery are NOT accepted here anymore — they're already set
// either at bill-creation time (createBill) or by AGM/GM during their own
// Site Progress approval (billRequestController.agmApprove/gmApprove).
exports.verifyBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'draft') {
    return badRequest(res, `Cannot verify a bill with status '${bill.status}'`);
  }
  if (bill.manualApprovalStatus !== 'approved') {
    return badRequest(res, `This bill needs AGM/GM sign-off on Bill Requests before it can be verified (currently ${bill.manualApprovalStatus === 'pending-gm' ? 'pending GM approval' : bill.manualApprovalStatus}).`);
  }

  const adjustmentAmount = req.body.adjustmentAmount != null ? Number(req.body.adjustmentAmount) : 0;
  if (adjustmentAmount !== 0 && !String(req.body.adjustmentRemark || '').trim()) {
    return badRequest(res, 'A remark is required when adjusting the net payable amount');
  }

  const before = { tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, adjustmentAmount: bill.adjustmentAmount };
  if (req.body.tdsPercent != null) bill.tdsPercent = Number(req.body.tdsPercent);
  if (req.body.tdsAmount  != null) bill.tdsAmount  = Number(req.body.tdsAmount);
  bill.adjustmentAmount = adjustmentAmount;
  bill.adjustmentRemark = adjustmentAmount !== 0 ? String(req.body.adjustmentRemark).trim() : '';
  const amountChanges = diffFields(before, { tdsPercent: bill.tdsPercent, tdsAmount: bill.tdsAmount, adjustmentAmount: bill.adjustmentAmount }, ['tdsPercent', 'tdsAmount', 'adjustmentAmount']);

  bill.status         = 'verify-done';
  bill.verificationBy = req.user._id;
  bill.verificationAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(
    bill, 'verify', 'done', req.user._id,
    adjustmentAmount !== 0
      ? `${req.body.remarks || ''} [Adjustment ${adjustmentAmount > 0 ? '+' : ''}₹${adjustmentAmount}: ${bill.adjustmentRemark}]`.trim()
      : req.body.remarks
  );
  await bill.save();
  await bill.populate('verificationBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'Verified');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: amountChanges
      ? `Verified bill ${bill.billNo} against its work order and set TDS`
      : `Verified bill ${bill.billNo} against its work order`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    ...(amountChanges ? { changes: amountChanges } : {}),
  });

  emitEvent('RUNNING_BILL_APPROVED', {
    projectId:    bill.projectId,
    workOrderId:  bill.workOrderId,
    workOrderNo:  bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:   bill.vendorCode,
    vendorName:   bill.vendorName,
    user:         req.user,
    metadata:     { billNo: bill.billNo, amount: bill.amount },
  });

  notifySlack('PAYMENT_L1_AGM_APPROVAL', bill);

  success(res, { bill }, 'Verified — ready for L1 AGM approval');
});

// ── Pre-Accounts AGM/GM sign-off for manually-created bills ─────────────
// Mirrors billRequestController's agmApprove/gmApprove/reject, just without
// re-deriving anything from a Work Order — a manual bill's amount/lineItems
// were already decided when it was created, so there's nothing to
// recompute here, only to sign off on.
exports.manualAgmApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!canActOnDepartment(req.user, bill)) return forbidden(res, 'This bill belongs to a different department.');
  if (bill.manualApprovalStatus !== 'pending') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }

  // Departments with no Approval Rule configured (Users → Departments) keep
  // today's exact behavior untouched.
  const approvalConfig = await getApprovalConfig(bill);
  if (!approverAllowed(req.user, approvalConfig, 'agm')) {
    return forbidden(res, "You're not configured as an L1 (AGM) approver for this department.");
  }

  // AGM can re-edit the hold/GST that were set when this bill was created —
  // advance recovery is deliberately NOT editable here: it's already been
  // applied against real AdvanceSlip balances at creation time (see
  // billController.createBill), and changing it here without also
  // reconciling those slips would desync the two.
  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  // Simple overwrite, same as the existing patchDeductions endpoint (used to
  // correct a paid bill) — not reconciled against any AdvanceSlip's own
  // amountRecovered/balance, consistent with that same existing precedent.
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    bill.gstPercent = gst;
  }

  bill.manualAgmApprovedBy = req.user._id;
  bill.manualAgmApprovedAt = new Date();
  if (req.body.sentForL2ApprovalTo) bill.sentForL2ApprovalTo = req.body.sentForL2ApprovalTo;
  pushHistory(bill, 'manual-agm', 'approved', req.user._id, req.body.remarks || '');

  // Single-approval department — AGM's own sign-off above is already final,
  // so finalize straight to 'approved' in one write. Never routes through
  // manualGmApproveHandler for this — that used to also stamp a phantom
  // bill.manualGmApprovedBy/'manual-gm' history entry onto this same AGM's
  // action, which is wrong for a department with no real L2 stage at all.
  const isFinal = approvalConfig?.requiredApprovals === 1;
  bill.manualApprovalStatus = isFinal ? 'approved' : 'pending-gm';
  // This department's chain ends here — swap the "BR-####" placeholder
  // (see createBill's own comment) for a real "RA-####" number now that the
  // sign-off chain is genuinely complete.
  if (isFinal) bill.billNo = await nextBillNo();
  await bill.save();
  await bill.populate('manualAgmApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: isFinal
      ? `L1 sign-off given on manually-created bill ${bill.billNo} — ready for Accounts to verify (single-approval department)`
      : `L1 sign-off given on manually-created bill ${bill.billNo} — moved to L2 approval`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack(isFinal ? 'PAYMENT_VERIFY_APPROVAL' : 'PAYMENT_MANUAL_GM_APPROVAL', bill);

  success(res, { bill }, isFinal ? 'Approved — ready for Accounts to verify' : 'L1 approved — moved to L2 approval');
});

// Plain named function (not directly exports.manualGmApprove) purely so its
// body reads the same way as the L3/L4 handlers below; asyncHandler wraps it
// for the actual route. For the default 2-level department this finalizes;
// a 3/4-level department instead moves on to L3.
async function manualGmApproveHandler(req, res) {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!canActOnDepartment(req.user, bill)) return forbidden(res, 'This bill belongs to a different department.');
  if (bill.manualApprovalStatus !== 'pending-gm') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }
  if (bill.manualAgmApprovedBy && bill.manualAgmApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L1 approver cannot also give L2 sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(bill);
  if (!approverAllowed(req.user, approvalConfig, 'gm')) {
    return forbidden(res, "You're not configured as an L2 (GM) approver for this department.");
  }

  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  // Simple overwrite, same as the existing patchDeductions endpoint (used to
  // correct a paid bill) — not reconciled against any AdvanceSlip's own
  // amountRecovered/balance, consistent with that same existing precedent.
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    bill.gstPercent = gst;
  }

  bill.manualGmApprovedBy = req.user._id;
  bill.manualGmApprovedAt = new Date();
  pushHistory(bill, 'manual-gm', 'approved', req.user._id, req.body.remarks || '');

  const totalLevels = approvalConfig?.requiredApprovals ?? 2;
  if (totalLevels >= 3) {
    bill.manualApprovalStatus = 'pending-l3';
    await bill.save();
    notifySlack('PAYMENT_MANUAL_L3_APPROVAL', bill);
    return success(res, { bill }, 'L2 approved — moved to L3 approval');
  }

  bill.manualApprovalStatus = 'approved';
  // Swap the "BR-####" placeholder for a real "RA-####" number now that this
  // department's (2-level) chain is genuinely complete.
  bill.billNo = await nextBillNo();
  await bill.save();
  await bill.populate('manualGmApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L2 sign-off given on manually-created bill ${bill.billNo} — ready for Accounts to verify`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_VERIFY_APPROVAL', bill);

  success(res, { bill }, 'L2 approved — ready for Accounts to verify');
}
exports.manualGmApprove = asyncHandler(manualGmApproveHandler);

// Only reached when this department is configured for 3/4 approval levels —
// a 2-level department's bill can never actually sit at 'pending-l3'.
async function manualL3ApproveHandler(req, res) {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!canActOnDepartment(req.user, bill)) return forbidden(res, 'This bill belongs to a different department.');
  if (bill.manualApprovalStatus !== 'pending-l3') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }
  if (bill.manualGmApprovedBy && bill.manualGmApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L2 approver cannot also give L3 sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(bill);
  if (!approverAllowed(req.user, approvalConfig, 'l3')) {
    return forbidden(res, "You're not configured as an L3 approver for this department.");
  }

  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  // Simple overwrite, same as the existing patchDeductions endpoint (used to
  // correct a paid bill) — not reconciled against any AdvanceSlip's own
  // amountRecovered/balance, consistent with that same existing precedent.
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    bill.gstPercent = gst;
  }

  bill.manualL3ApprovedBy = req.user._id;
  bill.manualL3ApprovedAt = new Date();
  pushHistory(bill, 'manual-l3', 'approved', req.user._id, req.body.remarks || '');

  const totalLevels = approvalConfig?.requiredApprovals ?? 2;
  if (totalLevels >= 4) {
    bill.manualApprovalStatus = 'pending-l4';
    await bill.save();
    notifySlack('PAYMENT_MANUAL_L4_APPROVAL', bill);
    return success(res, { bill }, 'L3 approved — moved to L4 approval');
  }

  bill.manualApprovalStatus = 'approved';
  // Swap the "BR-####" placeholder for a real "RA-####" number now that this
  // department's (3-level) chain is genuinely complete.
  bill.billNo = await nextBillNo();
  await bill.save();
  await bill.populate('manualL3ApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L3 sign-off given on manually-created bill ${bill.billNo} — ready for Accounts to verify`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_VERIFY_APPROVAL', bill);
  success(res, { bill }, 'L3 approved — ready for Accounts to verify');
}
exports.manualL3Approve = asyncHandler(manualL3ApproveHandler);

// Always the final stage (4 is the max configurable level today).
exports.manualL4Approve = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!canActOnDepartment(req.user, bill)) return forbidden(res, 'This bill belongs to a different department.');
  if (bill.manualApprovalStatus !== 'pending-l4') {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }
  if (bill.manualL3ApprovedBy && bill.manualL3ApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L3 approver cannot also give L4 sign-off — segregation of duties requires a different approver.');
  }

  const approvalConfig = await getApprovalConfig(bill);
  if (!approverAllowed(req.user, approvalConfig, 'l4')) {
    return forbidden(res, "You're not configured as an L4 approver for this department.");
  }

  if (req.body.retentionAmount != null) bill.retentionAmount = Number(req.body.retentionAmount);
  if (req.body.advanceRecovery != null) bill.advanceRecovery = Number(req.body.advanceRecovery);
  if (req.body.gstPercent != null) {
    const gst = Number(req.body.gstPercent);
    if (Number.isNaN(gst) || gst < 0 || gst > 100) return badRequest(res, 'GST% must be a number between 0 and 100');
    bill.gstPercent = gst;
  }

  bill.manualL4ApprovedBy = req.user._id;
  bill.manualL4ApprovedAt = new Date();
  bill.manualApprovalStatus = 'approved';
  // Always the department's last configurable level — swap the "BR-####"
  // placeholder for a real "RA-####" number now that the chain is complete.
  bill.billNo = await nextBillNo();
  pushHistory(bill, 'manual-l4', 'approved', req.user._id, req.body.remarks || '');
  await bill.save();
  await bill.populate('manualL4ApprovedBy', 'name role');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L4 sign-off given on manually-created bill ${bill.billNo} — ready for Accounts to verify`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_VERIFY_APPROVAL', bill);
  success(res, { bill }, 'L4 approved — ready for Accounts to verify');
});

exports.manualReject = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (!canActOnDepartment(req.user, bill)) return forbidden(res, 'This bill belongs to a different department.');
  const REJECTABLE_STAGES = { pending: 'manual-agm', 'pending-gm': 'manual-gm', 'pending-l3': 'manual-l3', 'pending-l4': 'manual-l4' };
  const rejectingStage = REJECTABLE_STAGES[bill.manualApprovalStatus];
  if (!rejectingStage) {
    return badRequest(res, `This bill's AGM/GM sign-off is already ${bill.manualApprovalStatus}`);
  }

  // Reject must be scoped to the SPECIFIC stage this manual bill is actually
  // sitting at — holding, say, gm-approve must not let someone reject a bill
  // that's pending-l3. Mirrors rejectBillRequest's REJECT_PERMISSION mapping;
  // the route-level authorizeAnyOr above is only a coarse first-pass gate.
  // Owner/accounts bypass everything; an explicit generic 'reject' grant is
  // kept as an escape hatch for whoever's turn it currently is.
  const REJECT_PERMISSION = { pending: 'agm-approve', 'pending-gm': 'gm-approve', 'pending-l3': 'l3-approve', 'pending-l4': 'l4-approve' };
  const requiredAction = REJECT_PERMISSION[bill.manualApprovalStatus];
  if (!can(req.user, 'bill-requests', requiredAction, 'owner', 'accounts') &&
      !can(req.user, 'bill-requests', 'reject', 'owner', 'accounts')) {
    return forbidden(res, `You do not have permission to reject a bill at its current stage (${bill.manualApprovalStatus}).`);
  }

  const reason = req.body.reason || 'No reason provided';

  // Roll back lastBilledQty for scope-linked line items — createBill already
  // added it at creation time (same as a BillRequest does), so a rejection
  // must undo it the same way rejectBillRequest does, or that quantity is
  // permanently locked out of ever being re-billed. Manual bills bypass DRI
  // progress logging entirely (see createBill's own comment), so there are
  // no progressEntries/billedInRequestId to invalidate here — only the
  // running lastBilledQty counter itself needs unwinding.
  const workOrder = bill.workOrderId ? await WorkOrder.findById(bill.workOrderId) : null;
  if (workOrder) {
    const touchedParents = new Set();
    for (const li of bill.lineItems) {
      if (!li.scopeItemId || !li.billedQty) continue;
      const si = workOrder.scopeItems.id(li.scopeItemId);
      if (!si) continue;
      const target = resolveBillableItem(si, li.subItemId);
      if (!target) continue;
      target.lastBilledQty = Math.max(0, (target.lastBilledQty || 0) - Number(li.billedQty));
      target.status = deriveStatus(target);
      if (li.subItemId) touchedParents.add(li.scopeItemId);
    }
    for (const scopeItemId of touchedParents) {
      const si = workOrder.scopeItems.id(scopeItemId);
      if (si) recomputeParentFromSubItems(si);
    }
    await workOrder.save();
  }

  // createBill applies any advance recovery immediately (real-time, not
  // deferred until the bill is actually paid — see applyAdvanceRecoveries'
  // own call site) — a bill rejected before ever being paid must have that
  // reversed, or the vendor's AdvanceSlip balance stays wrongly debited.
  if (bill.advanceRecovery) await reverseAdvanceRecoveries(bill.billNo);

  bill.manualApprovalStatus = 'rejected';
  bill.manualRejectedBy = req.user._id;
  bill.manualRejectReason = reason;
  // Terminal — same as a draft bill rejected in Accounts Payment (rejectBill
  // above); the advance-recovery debit and the scope-item quantity lock are
  // both rolled back above.
  bill.status = 'rejected';
  bill.rejectedBy = req.user._id;
  bill.rejectReason = reason;
  pushHistory(bill, rejectingStage, 'rejected', req.user._id, reason);
  await bill.save();

  await logAudit({
    action: 'REJECT', module: MODULE, user: req.user,
    description: `AGM/GM rejected manually-created bill ${bill.billNo} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
    .catch((err) => console.error('[slack] settle on manual reject failed', err.message));

  success(res, { bill }, 'Bill rejected');
});

// L1 AGM approval — pure approve-and-forward.
exports.l1AgmApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'verify-done') {
    return badRequest(res, `Cannot give L1 AGM approval for a bill with status '${bill.status}'`);
  }
  if (bill.verificationBy && bill.verificationBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'Whoever verified this bill cannot also give L1 AGM approval — segregation of duties requires a different approver.');
  }
  bill.status       = 'l1-approved';
  bill.l1ApprovedBy = req.user._id;
  bill.l1ApprovedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'l1-agm', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('l1ApprovedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'L1 AGM approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L1 AGM approved bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  notifySlack('PAYMENT_L2_GM_APPROVAL', bill);

  success(res, { bill }, 'L1 AGM approved — ready for L2 Director approval');
});

// L2 Director approval — the last internal sign-off. Pure DB write, no
// outbound network call, so an L2 approval never depends on TMS's
// availability/latency — sending to TMS is a deliberately separate action
// (sendToTms below), fired by the frontend right after a successful approval
// so it still feels like one click without coupling the two backend actions.
exports.l2DirectorApprove = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'l1-approved') {
    return badRequest(res, `Cannot give L2 Director approval for a bill with status '${bill.status}'`);
  }
  if (bill.l1ApprovedBy && bill.l1ApprovedBy.toString() === req.user._id.toString() && req.user.role !== 'owner') {
    return badRequest(res, 'The L1 AGM approver cannot also give L2 Director approval — segregation of duties requires a different approver.');
  }
  bill.status       = 'approved';
  bill.l2ApprovedBy = req.user._id;
  bill.l2ApprovedAt = new Date();
  if (req.body.remarks) bill.remarks = req.body.remarks;
  pushHistory(bill, 'l2-director', 'approved', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('l2ApprovedBy', 'name role');
  await advanceBillRequestInstance(bill, req.user._id, 'L2 Director approved');

  await logAudit({
    action: 'APPROVE', module: MODULE, user: req.user,
    description: `L2 Director approved bill ${bill.billNo} — ready to send to TMS`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'L2 Director approved — ready to send to TMS');
});

// Approver can pause a payment before it's irreversibly handed to TMS — e.g.
// a dispute with the vendor, budget timing, etc. Only reachable from
// 'approved' (the last stage this system still controls); resumes via
// releaseHold below. Once a bill reaches 'sent-to-tms' there is no lever
// left on this side to pause or recall it — see sendToTms.
exports.holdBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, `Cannot hold a bill with status '${bill.status}'`);
  }
  const reason = (req.body.reason || '').trim();
  if (!reason) return badRequest(res, 'A reason is required to hold a payment');

  bill.status     = 'hold';
  bill.holdBy     = req.user._id;
  bill.holdAt     = new Date();
  bill.holdReason = reason;
  pushHistory(bill, 'hold', 'held', req.user._id, reason);
  await bill.save();
  await bill.populate('holdBy', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Payment held for bill ${bill.billNo} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Payment held');
});

// Returns a held bill to 'approved' (ready to send, not auto-resent) —
// leaves holdBy/holdAt/holdReason in place as the historical record of the
// episode, doesn't null them out.
exports.releaseHold = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'hold') {
    return badRequest(res, `Cannot release a hold on a bill with status '${bill.status}'`);
  }
  bill.status         = 'approved';
  bill.holdReleasedBy  = req.user._id;
  bill.holdReleasedAt  = new Date();
  pushHistory(bill, 'hold', 'released-hold', req.user._id, req.body.remarks);
  await bill.save();
  await bill.populate('holdReleasedBy', 'name role');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Hold released on bill ${bill.billNo} — ready to send to TMS`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Hold released — ready to send to TMS');
});

// Hands the bill off to the external Transaction Management System as an
// outgoing payment instruction. Serves both the first send and manual
// retries after a failed attempt — same handler, same 'approved' precondition
// either way, since a failed send never moves status off 'approved'.
exports.sendToTms = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'approved') {
    return badRequest(res, `Cannot send a bill with status '${bill.status}' to TMS — it must be fully approved (L2 Director) first.`);
  }

  if (!TMS_INTEGRATION_ENABLED) {
    bill.status = 'paid';
    bill.tmsSentAt = new Date();
    bill.tmsCallbackReceivedAt = new Date();
    bill.paymentDate = bill.paymentDate || new Date();
    if (bill.paidAmount == null) bill.paidAmount = bill.amount;
    bill.tmsLastError = '';
    pushHistory(bill, 'tms-handoff', 'sent', req.user._id, req.body.remarks);
    pushHistory(bill, 'tms-callback', 'paid', req.user._id, 'TMS integration on hold — marked paid immediately');
    await bill.save();
    await advanceBillRequestInstance(bill, req.user._id, 'TMS integration on hold — marked paid immediately');

    const br = await BillRequest.findOne({ billId: bill._id });
    if (br && !br.milestoneAchieved) {
      br.milestoneAchieved = true;
      br.milestoneDate = bill.paymentDate;
      await br.save();
    }

    await logAudit({
      action: 'UPDATE', module: MODULE, user: req.user,
      description: `Bill ${bill.billNo} marked paid directly (TMS integration on hold)`,
      entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    });

    emitEvent('PAYMENT_RELEASED', {
      projectId: bill.projectId, workOrderId: bill.workOrderId, workOrderNo: bill.workOrderNo,
      runningBillId: bill._id, vendorCode: bill.vendorCode, vendorName: bill.vendorName,
      metadata: { billNo: bill.billNo, amount: bill.amount },
    });

    return success(res, { bill }, 'TMS integration is on hold — bill marked as paid directly');
  }

  const { sendBill } = require('../utils/tmsClient');
  bill.tmsSendAttempts = (bill.tmsSendAttempts || 0) + 1;
  bill.tmsLastAttemptAt = new Date();

  try {
    // bill.vendorCode is either a Contractor's vendorCode or a Consultant's
    // consultantCode (professional-services work orders) — both carry the
    // same bank-detail field names, so whichever collection matches is fine.
    const Contractor = require('../models/Contractor');
    const Consultant = require('../models/Consultant');
    const payee = bill.vendorCode
      ? (await Contractor.findOne({ vendorCode: bill.vendorCode })) || (await Consultant.findOne({ consultantCode: bill.vendorCode }))
      : null;
    await sendBill(bill, payee);
  } catch (err) {
    bill.tmsLastError = err.message || 'Failed to reach TMS';
    pushHistory(bill, 'tms-handoff', 'send-failed', req.user._id, bill.tmsLastError);
    await bill.save();
    await logAudit({
      action: 'UPDATE', module: MODULE, user: req.user,
      description: `Send-to-TMS failed for bill ${bill.billNo} (attempt ${bill.tmsSendAttempts}) — ${bill.tmsLastError}`,
      entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    });
    return badRequest(res, `Failed to send to TMS: ${bill.tmsLastError}`);
  }

  bill.status = 'sent-to-tms';
  bill.tmsSentAt = new Date();
  bill.tmsLastError = '';
  pushHistory(bill, 'tms-handoff', 'sent', req.user._id, req.body.remarks);
  await bill.save();
  await advanceBillRequestInstance(bill, req.user._id, 'Sent to TMS');

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} sent to TMS for payment`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Sent to TMS — awaiting payment confirmation');
});

// Called from the unauthenticated /api/webhooks/tms-callback route once TMS
// confirms a payment. Only the success path is implemented for now — a
// TMS-reported failure callback is explicitly out of scope for this phase.
exports.tmsCallback = asyncHandler(async (req, res) => {
  const { reference, status, utr, paymentMode, paymentBank, paymentDate, paidAmount } = req.body;
  if (!reference) return badRequest(res, 'reference (billNo) is required');
  if (status !== 'paid') return badRequest(res, `Unsupported callback status '${status}'`);

  const bill = await RunningBill.findOne({ billNo: reference });
  if (!bill) return notFound(res, `No bill found for reference '${reference}'`);

  if (bill.status === 'paid') {
    // Idempotent duplicate delivery — webhook redelivery is the norm, not
    // the exception, so a repeat of an already-applied callback is a no-op,
    // not an error.
    return success(res, { bill }, 'Already recorded as paid');
  }
  if (bill.status !== 'sent-to-tms') {
    return conflict(res, `Bill ${bill.billNo} is not awaiting a TMS callback (current status '${bill.status}')`);
  }

  bill.status = 'paid';
  if (utr)         bill.paymentUTR   = utr;
  if (paymentMode) bill.paymentMode  = paymentMode;
  if (paymentBank) bill.paymentBank  = paymentBank;
  if (paymentDate) bill.paymentDate  = new Date(paymentDate);
  if (paidAmount != null) bill.paidAmount = Number(paidAmount);
  bill.tmsCallbackReceivedAt = new Date();
  pushHistory(bill, 'tms-callback', 'paid', null, 'Confirmed paid by TMS');
  await bill.save();

  // Completes the final "Payment Released" stage on the linked BillRequest's
  // SLA instance — every OTHER stage transition above (verify/L1/L2/
  // sendToTms) already calls this; missing it here left every fully-paid
  // bill's instance stuck "in-progress" on this last stage forever, with its
  // overdue time growing indefinitely even though the bill was actually paid
  // (this is a webhook callback, not an authenticated user action, so there's
  // no req.user — completedBy is recorded as null, same as pushHistory above).
  await advanceBillRequestInstance(bill, null, 'TMS confirmed payment');

  const br = await BillRequest.findOne({ billId: bill._id });
  if (br && !br.milestoneAchieved) {
    br.milestoneAchieved = true;
    br.milestoneDate = bill.paymentDate || new Date();
    await br.save();
  }

  await logAudit({
    action: 'UPDATE', module: MODULE, user: { _id: null, name: 'TMS', role: 'system' },
    description: `TMS confirmed payment for bill ${bill.billNo}${bill.paidAmount != null ? ` — ₹${bill.paidAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} paid` : ''}${bill.paymentUTR ? ` (UTR ${bill.paymentUTR})` : ''}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  emitEvent('PAYMENT_RELEASED', {
    projectId:     bill.projectId,
    workOrderId:   bill.workOrderId,
    workOrderNo:   bill.workOrderNo,
    runningBillId: bill._id,
    vendorCode:    bill.vendorCode,
    vendorName:    bill.vendorName,
    metadata:      { billNo: bill.billNo, amount: bill.amount },
  });

  success(res, { bill }, 'Payment confirmed');
});

// Does this user hold the given module+action via the permission checklist —
// for the in-controller, status-dependent checks below, where the required
// permission isn't known until after the bill's current status is read, so
// the route-level authorizeOr/authorizeAnyOr gate has to stay broad.
function hasAction(user, module, action) {
  const perm = (user.permissions || []).find(p => p.module === module);
  return !!perm?.actions?.includes(action);
}

// Reject means two different things depending on where the bill currently
// sits. From 'draft' there's no prior actor to send it back to — that's the
// terminal "this bill was wrong from the start" case, which still triggers
// the full old behavior (BillRequest closed, WO lastBilledQty rolled back,
// progress entries auto-invalidated so they never silently re-enter a future
// bill). From every other in-flight status, reject is a **send-back** to the
// immediately preceding stage — the bill stays alive with the same
// lineItems/billedQty still validly attached, so none of those three
// terminal side-effects fire (freeing lastBilledQty here while the bill is
// still alive would let the same quantity get billed again elsewhere).
const REJECT_TARGET = {
  'verify-done':  { to: 'draft',        actions: ['verify'] },
  'l1-approved':  { to: 'verify-done',  actions: ['l1-agm-approve'] },
  'approved':     { to: 'l1-approved',  actions: ['l2-director-approve'] },
  // No entry for 'sent-to-tms' or beyond — once handed to TMS, this system
  // has no recall/reject action; TMS owns the bill fully from that point.
};

exports.rejectBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (['paid', 'rejected'].includes(bill.status)) {
    return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  }
  if (bill.status === 'hold') {
    return badRequest(res, 'Release the hold before rejecting or sending this bill back');
  }
  const reason = req.body.reason || 'No reason provided';

  if (bill.status === 'draft') {
    // Terminal kill — the only case with no prior stage to send back to. The
    // bill dies here, so both createBill-time effects must be unwound: the
    // scope-item quantity lock (lastBilledQty — every scope-linked bill gets
    // this regardless of whether it came via a BillRequest) and any advance
    // recovery already applied (real-time at creation, not deferred to
    // payment — see applyAdvanceRecoveries' own call site). Previously only
    // the BillRequest-linked lastBilledQty rollback existed here, and advance
    // recovery was never reversed at all — the same gap manualReject had.
    if (bill.workOrderId) {
      const wo = await WorkOrder.findById(bill.workOrderId);
      if (wo) {
        let changed = false;
        for (const li of bill.lineItems || []) {
          if (!li.scopeItemId || !li.billedQty) continue;
          const si = wo.scopeItems.id(li.scopeItemId);
          if (si) {
            si.lastBilledQty = Math.max(0, (si.lastBilledQty || 0) - Number(li.billedQty));
            changed = true;
          }
        }
        if (changed) await wo.save();
      }
    }
    if (bill.advanceRecovery) await reverseAdvanceRecoveries(bill.billNo);

    bill.status       = 'rejected';
    bill.rejectedBy   = req.user._id;
    bill.rejectReason = reason;
    pushHistory(bill, 'verify', 'sent-back', req.user._id, reason);
    await bill.save();
    await bill.populate('rejectedBy', 'name role');

    const br = await BillRequest.findOne({ billId: bill._id });
    if (br) {
      br.status = 'rejected';
      br.rejectReason = 'Bill rejected in Accounts Payment';
      await br.save();
      await cancelInstance('BillRequest', br._id, `Rejected: ${br.rejectReason}`);

      // A killed bill means the progress it was made from was wrong —
      // auto-invalidate those entries (reason = the rejection reason) rather
      // than just freeing them, so they stay visible as history but never
      // count toward progress/billing again. Only meaningful for a
      // BillRequest-linked bill — a plain manual bill's line items were
      // never tied to logged progress entries in the first place.
      if (bill.workOrderId) {
        const wo = await WorkOrder.findById(bill.workOrderId);
        if (wo) {
          let changed = false;
          for (const li of bill.lineItems || []) {
            if (!li.scopeItemId) continue;
            const si = wo.scopeItems.id(li.scopeItemId);
            if (si) {
              const sources = (si.subItems && si.subItems.length > 0) ? si.subItems : [si];
              for (const src of sources) {
                for (const entry of src.progressEntries) {
                  if (entry.billedInRequestId && String(entry.billedInRequestId) === String(br._id) && !entry.invalidated?.done) {
                    entry.invalidated = { done: true, by: req.user._id, at: new Date(), reason };
                    entry.billedInRequestId = null;
                  }
                }
              }
              recomputeAfterInvalidate(si);
              changed = true;
            }
          }
          if (changed) await wo.save();
        }
      }
    }

    await logAudit({
      action: 'REJECT', module: MODULE, user: req.user,
      description: `Rejected bill ${bill.billNo} — ${reason}`,
      entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    });

    settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
      .catch((err) => console.error('[slack] settle on reject failed', err.message));

    return success(res, { bill }, 'Bill rejected');
  }

  // Send-back — every other in-flight status.
  const target = REJECT_TARGET[bill.status];
  if (!target) return badRequest(res, `Cannot reject a bill with status '${bill.status}'`);
  if (!target.actions.some(a => hasAction(req.user, MODULE, a))) {
    return res.status(403).json({ message: `Role '${req.user.role}' does not have access to this action` });
  }

  const fromStatus = bill.status;
  bill.status = target.to;
  pushHistory(bill, target.actions[0], 'sent-back', req.user._id, reason);
  await bill.save();

  await logAudit({
    action: 'REJECT', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} sent back from ${fromStatus} to ${target.to} — ${reason}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  settleAllPendingForEntity(bill._id, { verb: 'Rejected', decidedByName: req.user.name })
    .catch((err) => console.error('[slack] settle on send-back failed', err.message));

  success(res, { bill }, `Sent back — ${reason}`);
});

// GET /api/bills/chain/:workOrderId — billing chain for a WO (all bills, sorted by cycle)
exports.getBillingChain = asyncHandler(async (req, res) => {
  const { workOrderId } = req.params;
  const bills = await RunningBill.find({ workOrderId })
    .populate('supersededBy', 'billNo billType')
    .populate('agmApprovedBy', 'name role')
    .populate('verificationBy', 'name role')
    .populate('l1ApprovedBy',   'name role')
    .populate('l2ApprovedBy',   'name role')
    .sort({ billingCycle: 1, createdAt: 1 })
    .lean();
  success(res, { bills });
});

// PATCH /api/bills/:id/deductions  — correct advance recovery / retention split on a paid bill
exports.patchDeductions = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  if (bill.status !== 'paid') return badRequest(res, 'Can only adjust deductions on paid bills');
  const before = { advanceRecovery: bill.advanceRecovery, retentionAmount: bill.retentionAmount };
  if (req.body.advanceRecovery != null) bill.advanceRecovery  = Number(req.body.advanceRecovery);
  if (req.body.retentionAmount  != null) bill.retentionAmount = Number(req.body.retentionAmount);
  await bill.save();

  const changes = diffFields(before, bill.toObject(), ['advanceRecovery', 'retentionAmount']);
  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Adjusted deductions on paid bill ${bill.billNo}`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
    changes,
  });

  success(res, { bill }, 'Deductions updated');
});

// ── Archive / Unarchive ────────────────────────────────────────
// Archiving a bill also archives its originating Bill Request (linked via BillRequest.billId).
exports.archiveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  bill.isArchived = true;
  bill.archivedAt = new Date();
  await bill.save();
  await BillRequest.updateMany({ billId: bill._id }, { isArchived: true, archivedAt: new Date() });

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} archived`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Bill archived');
});

exports.unarchiveBill = asyncHandler(async (req, res) => {
  const bill = await RunningBill.findById(req.params.id);
  if (!bill) return notFound(res, 'Bill not found');
  bill.isArchived = false;
  bill.archivedAt = null;
  await bill.save();
  await BillRequest.updateMany({ billId: bill._id }, { isArchived: false, archivedAt: null });

  await logAudit({
    action: 'UPDATE', module: MODULE, user: req.user,
    description: `Bill ${bill.billNo} unarchived`,
    entityType: 'RunningBill', entityId: bill._id, entityLabel: bill.billNo,
  });

  success(res, { bill }, 'Bill unarchived');
});

// PATCH /api/bills/archive-bulk  — body: { ids: string[] }
exports.archiveBillsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill id');
  await RunningBill.updateMany({ _id: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  await BillRequest.updateMany({ billId: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  success(res, {}, `${ids.length} bill(s) archived`);
});

// PATCH /api/bills/unarchive-bulk  — body: { ids: string[] }
exports.unarchiveBillsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one bill id');
  await RunningBill.updateMany({ _id: { $in: ids } }, { isArchived: false, archivedAt: null });
  await BillRequest.updateMany({ billId: { $in: ids } }, { isArchived: false, archivedAt: null });
  success(res, {}, `${ids.length} bill(s) unarchived`);
});

// GET /api/bill-requests/pending-summary
//
// Read-only rollup for the Daily Progress Report page's "Pending Bills"
// section — everything currently sitting in an approval queue, whether it's
// a BillRequest that never finalized (status pending/pending-gm/pending-l3/
// pending-l4) or a manually-entered bill still working through the same
// chain (RunningBill.manualApprovalStatus in that same set).
//
// Stage labels styled to match Drawing Request Status's "<Approver Action>
// (L<n>)" convention (see shared/constants/drawingRequestOptions.ts
// REVIEW_STATUS_LABEL) instead of the previous bare "L1"/"L2"/... — per
// BillRequest's own status comments: pending = awaiting L1 (AGM), pending-gm
// = awaiting L2 (GM), pending-l3/pending-l4 only apply to departments
// configured for 3/4 approval levels.
const PENDING_STAGE_LABEL = {
  pending: 'AGM Approval (L1)', 'pending-gm': 'GM Approval (L2)',
  'pending-l3': 'L3 Approval', 'pending-l4': 'L4 Approval',
};
function resolvePendingWith(status) {
  return PENDING_STAGE_LABEL[status] || 'Approved';
}

exports.getPendingBillsSummary = asyncHandler(async (req, res) => {
  const PENDING_STATUSES = ['pending', 'pending-gm', 'pending-l3', 'pending-l4'];

  const [pendingRequests, pendingManualBills] = await Promise.all([
    BillRequest.find({ status: { $in: PENDING_STATUSES }, isArchived: { $ne: true } })
      .select('reqNo projectName items status createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    RunningBill.find({ manualApprovalStatus: { $in: PENDING_STATUSES }, isArchived: { $ne: true } })
      .select('billNo projectName lineItems manualApprovalStatus createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const now = Date.now();

  const requestRows = pendingRequests.map((r) => ({
    id: r._id,
    billNo: r.reqNo,
    source: 'bill_request',
    description: r.items?.[0]?.description || '',
    project: r.projectName || '',
    createdAt: r.createdAt,
    daysPending: Math.max(0, Math.floor((now - new Date(r.createdAt).getTime()) / 86400000)),
    stage: resolvePendingWith(r.status),
  }));

  const manualBillRows = pendingManualBills.map((b) => ({
    id: b._id,
    billNo: b.billNo,
    source: 'manual_bill',
    description: b.lineItems?.[0]?.description || '',
    project: b.projectName || '',
    createdAt: b.createdAt,
    daysPending: Math.max(0, Math.floor((now - new Date(b.createdAt).getTime()) / 86400000)),
    stage: resolvePendingWith(b.manualApprovalStatus),
  }));

  const rows = [...requestRows, ...manualBillRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  success(res, { bills: rows });
});
