const mongoose     = require('mongoose');
const Project      = require('../models/Project');
const WorkOrder     = require('../models/WorkOrder');
const BillRequest   = require('../models/BillRequest');
const RunningBill   = require('../models/RunningBill');
const Contractor    = require('../models/Contractor');
const Consultant    = require('../models/Consultant');
const DrawingRequest = require('../models/DrawingRequest');
const asyncHandler  = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const { billFinancialsForBill } = require('../utils/billFinancials');
const {
  computeProjectStageInfo, buildProjectAlerts, stableAlertId, computeBudgetRiskForecast,
  daysSince, lastStatusChangeAt, HEALTH_THRESHOLDS, isWoApproved,
} = require('../utils/projectStageRules');

// Phase 1 (backend half) of the Projects Overview executive dashboard
// rebuild — bulk version of projectController.getProjectStats, generalized
// across every project matching the given filters (or one project, if
// `projectId` is given). Follows the same "fetch broad sets with a handful
// of .find() calls, then bucket in memory with Maps/reduce" pattern as
// dprController.getDPR — no aggregation pipelines used anywhere else in this
// codebase's financial rollups, so this doesn't introduce the first one.
//
// Deliberately NOT included yet (Phase 2/3 — no data model or rules exist
// for these): stageSummary, alerts, forecasts, paymentFlow, categories,
// contractorCategory, deepLinks. `stage` is accepted as a query param (so the
// eventual frontend can send it without a 400) but is a no-op — there is no
// stage concept anywhere in the data model yet.

// Thrown by buildExecutiveDashboardData for a genuinely bad request (invalid
// projectId, unknown project) — caught by each exported handler and turned
// into the same 400 response asyncHandler/badRequest already produced before
// this function was split out of the route handler, so its own signature
// stays a plain `(query) => payload` without needing an `res` passed in.
class BadRequestError extends Error {}

const isValidObjectId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
// Matches this codebase's existing "all" sentinel convention (see
// Frontend's useDPRData: `projectId !== "all"`) — an omitted, empty, or
// "all" filter value means "no filter", not "match nothing".
const isNoFilter = (v) => v === undefined || v === null || v === '' || v === 'all';

