const mongoose     = require('mongoose');
const Project      = require('../models/Project');
const WorkOrder     = require('../models/WorkOrder');
const BillRequest   = require('../models/BillRequest');
const RunningBill   = require('../models/RunningBill');
const asyncHandler  = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const { billFinancialsForBill } = require('../utils/billFinancials');

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

// GET /api/dashboard/executive?projectId=&stage=&categoryId=&contractorId=&from=&to=
exports.getExecutiveDashboard = asyncHandler(async (req, res) => {
  const { projectId, stage, categoryId, contractorId, from, to } = req.query;
  const dataWarnings = [];

  // ── Validate query params ──────────────────────────────────────────────
  if (!isNoFilter(projectId) && !isValidObjectId(projectId)) {
    return badRequest(res, `Invalid projectId: ${projectId}`);
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
    return badRequest(res, `Project not found: ${projectId}`);
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

  const workOrders = await WorkOrder.find(woFilter).lean();
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
    };
  });

  // ── Top-level KPIs, aggregated across the filtered project set ──────────
  const kpis = {
    activeProjects:    projects.filter(p => p.status === 'active').length,
    totalContractValue: projectRows.reduce((s, p) => s + p.awardedContractValue, 0),
    workExecuted:       projectRows.reduce((s, p) => s + p.workExecutedValue, 0),
    totalBilled:         projectRows.reduce((s, p) => s + p.billedGross, 0),
    totalPaid:            projectRows.reduce((s, p) => s + p.paidAmount, 0),
    pendingApprovals:    projectRows.reduce((s, p) => s + p.pendingBillReqs, 0),
  };

  success(res, {
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
    projects: projectRows,
    // Phase 2/3 — intentionally omitted for now: stageSummary, alerts,
    // forecasts, paymentFlow, categories, contractorCategory, deepLinks.
  });
});
