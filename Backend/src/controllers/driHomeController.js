const WorkOrder = require('../models/WorkOrder');
const DailyProgressReport = require('../models/DailyProgressReport');
const DrawingRequest = require('../models/DrawingRequest');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/responseFormatter');

// `dateStr` (YYYY-MM-DD) picks which calendar day to report on — defaults to
// today. Parsed as a local calendar day, not a UTC instant, so a date typed
// in a plain <input type="date"> lines up with what the DRI actually means.
function dayBounds(dateStr) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// GET /api/dri-home?date=YYYY-MM-DD — a site-dri's own landing dashboard:
// their assigned projects' progress, a chosen day's activity (defaults to
// today), and their own drawing requests' review state. Everything here is
// scoped to req.user._id — no cross-DRI visibility, unlike the admin-facing
// /dri-dashboard.
exports.getDriHome = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { start: dayStart, end: dayEnd } = dayBounds(req.query.date);

  const [workOrders, todayReports, myRequests] = await Promise.all([
    WorkOrder.find({ assignedDRI: userId }).lean(),
    DailyProgressReport.find({ driUserId: userId, date: { $gte: dayStart, $lt: dayEnd } }).lean(),
    DrawingRequest.find({ submittedBy: userId }).sort({ createdAt: -1 }).lean(),
  ]);

  // ── Per-project rollup — overall progress is a plannedQty-weighted average
  // across every scope item in every WO of this DRI's assigned to that
  // project (a parent item's own completedQty already reflects its
  // particulars via recomputeParentFromSubItems, so no need to recurse). ──
  const projectMap = new Map();
  for (const wo of workOrders) {
    const pid = String(wo.projectId?._id || wo.projectId || '');
    if (!pid) continue;
    if (!projectMap.has(pid)) {
      projectMap.set(pid, { projectId: pid, projectName: wo.projectName || '', woCount: 0, plannedQty: 0, completedQty: 0, pendingItems: 0 });
    }
    const g = projectMap.get(pid);
    g.woCount += 1;
    for (const si of wo.scopeItems || []) {
      g.plannedQty += si.plannedQty || 0;
      g.completedQty += Math.min(si.completedQty || 0, si.plannedQty || 0);
      if (Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0) g.pendingItems += 1;
    }
  }

  const todayReportsByProject = new Map();
  for (const r of todayReports) {
    const pid = String(r.projectId || '');
    todayReportsByProject.set(pid, (todayReportsByProject.get(pid) || 0) + 1);
  }

  const projects = Array.from(projectMap.values())
    .map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName,
      workOrders: p.woCount,
      pendingItems: p.pendingItems,
      todayReports: todayReportsByProject.get(p.projectId) || 0,
      overallProgressPct: p.plannedQty > 0 ? Math.round((p.completedQty / p.plannedQty) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  // ── Today's progress by work type (category), across all this DRI's reports ──
  const workTypeCounts = {};
  for (const r of todayReports) {
    for (const entry of r.workEntries || []) {
      workTypeCounts[entry.workType] = (workTypeCounts[entry.workType] || 0) + 1;
    }
  }

  // ── This DRI's own drawing requests ──
  const reviewCounts = { 'l1-gm': 0, 'l2-architect': 0, 'l3-gm': 0, 'l4-gm': 0, approved: 0, returned: 0 };
  for (const r of myRequests) {
    if (reviewCounts[r.reviewStatus] !== undefined) reviewCounts[r.reviewStatus] += 1;
  }
  const returned = myRequests.filter((r) => r.reviewStatus === 'returned');

  success(res, {
    // Formatted from dayStart's own local components, not toISOString() —
    // that converts to UTC and would roll back to the previous calendar day
    // for any timezone ahead of UTC (this app's users are all IST).
    selectedDate: `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`,
    summary: {
      projectsAssigned: projectMap.size,
      workOrders: workOrders.length,
      todayReports: todayReports.length,
      drawingRequests: myRequests.length,
      needsAttention: returned.length,
    },
    projects,
    workTypeCounts,
    drawingRequests: {
      total: myRequests.length,
      counts: reviewCounts,
      recent: myRequests.slice(0, 5).map((r) => ({
        _id: r._id, ticketNo: r.ticketNo, projectName: r.projectName, description: r.description,
        createdAt: r.createdAt, reviewStatus: r.reviewStatus,
      })),
      returned: returned.slice(0, 5).map((r) => ({
        _id: r._id, ticketNo: r.ticketNo, projectName: r.projectName, description: r.description,
      })),
    },
  });
});