// Returns `undefined` (valid, unset), a Date (valid, set), or `null`
// (present but unparseable — caller should warn and ignore it, not 400,
// since a single bad date on an otherwise-fine request shouldn't nuke the
// whole dashboard).
function tryParseDate(input) {
  if (isNoFilter(input)) return undefined;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Phase 3: reconciliation warnings ────────────────────────────────────
// Internal-consistency check for ONE project row, using only fields already
// computed for it — never re-queries anything. Flags real, honest
// contradictions grounded in this codebase's own field semantics (see
// Backend/src/utils/billFinancials.js and the rollup above):
//   - paidAmount is the sum of `netPayable` for bills with status 'paid'.
//   - certifiedNet is the sum of `netAfterHold` for bills with status
//     'approved' OR 'paid' (i.e. certifiedNet already INCLUDES paid bills'
//     netAfterHold). netPayable === netAfterHold - tdsAmount + adjustment,
//     so paidAmount can legitimately be a little below the paid bills' share
//     of certifiedNet (TDS/adjustment), but paidAmount being GREATER than
//     certifiedNet is never legitimate — every paid bill is itself certified,
//     so certifiedNet can only be >= the certified-and-paid subset, which is
//     >= paidAmount, modulo the tdsAmount/adjustment components which only
//     ever make netPayable <= netAfterHold... except adjustmentAmount is
//     signed and could push netPayable slightly above netAfterHold for a
//     single bill. A project-wide gap of more than a token rounding amount
//     is still worth a human look, so this uses a small absolute tolerance
//     (₹1, to absorb round2() paise noise) rather than 0.
//   - remainingContract is defined above as
//     Math.max(0, awardedContractValue - paidAmount) — NOT
//     awardedContractValue - billedGross - remainingContract, so there is no
//     "remainingContract + billedGross should equal awardedContractValue"
//     relationship in this code's own logic (billedGross is gross billed,
//     not paid — the two are never meant to sum to the contract value). The
//     only honest cross-check on remainingContract's own definition is that
//     paidAmount should never exceed awardedContractValue (remainingContract
//     is clamped to 0 via Math.max, which silently hides an over-payment
//     rather than surfacing it) — so that clamping-triggered case is flagged
//     instead.
const RECONCILIATION_TOLERANCE = 1; // ₹1 — absorbs round2() paise-level noise, not a real threshold

function checkProjectReconciliation(row) {
  const warnings = [];
  const { code, paidAmount, certifiedNet, awardedContractValue } = row;

  if (paidAmount - certifiedNet > RECONCILIATION_TOLERANCE) {
    warnings.push(
      `Project ${code}: paidAmount (₹${Math.round(paidAmount).toLocaleString('en-IN')}) exceeds certifiedNet (₹${Math.round(certifiedNet).toLocaleString('en-IN')}) by ₹${Math.round(paidAmount - certifiedNet).toLocaleString('en-IN')} — check RunningBill records.`
    );
  }

  if (awardedContractValue > 0 && paidAmount - awardedContractValue > RECONCILIATION_TOLERANCE) {
    warnings.push(
      `Project ${code}: paidAmount (₹${Math.round(paidAmount).toLocaleString('en-IN')}) exceeds awardedContractValue (₹${Math.round(awardedContractValue).toLocaleString('en-IN')}) by ₹${Math.round(paidAmount - awardedContractValue).toLocaleString('en-IN')} — remainingContract is being clamped to 0, check WorkOrder contract values and RunningBill records.`
    );
  }

  return warnings;
}

const CERTIFIED_BILL_STATUSES_SHARED = ['approved', 'paid'];

// Shared vendor-name resolution + per-WorkOrder financial/status rollup —
// used by BOTH the capped top-10 `contractorsByCategory` list on /executive
// AND the uncapped /executive/contractor-matrix endpoint, so the
// vendorCode->name resolution and the Healthy/Attention/Pending/Critical
// status thresholds can't drift between the two. Returns one row per
// WorkOrder (not yet grouped/capped) — callers decide how to group/cap.
async function buildContractorCategoryRows(workOrders, runningBills, projects) {
  // Joined against whichever of Contractor/Consultant collection actually
  // owns that vendorCode (contractType === 'professional-services' resolves
  // against Consultant, everything else against Contractor — see
  // WorkOrder.vendorCode's own model comment). Scoped to only the
  // vendorCodes present in the given work-order set, not a full-table fetch.
  const professionalWoVendorCodes = new Set();
  const executionWoVendorCodes = new Set();
  for (const wo of workOrders) {
    if (!wo.vendorCode) continue;
    if (wo.contractType === 'professional-services') professionalWoVendorCodes.add(wo.vendorCode);
    else executionWoVendorCodes.add(wo.vendorCode);
  }
  const [consultantDocs, contractorDocs] = await Promise.all([
    professionalWoVendorCodes.size
      ? Consultant.find({ consultantCode: { $in: [...professionalWoVendorCodes] } }).select('consultantCode firmName').lean()
      : Promise.resolve([]),
    executionWoVendorCodes.size
      ? Contractor.find({ vendorCode: { $in: [...executionWoVendorCodes] } }).select('vendorCode companyName').lean()
      : Promise.resolve([]),
  ]);
  const consultantNameByCode = new Map(consultantDocs.map(c => [c.consultantCode, c.firmName]));
  const contractorNameByCode = new Map(contractorDocs.map(c => [c.vendorCode, c.companyName]));
  function resolveVendorName(wo) {
    if (wo.contractType === 'professional-services') {
      return consultantNameByCode.get(wo.vendorCode) || wo.vendorName || wo.vendorCode;
    }
    return contractorNameByCode.get(wo.vendorCode) || wo.vendorName || wo.vendorCode;
  }

  const projectNameById = new Map(projects.map(p => [String(p._id), p.name]));
  const rbByWorkOrder = new Map();
  for (const b of runningBills) {
    if (!b.workOrderId) continue;
    const key = String(b.workOrderId);
    if (!rbByWorkOrder.has(key)) rbByWorkOrder.set(key, []);
    rbByWorkOrder.get(key).push(b);
  }

  // Reuse the exact same certified-unpaid-age Attention/Critical thresholds
  // projectStageRules.js already applies at the project level (see
  // HEALTH_THRESHOLDS above), rather than inventing new ones for this table.
  return workOrders.map(wo => {
    const bills = rbByWorkOrder.get(String(wo._id)) || [];
    const paidBills = bills.filter(b => b.status === 'paid');
    const certifiedBills = bills.filter(b => CERTIFIED_BILL_STATUSES_SHARED.includes(b.status));
    const paid = paidBills.reduce((s, b) => s + billFinancialsForBill(b).netPayable, 0);
    const certifiedNet = certifiedBills.reduce((s, b) => s + billFinancialsForBill(b).netAfterHold, 0);
    const contractValue = wo.contractValue || 0;
    const pending = Math.max(0, certifiedNet - paid);

    // No bills raised yet, or bills raised but nothing certified/paid so far
    // (e.g. still sitting in draft/verify-done) — nothing to judge health on
    // yet, so this is "Pending" rather than a default "Healthy".
    let status;
    if (bills.length === 0 || (paid === 0 && certifiedNet === 0)) {
      status = 'Pending';
    } else if (contractValue > 0 && paid / contractValue >= 0.9) {
      status = 'Healthy';
    } else if (pending > 0) {
      const oldestUnpaidDays = certifiedBills.length
        ? Math.max(...certifiedBills.map(b => daysSince(lastStatusChangeAt(b)) ?? 0))
        : 0;
      status = oldestUnpaidDays >= HEALTH_THRESHOLDS.certifiedUnpaidCriticalDays ? 'Critical' : 'Attention';
    } else {
      status = 'Healthy';
    }

    return {
      contractorCode: wo.vendorCode || '',
      contractor: resolveVendorName(wo),
      category: wo.category || 'Uncategorized',
      project: projectNameById.get(String(wo.projectId)) || wo.projectName || '',
      projectId: wo.projectId ? String(wo.projectId) : '',
      contractValue,
      paid: Math.round(paid),
      pending: Math.round(pending),
      status,
    };
  });
}

// Shared row-building logic used by both the JSON /executive handler and the
// CSV export handler below — resolves the project set + fetches/buckets
// WorkOrders/RunningBills/BillRequests, then computes the same per-project
// rollup (financials, stage/health/bottleneck, alerts, forecasts,
// reconciliation warnings) either handler needs. Returns everything the JSON
// response assembles today, so getExecutiveDashboard itself stays a thin
// wrapper that just shapes the final `success(res, ...)` payload.
async function buildExecutiveDashboardData(query) {
  const { projectId, stage, categoryId, contractorId, from, to } = query;
  const dataWarnings = [];

  // ── Validate query params ──────────────────────────────────────────────
  if (!isNoFilter(projectId) && !isValidObjectId(projectId)) {
    throw new BadRequestError(`Invalid projectId: ${projectId}`);
  }
  // No stage concept exists in the data model yet (that's Phase 2's job —
  // bottleneck/health/stage rules). Accepted so the frontend can wire the
  // filter control up early without a 400; silently no-op'd, unless a real
  // (non-"all") value was actually sent, in which case the caller should
  // know it did nothing.
  if (!isNoFilter(stage)) {
    dataWarnings.push(`'stage' filtering is not implemented yet (Phase 2) — '${stage}' was ignored.`);
  }

  let fromDate, toDate;
  if (!isNoFilter(from)) {
    fromDate = tryParseDate(from);
    if (fromDate === null) { dataWarnings.push(`Invalid 'from' date: '${from}' — ignored.`); fromDate = undefined; }
  }
  if (!isNoFilter(to)) {
    toDate = tryParseDate(to);
    if (toDate === null) { dataWarnings.push(`Invalid 'to' date: '${to}' — ignored.`); toDate = undefined; }
  }

  // ── Resolve the project set ─────────────────────────────────────────────
  // categoryId/contractorId narrow which WorkOrders/RunningBills/BillRequests
  // count towards each project's numbers (see below) — they do NOT drop a
  // project out of the `projects` list entirely, so e.g. filtering by a
  // category still shows every active project, just with zeroed-out figures
  // for the ones with no work in that category. `projectId` is the only
  // filter that actually narrows the project LIST itself.
  const projectFilter = {};
  if (!isNoFilter(projectId)) projectFilter._id = projectId;

  const projects = await Project.find(projectFilter).sort({ createdAt: -1 }).lean();
  if (!isNoFilter(projectId) && projects.length === 0) {
    throw new BadRequestError(`Project not found: ${projectId}`);
  }
  const projectIds = projects.map(p => p._id);

  // ── Fetch everything for the filtered project set in a handful of
  // queries, then bucket in memory by projectId — avoids an N+1 await-per-
  // project loop. ──────────────────────────────────────────────────────────
  const woFilter = { projectId: { $in: projectIds } };
  // Category is joined by STRING NAME equality (WorkOrder.category ===
  // Category.name) — there is no categoryId field on WorkOrder. The query
  // param is named categoryId only to match the frontend spec's naming; it's
  // actually matched against the category NAME.
  if (!isNoFilter(categoryId)) woFilter.category = categoryId;
  // contractorId is a vendorCode (WorkOrder/RunningBill both store the same
  // string whether it resolves to a Contractor or a Consultant record — see
  // WorkOrder.vendorCode's own comment), not a Mongo ObjectId, so it's used
  // as a plain string-equality filter, not validated as an ObjectId.
  if (!isNoFilter(contractorId)) woFilter.vendorCode = contractorId;

  // Explicit field projection — WorkOrder.documents stores uploaded files as
  // base64 data URIs (see WorkOrder.js's `documents` field); a handful of
  // real work orders carry multi-megabyte PDFs there, which turned a normal
  // ~230-doc fetch into a 90+ second query once transferred over the wire
  // for every dashboard load, even though this rollup never reads
  // `documents`. Excluding it (and every other field this file never
  // touches) keeps the query to just what's actually used below.
  const workOrders = await WorkOrder.find(woFilter)
    .select('projectId contractValue scopeItems vendorCode vendorName contractType category approvalStatus workOrderNo issueDate approvalHistory createdAt updatedAt status')
    .lean();
  const woIds = workOrders.map(w => w._id);

  // RunningBill has no category of its own (only its WorkOrder does), so a
  // categoryId filter can only be honored by scoping bills to the
  // already-category-filtered work-order set above — which also means a
  // standalone bill (billController.createBill can raise one with no
  // workOrderId at all) is excluded whenever categoryId is active, since it
  // has no category to match. contractorId, by contrast, IS a field on
  // RunningBill itself, so it's applied directly and still catches
  // standalone bills for that vendor.
  const rbFilter = {};
  if (!isNoFilter(categoryId)) {
    rbFilter.workOrderId = { $in: woIds };
    dataWarnings.push('categoryId filter excludes any standalone bill (no linked work order), since those carry no category to match against.');
  } else {
    rbFilter.projectId = { $in: projectIds };
  }
  if (!isNoFilter(contractorId)) rbFilter.vendorCode = contractorId;
  if (fromDate || toDate) {
    rbFilter.billDate = {};
    if (fromDate) rbFilter.billDate.$gte = fromDate;
    if (toDate) rbFilter.billDate.$lte = toDate;
    dataWarnings.push("'from'/'to' scope RunningBills by billDate only — Work Orders and Bill Requests are not date-filtered (no single natural date field to scope them by for this rollup yet).");
  }

  const [runningBills, billRequests] = await Promise.all([
    RunningBill.find(rbFilter).lean(),
    woIds.length ? BillRequest.find({ workOrderId: { $in: woIds } }).lean() : Promise.resolve([]),
  ]);

  // ── Bucket WorkOrders/RunningBills/BillRequests by projectId ────────────
  const woByProject = new Map();
  for (const w of workOrders) {
    const key = String(w.projectId);
    if (!woByProject.has(key)) woByProject.set(key, []);
    woByProject.get(key).push(w);
  }
  const rbByProject = new Map();
  for (const b of runningBills) {
    if (!b.projectId) continue; // standalone bill with no project link — excluded from any per-project rollup
    const key = String(b.projectId);
    if (!rbByProject.has(key)) rbByProject.set(key, []);
    rbByProject.get(key).push(b);
  }
  const brByProject = new Map();
  for (const br of billRequests) {
    const key = String(br.projectId || '');
    if (!key) continue;
    if (!brByProject.has(key)) brByProject.set(key, []);
    brByProject.get(key).push(br);
  }

  const PENDING_BILL_REQ_STATUSES = ['pending', 'pending-gm', 'pending-l3', 'pending-l4'];
  const CERTIFIED_BILL_STATUSES   = ['approved', 'paid'];
  const CLOSED_BILL_STATUSES      = ['approved', 'paid', 'rejected'];

  // ── Per-project rollup — same fields projectController.getProjectStats
  // computes for one project, generalized across the filtered set. ────────
  const projectRows = projects.map(project => {
    const key = String(project._id);
    const wos = woByProject.get(key) || [];
    const bills = rbByProject.get(key) || [];
    const billReqs = brByProject.get(key) || [];

    const awardedContractValue = wos.reduce((s, w) => s + (w.contractValue || 0), 0);

    let workExecutedValue = 0;
    let totalPlannedQty   = 0;
    let totalCompletedQty = 0;
    for (const wo of wos) {
      for (const si of wo.scopeItems || []) {
        const planned   = si.plannedQty   || 0;
        const completed = si.completedQty || 0;
        const rate      = si.rate         || 0;
        workExecutedValue += completed * rate;
        totalPlannedQty   += planned;
        totalCompletedQty += completed;
      }
    }

    const billedGross    = bills.reduce((s, b) => s + (b.amount || 0), 0);
    const certifiedBills = bills.filter(b => CERTIFIED_BILL_STATUSES.includes(b.status));
    const certifiedNet   = certifiedBills.reduce((s, b) => s + billFinancialsForBill(b).netAfterHold, 0);
    const paidBills      = bills.filter(b => b.status === 'paid');
    const paidAmount     = paidBills.reduce((s, b) => s + billFinancialsForBill(b).netPayable, 0);

    const pendingBillReqs = billReqs.filter(b => PENDING_BILL_REQ_STATUSES.includes(b.status)).length;
    const openBills       = bills.filter(b => !CLOSED_BILL_STATUSES.includes(b.status)).length;
    const activeVendors   = new Set(wos.map(w => w.vendorCode).filter(Boolean)).size;
    const progress         = totalPlannedQty > 0
      ? Math.min(100, Math.round((totalCompletedQty / totalPlannedQty) * 100))
      : 0;

    const financials = { workExecutedValue, billedGross, certifiedNet, paidAmount };
    const { overallStage, bottleneck, health, healthReasons } = computeProjectStageInfo({
      project, wos, bills, billReqs, financials,
    });

    return {
      projectId:   key,
      code:        project.code,
      name:        project.name,
      status:      project.status,
      awardedContractValue,
      workExecutedValue,
      billedGross,
      certifiedNet,
      paidAmount,
      remainingContract: Math.max(0, awardedContractValue - paidAmount),
      progress,
      pendingBillReqs,
      openBills,
      activeVendors,
      // ── Phase 2 additions (see Backend/src/utils/projectStageRules.js for
      // exact rules/precedence/thresholds) ────────────────────────────────
      overallStage,
      bottleneck,
      health,
      healthReasons,
      // Kept alongside the row for alert-building below, then stripped before
      // the response goes out (not part of the documented row shape).
      __wos: wos, __bills: bills, __billReqs: billReqs, __project: project, __financials: financials,
    };
  });

  // ── Top-level KPIs, aggregated across the filtered project set ──────────
  const kpis = {
    activeProjects:    projects.filter(p => p.status === 'active').length,
    totalContractValue: projectRows.reduce((s, p) => s + p.awardedContractValue, 0),
    workExecuted:       projectRows.reduce((s, p) => s + p.workExecutedValue, 0),
    totalBilled:         projectRows.reduce((s, p) => s + p.billedGross, 0),
    // Sum of certifiedNet (see checkProjectReconciliation's comment above for
    // exactly what certifiedNet means) across every project in the filtered
    // set — same basis as forecasts.cashRequirement below, just as a
    // top-level KPI for the Contract-to-Payment Flow visual.
    totalCertified:      projectRows.reduce((s, p) => s + p.certifiedNet, 0),
    totalPaid:            projectRows.reduce((s, p) => s + p.paidAmount, 0),
    pendingApprovals:    projectRows.reduce((s, p) => s + p.pendingBillReqs, 0),
    // Certified but not yet paid, across every project in the filtered set —
    // same basis as forecasts.cashRequirement.totalCertifiedUnpaid (kept as
    // its own top-level KPI so the summary cards don't need to reach into
    // forecasts for it).
    outstandingAmount:   Math.round(projectRows.reduce((s, p) => s + Math.max(0, p.certifiedNet - p.paidAmount), 0)),
  };
  // Overdue = certified (status 'approved') but unpaid AND aged past the
  // same certifiedUnpaidAttentionDays threshold projectStageRules.js already
  // uses for health/bottleneck ("Attention" territory) — not a new policy,
  // just applied here as a KPI total instead of a per-project reason string.
  kpis.overdueAmount = Math.round(
    runningBills
      .filter(b => b.status === 'approved')
      .filter(b => {
        const days = daysSince(lastStatusChangeAt(b));
        return days !== null && days >= HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays;
      })
      .reduce((s, b) => s + billFinancialsForBill(b).netAfterHold, 0)
  );

  // ── Project Stage Summary — counts actual WORK ORDERS (the real,
  // filterable records users create/track — matches what shows up e.g. on
  // Work Items), not projects. Each WorkOrder is run through the exact same
  // stage rules as a project (Backend/src/utils/projectStageRules.js),
  // scoped to ONLY that work order's own bills/bill-requests — a WO whose
  // own bills are still open is "Billing" even if a sibling WO on the same
  // project has already moved on, since each WO tracks its own billing
  // lifecycle independently. Every WorkOrder in the filtered set counts
  // toward exactly one stage bucket (even "Completed", which the funnel
  // strip doesn't render — the frontend just ignores stages it doesn't
  // show), so none silently vanish from the counts and the total always
  // equals workOrders.length.
  const STAGE_ORDER = ['Planning', 'Work Orders Issued', 'Work in Progress', 'Billing', 'Payment Pending', 'Completed'];
  const stageCounts = new Map(STAGE_ORDER.map(s => [s, 0]));
  const projectById = new Map(projects.map(p => [String(p._id), p]));
  const rbByWorkOrder = new Map();
  for (const b of runningBills) {
    if (!b.workOrderId) continue;
    const key = String(b.workOrderId);
    if (!rbByWorkOrder.has(key)) rbByWorkOrder.set(key, []);
    rbByWorkOrder.get(key).push(b);
  }
  const brByWorkOrder = new Map();
  for (const br of billRequests) {
    if (!br.workOrderId) continue;
    const key = String(br.workOrderId);
    if (!brByWorkOrder.has(key)) brByWorkOrder.set(key, []);
    brByWorkOrder.get(key).push(br);
  }
  for (const wo of workOrders) {
    const woKey = String(wo._id);
    const woBills = rbByWorkOrder.get(woKey) || [];
    const woBillReqs = brByWorkOrder.get(woKey) || [];

    let woWorkExecutedValue = 0;
    for (const si of wo.scopeItems || []) {
      woWorkExecutedValue += (si.completedQty || 0) * (si.rate || 0);
    }
    const woBilledGross    = woBills.reduce((s, b) => s + (b.amount || 0), 0);
    const woCertifiedBills = woBills.filter(b => CERTIFIED_BILL_STATUSES.includes(b.status));
    const woCertifiedNet   = woCertifiedBills.reduce((s, b) => s + billFinancialsForBill(b).netAfterHold, 0);
    const woPaidBills      = woBills.filter(b => b.status === 'paid');
    const woPaidAmount     = woPaidBills.reduce((s, b) => s + billFinancialsForBill(b).netPayable, 0);

    const { overallStage: woStage } = computeProjectStageInfo({
      project: projectById.get(String(wo.projectId)),
      wos: [wo],
      bills: woBills,
      billReqs: woBillReqs,
      financials: {
        workExecutedValue: woWorkExecutedValue,
        billedGross: woBilledGross,
        certifiedNet: woCertifiedNet,
        paidAmount: woPaidAmount,
      },
    });
    stageCounts.set(woStage, (stageCounts.get(woStage) || 0) + 1);
  }
  // stageCounts above is EXCLUSIVE — each WorkOrder counted once, at the
  // single furthest stage it has reached. The funnel strip, though, reads as
  // a cumulative pipeline (its own chevron-linked visual literally says
  // Planning > Issued > In Progress > Billing > Payment Pending): "Work
  // Orders Issued" is meant to show every WO that has AT LEAST been issued
  // (i.e. every approved WO, whether or not it has since moved on to WIP/
  // Billing/etc further right), not only the sliver still sitting there with
  // nothing else having happened yet. So each bucket is turned into a
  // running total of itself plus every stage after it in STAGE_ORDER —
  // "Planning" (index 0) therefore always equals the full WorkOrder count,
  // since every WO has passed through at least that point.
  const cumulativeStageCounts = new Map();
  let runningTotal = 0;
  for (let i = STAGE_ORDER.length - 1; i >= 0; i--) {
    runningTotal += stageCounts.get(STAGE_ORDER[i]) || 0;
    cumulativeStageCounts.set(STAGE_ORDER[i], runningTotal);
  }
  // "Payment Pending" is the one exception to the "cumulative = reached
  // this stage or later" rule above: computeOverallStage's Completed branch
  // can be reached directly from Billing (once certifiedNet === paidAmount
  // the moment it's certified) WITHOUT ever passing through a
  // certifiedNet > paidAmount gap — i.e. a Completed work order is not
  // guaranteed to have ever been "Payment Pending". Folding Completed's
  // count into Payment Pending would therefore count fully-paid, nothing-
  // outstanding work orders as still awaiting payment, inflating the number
  // past the real amount actually pending. Payment Pending's cumulative is
  // its own exclusive count only — nothing after it in STAGE_ORDER is safe
  // to assume it passed through.
  cumulativeStageCounts.set('Payment Pending', stageCounts.get('Payment Pending') || 0);
  const stageSummary = STAGE_ORDER.map(stage => ({ stage, count: cumulativeStageCounts.get(stage) || 0 }));

  // ── Spend by Category — group billedGross (RunningBill.amount, same basis
  // as kpis.totalBilled/project.billedGross above) by WorkOrder.category, the
  // exact string field categoryId is already matched against earlier in this
  // function. A bill with no linked work order (or a work order with a blank
  // category) is bucketed under 'Uncategorized' rather than silently dropped,
  // so categorySpend's total always reconciles with kpis.totalBilled.
  const woById = new Map(workOrders.map(w => [String(w._id), w]));
  const categoryTotals = new Map();
  for (const b of runningBills) {
    const wo = b.workOrderId ? woById.get(String(b.workOrderId)) : null;
    const cat = (wo && wo.category) ? wo.category : 'Uncategorized';
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + (b.amount || 0));
  }
  const categorySpendTotal = [...categoryTotals.values()].reduce((s, v) => s + v, 0);
  const categorySpend = [...categoryTotals.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      percent: categorySpendTotal > 0 ? Math.round((amount / categorySpendTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // ── Work Order Execution by Category — groups WorkOrder.category (same
  // string field categorySpend/categoryId already key off) into per-category
  // totals: how many WOs, how much of their scope is executed vs still
  // remaining, and completion %. Built from the exact same scopeItems
  // plannedQty/completedQty/rate fields the per-project workExecutedValue
  // rollup above already uses — just grouped by category instead of project.
  const categoryExecTotals = new Map();
  for (const wo of workOrders) {
    const cat = wo.category || 'Uncategorized';
    if (!categoryExecTotals.has(cat)) {
      categoryExecTotals.set(cat, { totalWorkOrders: 0, awardedValue: 0, executedValue: 0, plannedQty: 0, completedQty: 0 });
    }
    const bucket = categoryExecTotals.get(cat);
    bucket.totalWorkOrders += 1;
    bucket.awardedValue += wo.contractValue || 0;
    for (const si of wo.scopeItems || []) {
      const planned = si.plannedQty || 0;
      const completed = si.completedQty || 0;
      const rate = si.rate || 0;
      bucket.executedValue += completed * rate;
      bucket.plannedQty += planned;
      bucket.completedQty += completed;
    }
  }
  const categoryExecution = [...categoryExecTotals.entries()]
    .map(([category, b]) => ({
      category,
      totalWorkOrders: b.totalWorkOrders,
      completedPercent: b.plannedQty > 0 ? Math.min(100, Math.round((b.completedQty / b.plannedQty) * 100)) : 0,
      executedValue: Math.round(b.executedValue),
      remainingValue: Math.round(Math.max(0, b.awardedValue - b.executedValue)),
    }))
    .sort((a, b) => b.executedValue - a.executedValue);

  // ── Payment Aging (Pending) — every certified-but-unpaid RunningBill
  // (status 'approved'), bucketed by how many days since it was last
  // certified (lastStatusChangeAt — same "best available proxy" the health/
  // bottleneck rules already use, see projectStageRules.js's own comment on
  // it), NOT a new aging concept invented for this widget alone.
  const AGING_BUCKETS = [
    { key: '0-30',  label: '0-30 Days',  min: 0,  max: 30 },
    { key: '31-60', label: '31-60 Days', min: 31, max: 60 },
    { key: '61-90', label: '61-90 Days', min: 61, max: 90 },
    { key: '90+',   label: '90+ Days',   min: 91, max: Infinity },
  ];
  const agingAmounts = new Map(AGING_BUCKETS.map(b => [b.key, 0]));
  for (const b of runningBills.filter(x => x.status === 'approved')) {
    const days = daysSince(lastStatusChangeAt(b));
    if (days === null) continue;
    const bucket = AGING_BUCKETS.find(x => days >= x.min && days <= x.max) || AGING_BUCKETS[AGING_BUCKETS.length - 1];
    agingAmounts.set(bucket.key, agingAmounts.get(bucket.key) + billFinancialsForBill(b).netAfterHold);
  }
  const paymentAgingTotal = [...agingAmounts.values()].reduce((s, v) => s + v, 0);
  const paymentAging = {
    total: Math.round(paymentAgingTotal),
    buckets: AGING_BUCKETS.map(b => ({
      bucket: b.key,
      label: b.label,
      amount: Math.round(agingAmounts.get(b.key)),
      percent: paymentAgingTotal > 0 ? Math.round((agingAmounts.get(b.key) / paymentAgingTotal) * 1000) / 10 : 0,
    })),
  };

  // ── Approvals Pending by Level — real approval vocabularies already
  // modeled in this codebase (see WorkOrder's 4-level maker/checker/
  // approver/final chain, and BillRequest's L1/L2/L3/L4 chain — no
  // "Site Engineer"/"Project Manager" role-based levels exist anywhere in
  // the data model, so this deliberately uses the actual status values
  // rather than inventing role labels that don't correspond to real data).
  const WO_APPROVAL_LEVELS = [
    { key: 'wo-checker',  label: 'Work Order — Checker',        status: 'pending-checker' },
    { key: 'wo-approver', label: 'Work Order — Approver',       status: 'pending-approver' },
    { key: 'wo-final',    label: 'Work Order — Final Approver',  status: 'pending-final' },
  ];
  const BR_APPROVAL_LEVELS = [
    { key: 'br-l1', label: 'Bill Request — L1', status: 'pending' },
    { key: 'br-l2', label: 'Bill Request — L2', status: 'pending-gm' },
    { key: 'br-l3', label: 'Bill Request — L3', status: 'pending-l3' },
    { key: 'br-l4', label: 'Bill Request — L4', status: 'pending-l4' },
  ];
  function levelSummary(level, docs) {
    const pending = docs.filter(d => d.status === level.status);
    const ages = pending.map(d => daysSince(lastStatusChangeAt(d))).filter(d => d !== null);
    const avgDays = ages.length > 0 ? Math.round(ages.reduce((s, d) => s + d, 0) / ages.length) : 0;
    return { level: level.key, label: level.label, count: pending.length, avgDays };
  }
  const approvalsByLevel = [
    ...WO_APPROVAL_LEVELS.map(l => levelSummary(l, workOrders)),
    ...BR_APPROVAL_LEVELS.map(l => levelSummary(l, billRequests)),
  ].filter(l => l.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Monthly Billing vs Payment Trend — last 12 calendar months, billed
  // (RunningBill.billDate, same basis as kpis.totalBilled) vs paid
  // (RunningBill.paymentDate, only bills actually marked 'paid') summed per
  // month. Months with zero activity still get a bucket (0), so the chart's
  // x-axis never silently skips a month.
  const MONTHLY_TREND_MONTHS = 12;
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (d) => d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  const trendMonths = [];
  const now = new Date();
  for (let i = MONTHLY_TREND_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendMonths.push({ key: monthKey(d), label: monthLabel(d), billed: 0, paid: 0 });
  }
  const trendByKey = new Map(trendMonths.map(m => [m.key, m]));
  for (const b of runningBills) {
    if (b.billDate) {
      const bucket = trendByKey.get(monthKey(new Date(b.billDate)));
      if (bucket) bucket.billed += b.amount || 0;
    }
    if (b.status === 'paid' && b.paymentDate) {
      const bucket = trendByKey.get(monthKey(new Date(b.paymentDate)));
      if (bucket) bucket.paid += billFinancialsForBill(b).netPayable;
    }
  }
  const billingVsPaymentTrend = trendMonths.map(m => ({
    month: m.label,
    billed: Math.round(m.billed),
    paid: Math.round(m.paid),
  }));

  // ── Work Orders — No Approvals — WorkOrders still stuck somewhere in the
  // 4-level maker/checker/approver/final-approver chain (never reached
  // 'approved', including one sent back for rework), aged past the same
  // pendingApprovalAlertDays threshold already used for bill/bill-request
  // approval delays elsewhere on this dashboard — not a new policy, just
  // applied here to WorkOrders too. Replaces the earlier "Zero Progress"
  // list: a WO that was never approved can't have progress logged against
  // it anyway (progress entries require an approved WO), so "no approvals"
  // is the more honest signal for this bucket of stuck work orders.
  const noApprovalWorkOrders = workOrders
    .filter(wo => !isWoApproved(wo))
    .map(wo => ({ wo, days: daysSince(lastStatusChangeAt(wo)) }))
    .filter(({ days }) => days !== null && days >= HEALTH_THRESHOLDS.pendingApprovalAlertDays)
    .map(({ wo, days }) => ({
      workOrderId: String(wo._id),
      workOrderNo: wo.workOrderNo,
      projectId: wo.projectId ? String(wo.projectId) : '',
      projectName: projectById.get(String(wo.projectId))?.name || '',
      category: wo.category || 'Uncategorized',
      status: wo.approvalStatus,
      daysPending: days,
    }))
    .sort((a, b) => b.daysPending - a.daysPending);

  // ── Contractors by Category — one row per WorkOrder's vendor, joined
  // against whichever of Contractor/Consultant collection actually owns that
  // vendorCode. See buildContractorCategoryRows above (shared with the
  // /executive/contractor-matrix endpoint) for the actual resolution/status
  // logic. Uncapped — the frontend card renders this in its own scrollable
  // container rather than a fixed top-N preview, so trimming it here would
  // just hide real rows instead of the earlier top-10 cap.
  const perWorkOrderRows = await buildContractorCategoryRows(workOrders, runningBills, projects);
  const contractorsByCategory = perWorkOrderRows
    .map(({ contractorCode, ...rest }) => rest) // contractorCode is internal-only, not part of this row's documented shape
    .sort((a, b) => b.contractValue - a.contractValue);

  // ── Top Vendors Scorecard — one row per vendor (not per WorkOrder/
  // category like contractorsByCategory above), summing the exact same
  // contractValue/paid/pending buildContractorCategoryRows already computed,
  // plus an average approval turnaround (days between a bill's createdAt and
  // when it was last certified/paid — lastStatusChangeAt on a
  // 'approved'/'paid' RunningBill). "On-time delivery %" is deliberately
  // NOT included: WorkOrder/scopeItems have no planned-completion-date field
  // to compare an actual finish against, so it can't be honestly computed
  // from this data model yet.
  const vendorTotals = new Map();
  for (const row of perWorkOrderRows) {
    if (!row.contractorCode) continue;
    if (!vendorTotals.has(row.contractorCode)) {
      vendorTotals.set(row.contractorCode, { code: row.contractorCode, name: row.contractor, businessGiven: 0, paid: 0, pending: 0, approvalDurations: [] });
    }
    const v = vendorTotals.get(row.contractorCode);
    v.businessGiven += row.contractValue;
    v.paid += row.paid;
    v.pending += row.pending;
  }
  for (const b of runningBills.filter(x => CERTIFIED_BILL_STATUSES.includes(x.status))) {
    if (!b.vendorCode || !vendorTotals.has(b.vendorCode)) continue;
    const changedAt = lastStatusChangeAt(b);
    if (!b.createdAt || !changedAt) continue;
    const durationDays = Math.round((new Date(changedAt).getTime() - new Date(b.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (durationDays >= 0) vendorTotals.get(b.vendorCode).approvalDurations.push(durationDays);
  }
  const topVendorsScorecard = [...vendorTotals.values()]
    .map(v => ({
      code: v.code,
      name: v.name,
      businessGiven: Math.round(v.businessGiven),
      paid: Math.round(v.paid),
      pendingDues: Math.round(v.pending),
      avgApprovalDays: v.approvalDurations.length > 0
        ? Math.round(v.approvalDurations.reduce((s, d) => s + d, 0) / v.approvalDurations.length)
        : null,
    }))
    .sort((a, b) => b.businessGiven - a.businessGiven)
    .slice(0, 10);

  // ── Phase 2: alerts ("Needs Your Attention") ────────────────────────────
  // Built per-project (reusing the exact same fetched/bucketed data as the
  // rollup above), concatenated, sorted worst-first, then capped.
  let allAlerts = [];
  for (const row of projectRows) {
    const projectAlerts = buildProjectAlerts({
      project: row.__project, wos: row.__wos, bills: row.__bills, billReqs: row.__billReqs, financials: row.__financials,
    });
    allAlerts = allAlerts.concat(projectAlerts);
  }
  const SEVERITY_RANK = { critical: 0, attention: 1 };
  allAlerts.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const aMag = a.amount ?? a.ageDays ?? 0;
    const bMag = b.amount ?? b.ageDays ?? 0;
    return bMag - aMag;
  });
  const alertsTotalCount = allAlerts.length;
  // Capped well above what the dashboard's compact "Needs Your Attention"
  // preview shows (6), so its "View All" control has real data to expand
  // into instead of a count with nothing behind it — alerts are cheap
  // (plain strings, no extra queries), so 150 is generous headroom without
  // sending genuinely unbounded data.
  const alerts = allAlerts.slice(0, 150).map(a => ({ id: stableAlertId(a.type, `${a.projectId}-${a.link}`), ...a }));

  // ── Phase 3: reconciliation warnings ────────────────────────────────────
  // Same dataWarnings array Phase 1 already exposes via meta.dataWarnings —
  // real, concrete internal-consistency issues get appended alongside the
  // filter-related notices already pushed above.
  for (const row of projectRows) {
    dataWarnings.push(...checkProjectReconciliation(row));
  }

  // ── Phase 2: forecasts ("If This Continues") ────────────────────────────
  const budgetForecasts = projectRows.map(row => computeBudgetRiskForecast({
    project: row.__project,
    awardedContractValue: row.awardedContractValue,
    workExecutedValue: row.workExecutedValue,
    billedGross: row.billedGross,
    progress: row.progress,
  }));
  const cashRequirement = {
    type: 'cash-requirement',
    totalCertifiedUnpaid: Math.round(projectRows.reduce((s, p) => s + Math.max(0, p.certifiedNet - p.paidAmount), 0)),
    projectCount: projectRows.filter(p => p.certifiedNet > p.paidAmount).length,
    basis: 'Sum of (certifiedNet - paidAmount) across every project in the current filter, as of meta.generatedAt.',
  };
  const forecasts = { budgetRisk: budgetForecasts, cashRequirement };

  // ── Project Activity widget ("Project Activity" panel on ProjectLifecycle)
  // — a compact "current operational workload" snapshot. Scoped to the SAME
  // filtered project/work-order set as the rest of this response (projectIds/
  // woIds, already narrowed by projectId/categoryId/contractorId/from/to
  // above) rather than being a global, unfiltered count — the rest of this
  // endpoint's payload is entirely filter-scoped, and a panel that ignored
  // the active filters while sitting right next to KPI cards that obey them
  // would read as a bug, not a feature, on this dashboard.
  //
  // 1. Work Orders — Active: WorkOrder.status in ('issued','in-progress') —
  //    the two statuses that mean "real, ongoing execution work" (draft
  //    hasn't started, completed/cancelled are done), from the already-
  //    fetched `workOrders` array — no extra query.
  // 2. Site Progress / DPR — Pending: approved WorkOrders in this filtered
  //    set that still have unexecuted scope (some item's completedQty <
  //    plannedQty) — real site work still waiting to be logged/finished.
  //    NOT the `Activity` model: that collection only backs the separate
  //    Payment Milestone feature (activityController.js/milestoneController.js)
  //    and was empty in this app's own dev data — Site Progress/DPR's real
  //    data lives on WorkOrder.scopeItems[].progressEntries, already fetched
  //    below, so this needs no extra query.
  // 3. Bills — Awaiting Verification: RunningBill.status === 'draft', the
  //    exact same status this app's own Accounts Payment aging table already
  //    labels "Awaiting Verification" (see dprController.js's agingTable
  //    status mapping) — reused here verbatim, not a new definition. Counted
  //    from the already-fetched `runningBills` array — no extra query.
  // 4. Approvals — Pending: same concept as kpis.pendingApprovals
  //    (BillRequest.status in PENDING_BILL_REQ_STATUSES, summed per project
  //    above) — reused as-is rather than duplicated.
  // 5. Drawing Requests — Open: DrawingRequest.status !== 'completed' (i.e.
  //    'pending' | 'committed' | 'delayed' — anything still needing action),
  //    scoped to the same filtered projectIds.
  const workOrdersActive = workOrders.filter(w => ['issued', 'in-progress'].includes(w.status)).length;
  const billsAwaitingVerification = runningBills.filter(b => b.status === 'draft').length;
  const siteProgressPending = workOrders.filter(w =>
    w.approvalStatus === 'approved' &&
    (w.scopeItems || []).some(si => (si.plannedQty || 0) > 0 && (si.completedQty || 0) < (si.plannedQty || 0))
  ).length;
  const drawingRequestsOpen = await DrawingRequest.countDocuments({ projectId: { $in: projectIds }, status: { $ne: 'completed' } });

  // Bottom stats strip's last 3 items — all reuse fields already computed
  // per project above, not new health/risk concepts:
  //   - At Risk / Critical are a straight group-count of the EXISTING
  //     row.health field (Backend/src/utils/projectStageRules.js's
  //     computeHealth) — "Attention" reads as "At Risk" here, "Critical"
  //     stays "Critical". No new thresholds.
  //   - Delayed reuses the EXISTING row.bottleneck string, which
  //     computeBottleneck already only populates with a "...no progress
  //     logged"/"...no new progress logged..." message (using the same
  //     HEALTH_THRESHOLDS.zeroProgressAlertDays/noProgressAttentionDays
  //     already applied there) once a project's own execution has stalled —
  //     as opposed to bottleneck being set for a billing/approval holdup,
  //     which reads "awaiting approval" or "certified but unpaid" instead.
  //     Matching on "progress" against that already-computed string, rather
  //     than re-deriving a parallel signal, keeps this in lockstep with
  //     whatever computeBottleneck's own progress-stall wording says.
  const delayedProjects = projectRows.filter(p => p.bottleneck && p.bottleneck.includes('progress')).length;
  const atRiskProjects = projectRows.filter(p => p.health === 'Attention').length;
  const criticalProjects = projectRows.filter(p => p.health === 'Critical').length;

  const activity = {
    workOrdersActive,
    siteProgressPending,
    billsAwaitingVerification,
    approvalsPending: kpis.pendingApprovals,
    drawingRequestsOpen,
    delayedProjects,
    atRiskProjects,
    criticalProjects,
  };

  // Strip the internal-only fields carried on each row purely to build
  // alerts/forecasts above — never part of the documented response shape.
  const cleanProjects = projectRows.map(({ __wos, __bills, __billReqs, __project, __financials, ...rest }) => rest);

  return {
    meta: {
      generatedAt: new Date(),
      filters: {
        projectId:    isNoFilter(projectId) ? null : projectId,
        stage:        isNoFilter(stage) ? null : stage,
        categoryId:   isNoFilter(categoryId) ? null : categoryId,
        contractorId: isNoFilter(contractorId) ? null : contractorId,
        from:         fromDate ? fromDate.toISOString() : null,
        to:           toDate ? toDate.toISOString() : null,
      },
      currency: 'INR',
      dataWarnings,
    },
    kpis,
    activity,
    projects: cleanProjects,
    alerts,
    alertsTotalCount,
    forecasts,
    stageSummary,
    categorySpend,
    contractorsByCategory,
    categoryExecution,
    paymentAging,
    approvalsByLevel,
    billingVsPaymentTrend,
    noApprovalWorkOrders,
    topVendorsScorecard,
  };
}

// GET /api/dashboard/executive?projectId=&stage=&categoryId=&contractorId=&from=&to=
exports.getExecutiveDashboard = asyncHandler(async (req, res) => {
  try {
    const payload = await buildExecutiveDashboardData(req.query);
    success(res, payload);
  } catch (err) {
    if (err instanceof BadRequestError) return badRequest(res, err.message);
    throw err;
  }
});

// ── Phase 3: CSV export ──────────────────────────────────────────────────
// Small manual CSV serializer — json2csv is not a dependency of this backend
// (checked package.json) and the task explicitly says not to add a new npm
// dependency, so this hand-rolls the same quoting rule already used
// elsewhere in this codebase for CSV export (see
// Frontend/src/features/dashboard/utils/dprExport.ts's toCsvRow): wrap a
// field in double quotes if it contains a comma, double quote, or newline,
// and double up any internal double quotes.
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsvRow(cells) {
  return cells.map(csvCell).join(',');
}

// Human-readable column header + optional value formatter per field —
// opening this file straight in Excel (rather than only ever re-importing
// it into this app) is a real use case, so raw camelCase field names
// ('awardedContractValue') and unrounded floats ('138352.9000000001'-style
// artifacts from the executed-value/rate arithmetic upstream) aren't good
// enough. Money/percent columns are still exported as PLAIN numbers, not
// strings with a ₹/% glued on — that would make Excel treat them as text
// and break SUM()/formatting/sorting, which defeats the point of a CSV
// export in the first place. Just rounded to whole rupees (round2()
// upstream already handles paise; whole rupees is enough precision for a
// spreadsheet export) and with no leftover floating-point noise.
const money = (v) => Math.round(v || 0);
const CSV_EXPORT_COLUMNS = [
  { key: 'code',                 label: 'Code' },
  { key: 'name',                 label: 'Project Name' },
  { key: 'status',                label: 'Status' },
  { key: 'overallStage',         label: 'Stage' },
  { key: 'health',                label: 'Health' },
  { key: 'bottleneck',            label: 'Bottleneck' },
  { key: 'awardedContractValue', label: 'Contract Value (Rs)', format: money },
  { key: 'workExecutedValue',    label: 'Executed Value (Rs)', format: money },
  { key: 'billedGross',           label: 'Billed Gross (Rs)', format: money },
  { key: 'certifiedNet',          label: 'Certified Net (Rs)', format: money },
  { key: 'paidAmount',            label: 'Paid Amount (Rs)', format: money },
  { key: 'remainingContract',    label: 'Remaining Contract (Rs)', format: money },
  { key: 'progress',              label: 'Progress %' },
  { key: 'pendingBillReqs',      label: 'Pending Bill Requests' },
  { key: 'openBills',             label: 'Open Bills' },
  { key: 'activeVendors',         label: 'Active Vendors' },
];

// GET /api/dashboard/executive/export.csv — same filters/auth gate as GET
// /api/dashboard/executive, same shared row-building logic
// (buildExecutiveDashboardData), just serialized to CSV instead of JSON.
exports.exportExecutiveDashboardCsv = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = await buildExecutiveDashboardData(req.query);
  } catch (err) {
    if (err instanceof BadRequestError) return badRequest(res, err.message);
    throw err;
  }

  const lines = [toCsvRow(CSV_EXPORT_COLUMNS.map(c => c.label))];
  for (const p of payload.projects) {
    lines.push(toCsvRow(CSV_EXPORT_COLUMNS.map(c => c.format ? c.format(p[c.key]) : p[c.key])));
  }
  const csv = lines.join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="projects-overview.csv"');
  res.send(csv);
});

// ── Contractor × Category Matrix ────────────────────────────────────────
// Same filter params/gate as GET /executive, but instead of the capped
// top-10 `contractorsByCategory` list, returns the FULL uncapped cross-tab:
// every (contractor, category) combination with at least one WorkOrder in
// the filtered set, aggregated across however many projects/work orders that
// pair spans. Reuses buildContractorCategoryRows (same vendorCode->name
// resolution and status thresholds as /executive's contractorsByCategory —
// not a re-implementation that could drift).
async function buildContractorMatrixData(query) {
  const { projectId, categoryId, contractorId, from, to } = query;
  const dataWarnings = [];

  if (!isNoFilter(projectId) && !isValidObjectId(projectId)) {
    throw new BadRequestError(`Invalid projectId: ${projectId}`);
  }

  let fromDate, toDate;
  if (!isNoFilter(from)) {
    fromDate = tryParseDate(from);
    if (fromDate === null) { dataWarnings.push(`Invalid 'from' date: '${from}' — ignored.`); fromDate = undefined; }
  }
  if (!isNoFilter(to)) {
    toDate = tryParseDate(to);
    if (toDate === null) { dataWarnings.push(`Invalid 'to' date: '${to}' — ignored.`); toDate = undefined; }
  }

  const projectFilter = {};
  if (!isNoFilter(projectId)) projectFilter._id = projectId;
  const projects = await Project.find(projectFilter).lean();
  if (!isNoFilter(projectId) && projects.length === 0) {
    throw new BadRequestError(`Project not found: ${projectId}`);
  }
  const projectIds = projects.map(p => p._id);

  const woFilter = { projectId: { $in: projectIds } };
  if (!isNoFilter(categoryId)) woFilter.category = categoryId;
  if (!isNoFilter(contractorId)) woFilter.vendorCode = contractorId;
  // Same projection fix as buildExecutiveDashboardData above — excludes
  // WorkOrder.documents (base64-embedded uploaded files, some multi-MB),
  // which otherwise makes this query take 90+ seconds for no reason this
  // matrix ever needs.
  const workOrders = await WorkOrder.find(woFilter)
    .select('projectId contractValue vendorCode vendorName contractType category workOrderNo')
    .lean();
  const woIds = workOrders.map(w => w._id);

  const rbFilter = {};
  if (!isNoFilter(categoryId)) {
    rbFilter.workOrderId = { $in: woIds };
  } else {
    rbFilter.projectId = { $in: projectIds };
  }
  if (!isNoFilter(contractorId)) rbFilter.vendorCode = contractorId;
  if (fromDate || toDate) {
    rbFilter.billDate = {};
    if (fromDate) rbFilter.billDate.$gte = fromDate;
    if (toDate) rbFilter.billDate.$lte = toDate;
  }
  const runningBills = await RunningBill.find(rbFilter).lean();

  const perWorkOrderRows = await buildContractorCategoryRows(workOrders, runningBills, projects);

  // ── Group per-WorkOrder rows into the (contractorCode, category) cross-tab
  // — a contractor can have multiple WorkOrders in the same category across
  // different projects, so this sums contractValue/paid/pending and counts
  // distinct projects rather than emitting one row per WorkOrder.
  const cellsByKey = new Map();
  for (const row of perWorkOrderRows) {
    const key = `${row.contractorCode} ${row.category}`;
    let cell = cellsByKey.get(key);
    if (!cell) {
      cell = {
        contractorCode: row.contractorCode,
        contractorName: row.contractor,
        category: row.category,
        contractValue: 0,
        paid: 0,
        pending: 0,
        projectIds: new Set(),
      };
      cellsByKey.set(key, cell);
    }
    cell.contractValue += row.contractValue;
    cell.paid += row.paid;
    cell.pending += row.pending;
    if (row.projectId) cell.projectIds.add(row.projectId);
  }

  const rows = [...cellsByKey.values()].map(cell => {
    const contractValue = cell.contractValue;
    const paid = cell.paid;
    const pending = cell.pending;
    // Same thresholds/precedence as buildContractorCategoryRows's per-WO
    // status, just re-derived on the aggregated cell totals (a cell with
    // multiple WorkOrders isn't just "the worst status among them" — it's
    // judged on its own combined paid/pending/contractValue, consistent with
    // how every other aggregate in this file is computed post-sum).
    let status;
    if (paid === 0 && pending === 0) {
      status = 'Pending';
    } else if (contractValue > 0 && paid / contractValue >= 0.9) {
      status = 'Healthy';
    } else if (pending > 0) {
      status = 'Attention';
    } else {
      status = 'Healthy';
    }
    return {
      contractorCode: cell.contractorCode,
      contractorName: cell.contractorName,
      category: cell.category,
      contractValue,
      paid,
      pending,
      projectCount: cell.projectIds.size,
      status,
    };
  }).sort((a, b) => b.contractValue - a.contractValue);

  const categories = [...new Set(rows.map(r => r.category))].sort((a, b) => a.localeCompare(b));
  const contractorMap = new Map();
  for (const r of rows) {
    if (!contractorMap.has(r.contractorCode)) contractorMap.set(r.contractorCode, r.contractorName);
  }
  const contractors = [...contractorMap.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    meta: {
      generatedAt: new Date(),
      filters: {
        projectId: isNoFilter(projectId) ? null : projectId,
        categoryId: isNoFilter(categoryId) ? null : categoryId,
        contractorId: isNoFilter(contractorId) ? null : contractorId,
        from: fromDate ? fromDate.toISOString() : null,
        to: toDate ? toDate.toISOString() : null,
      },
      currency: 'INR',
      dataWarnings,
    },
    rows,
    categories,
    contractors,
  };
}

// GET /api/dashboard/executive/contractor-matrix?projectId=&categoryId=&contractorId=&from=&to=
exports.getContractorMatrix = asyncHandler(async (req, res) => {
  try {
    const payload = await buildContractorMatrixData(req.query);
    success(res, payload);
  } catch (err) {
    if (err instanceof BadRequestError) return badRequest(res, err.message);
    throw err;
  }
});
