const WorkOrder    = require('../models/WorkOrder');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const AdvanceSlip  = require('../models/AdvanceSlip');
const Project      = require('../models/Project');
const Category     = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { success }  = require('../utils/responseFormatter');

// ── Date helpers (no dayjs in this backend — plain Date arithmetic) ──
const DAY_MS = 24 * 60 * 60 * 1000;

function dayBounds(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { start, end: new Date(start.getTime() + DAY_MS) };
}
// Generalizes dayBounds to a [dateFromStr, dateToStr] span — end-exclusive,
// covering the whole of dateToStr. A missing dateFromStr means "no lower
// bound" (all-time), matching the "All Time" range preset on the dashboard.
function rangeBounds(dateFromStr, dateToStr) {
  const to = dateToStr ? new Date(dateToStr) : new Date();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const start = dateFromStr ? new Date(dateFromStr) : new Date(0);
  return { start: dateFromStr ? new Date(start.getFullYear(), start.getMonth(), start.getDate()) : start, end };
}
function inRange(date, start, end) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= start.getTime() && t < end.getTime();
}
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / DAY_MS);
}
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const avg = arr => arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : 0;

// The stored `paidAmount` isn't reliable — the payment form pre-fills it with
// the gross bill amount and doesn't force whoever records payment to correct
// it down, so bills with retention held often end up with `paidAmount`
// silently equal to the gross figure. Compute the real net release
// deterministically from the bill's own fields instead of trusting it.
const netReleased = b => {
  const gross = (b.amount || 0) * (1 + (b.gstPercent || 0) / 100);
  return Math.max(0, gross - (b.retentionAmount || 0) - (b.advanceRecovery || 0));
};

const AGING_BUCKETS = [
  { label: '0-3 Days',  max: 3 },
  { label: '4-7 Days',  max: 7 },
  { label: '8-15 Days', max: 15 },
  { label: '16+ Days',  max: Infinity },
];
function agingBucketIndex(days) {
  const idx = AGING_BUCKETS.findIndex(b => days <= b.max);
  return idx >= 0 ? idx : AGING_BUCKETS.length - 1;
}

// GET /api/dpr?date=YYYY-MM-DD&projectId=...
// GET /api/dpr?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&projectId=...  (range presets: All Time / Current Week / Last Week / Custom Range)
exports.getDPR = asyncHandler(async (req, res) => {
  const { date, dateFrom, dateTo, projectId } = req.query;
  // `date` is the legacy single-day param — still supported so nothing else
  // calling this endpoint breaks. `dateFrom`/`dateTo` take precedence.
  const rangeFrom = dateFrom || date || undefined;
  const rangeTo = dateTo || date;
  const isSingleDay = !dateFrom || dateFrom === (dateTo || date);
  const { start: dayStart, end: dayEnd } = rangeBounds(rangeFrom, rangeTo);
  const trend30Start = new Date(dayEnd.getTime() - 30 * DAY_MS);
  const trend7Start = new Date(dayEnd.getTime() - 7 * DAY_MS);

  const projectFilter = projectId ? { projectId } : {};

  const [workOrders, billRequests, runningBills, advanceSlips, projects, categories] = await Promise.all([
    WorkOrder.find(projectFilter).lean(),
    BillRequest.find({ ...projectFilter, isArchived: { $ne: true } }).lean(),
    RunningBill.find({ ...projectFilter, isArchived: { $ne: true } }).lean(),
    AdvanceSlip.find({ ...projectFilter, isArchived: { $ne: true } }).lean(),
    Project.find().select('_id name location').lean(),
    Category.find({ isActive: true, parentId: null }).select('name color').lean(),
  ]);

  const projectName = new Map(projects.map(p => [String(p._id), p.name]));
  const projectLocation = new Map(projects.map(p => [String(p._id), p.location || '']));

  // ── Unified 30-day daily series (one pass, powers trend charts AND comparisons) ──
  // Only genuine "flow" metrics belong here — backlog/snapshot numbers (pending
  // approvals, outstanding liability) don't have a meaningful day-over-day comparison.
  const seriesMap = new Map();
  for (let i = 0; i < 30; i++) {
    seriesMap.set(dayKey(new Date(trend30Start.getTime() + i * DAY_MS)), {
      woCreated: 0, billRequestsRaised: 0, billsApproved: 0, paymentsReleased: 0,
      advancePayments: 0, progressEntries: 0,
      amountReleased: 0, billsRaisedValue: 0, approvedValue: 0, advanceAmount: 0,
    });
  }
  const bump = (date, field, by = 1) => {
    if (!date) return;
    const d = new Date(date);
    if (d < trend30Start || d >= dayEnd) return;
    const row = seriesMap.get(dayKey(d));
    if (row) row[field] += by;
  };
  for (const w of workOrders) {
    bump(w.createdAt, 'woCreated');
    for (const item of w.scopeItems || []) {
      for (const e of item.progressEntries || []) bump(e.date, 'progressEntries');
    }
  }
  for (const b of billRequests) {
    bump(b.createdAt, 'billRequestsRaised');
    if (b.status === 'approved') bump(b.processedAt, 'billsApproved');
  }
  for (const b of runningBills) {
    bump(b.billDate, 'billsRaisedValue', b.amount || 0);
    bump(b.approvedAt, 'approvedValue', b.amount || 0);
    if (b.status === 'paid') {
      bump(b.paymentDate, 'paymentsReleased');
      bump(b.paymentDate, 'amountReleased', netReleased(b));
    }
  }
  for (const a of advanceSlips) {
    bump(a.date, 'advancePayments');
    bump(a.date, 'advanceAmount', a.amount || 0);
  }
  const dailySeries = [...seriesMap.entries()].map(([date, v]) => ({ date, ...v }));

  function pctChange(current, baseline) {
    if (!baseline) return current > 0 ? null : 0; // null = "new activity, no prior baseline"
    return Math.round(((current - baseline) / baseline) * 100);
  }
  function buildComparisons(fields) {
    const todayRow = dailySeries[dailySeries.length - 1];
    const yesterdayRow = dailySeries[dailySeries.length - 2];
    const last7 = dailySeries.slice(-8, -1);
    const last30 = dailySeries.slice(0, -1);
    const avgOf = (rows, field) => rows.length ? rows.reduce((s, r) => s + r[field], 0) / rows.length : 0;
    const out = {};
    for (const field of fields) {
      out[field] = {
        yesterday: pctChange(todayRow[field], yesterdayRow[field]),
        avg7d: pctChange(todayRow[field], avgOf(last7, field)),
        avg30d: pctChange(todayRow[field], avgOf(last30, field)),
      };
    }
    return out;
  }
  const operationalComparisons = buildComparisons(['woCreated', 'billRequestsRaised', 'billsApproved', 'paymentsReleased', 'advancePayments', 'progressEntries']);
  const financialComparisons = buildComparisons(['amountReleased', 'billsRaisedValue', 'approvedValue', 'advanceAmount']);

  // ══════════════════════════ OPERATIONAL ══════════════════════════

  const woToday = workOrders.filter(w => inRange(w.createdAt, dayStart, dayEnd));
  const brToday = billRequests.filter(b => inRange(b.createdAt, dayStart, dayEnd));
  const brApprovedToday = billRequests.filter(b => b.status === 'approved' && inRange(b.processedAt, dayStart, dayEnd));
  const rbVerifiedToday = runningBills.filter(b => inRange(b.verifiedAt, dayStart, dayEnd));
  const rbApprovedToday = runningBills.filter(b => inRange(b.approvedAt, dayStart, dayEnd));
  const rbPaidToday = runningBills.filter(b => b.status === 'paid' && inRange(b.paymentDate, dayStart, dayEnd));
  const advanceToday = advanceSlips.filter(a => inRange(a.date, dayStart, dayEnd));

  const activeContractors = new Set([
    ...woToday.map(w => w.vendorCode),
    ...brToday.map(b => b.vendorCode),
    ...rbPaidToday.map(b => b.vendorCode),
  ].filter(Boolean));

  // Drill-down detail rows — the actual records behind each operational KPI
  const pendingApprovalsList = billRequests.filter(b => b.status === 'pending');
  const operationalDetails = {
    woCreatedToday: woToday.map(w => ({ id: w._id, label: w.workOrderNo, project: w.projectName, vendor: w.vendorName, value: w.contractValue || 0 })),
    billRequestsToday: brToday.map(b => ({ id: b._id, label: b.reqNo, project: b.projectName, vendor: b.vendorName, value: sum(b.items || [], it => (it.rate || 0) * it.billedQty) })),
    billsApprovedToday: brApprovedToday.map(b => ({ id: b._id, label: b.reqNo, project: b.projectName, vendor: b.vendorName, value: sum(b.items || [], it => (it.rate || 0) * it.billedQty) })),
    paymentsReleasedToday: rbPaidToday.map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: netReleased(b) })),
    advancePaymentsToday: advanceToday.map(a => ({ id: a._id, label: a.slipNo, project: a.projectName, vendor: a.contractorName, value: a.amount || 0 })),
    pendingApprovals: pendingApprovalsList.map(b => ({ id: b._id, label: b.reqNo, project: b.projectName, vendor: b.vendorName, value: sum(b.items || [], it => (it.rate || 0) * it.billedQty) })),
  };

  // Progress entries logged today, across every scope item of every work order
  let progressEntriesToday = 0;
  const siteProgressToday = [];
  for (const wo of workOrders) {
    for (const item of wo.scopeItems || []) {
      const todayEntries = (item.progressEntries || []).filter(e => inRange(e.date, dayStart, dayEnd));
      if (todayEntries.length === 0) continue;
      progressEntriesToday += todayEntries.length;
      const todayQty = sum(todayEntries, e => e.qtyAdded);
      siteProgressToday.push({
        projectId: String(wo.projectId), projectName: wo.projectName,
        projectLocation: projectLocation.get(String(wo.projectId)) || '',
        workOrderNo: wo.workOrderNo, description: item.description, unit: item.unit,
        todayQty, completedQty: item.completedQty || 0, plannedQty: item.plannedQty || 0,
        completionPct: item.plannedQty ? Math.min(100, Math.round(((item.completedQty || 0) / item.plannedQty) * 100)) : 0,
      });
    }
  }

  const funnel = [
    { label: 'Work Orders Created', count: woToday.length },
    { label: 'Bill Requests Raised', count: brToday.length },
    { label: 'Bills Verified', count: rbVerifiedToday.length },
    { label: 'Bills Approved', count: rbApprovedToday.length },
    { label: 'Payments Released', count: rbPaidToday.length },
  ];

  // Work order creation trend — last 30 days
  const woTrendMap = new Map();
  for (let i = 0; i < 30; i++) {
    woTrendMap.set(dayKey(new Date(trend30Start.getTime() + i * DAY_MS)), 0);
  }
  for (const w of workOrders) {
    if (new Date(w.createdAt) < trend30Start || new Date(w.createdAt) >= dayEnd) continue;
    const k = dayKey(w.createdAt);
    if (woTrendMap.has(k)) woTrendMap.set(k, woTrendMap.get(k) + 1);
  }
  const woTrend = [...woTrendMap.entries()].map(([date, count]) => ({ date, count }));

  // Work orders by category
  const catMap = new Map();
  for (const w of workOrders) {
    const cat = w.category || 'Uncategorized';
    catMap.set(cat, (catMap.get(cat) || 0) + 1);
  }
  const woByCategory = [...catMap.entries()].map(([name, count]) => ({
    name, count, pct: workOrders.length ? Math.round((count / workOrders.length) * 100) : 0,
    color: categories.find(c => c.name === name)?.color || '#9CA3AF',
  })).sort((a, b) => b.count - a.count);

  // Project-wise operational + financial performance
  const projPerf = new Map();
  function ensureProj(pid, pname) {
    const key = String(pid);
    if (!projPerf.has(key)) projPerf.set(key, {
      projectId: key, projectName: pname || projectName.get(key) || 'Unknown',
      projectLocation: projectLocation.get(key) || '',
      woCount: 0, billRequestCount: 0, approvedCount: 0, paidCount: 0,
      releasedAmount: 0, pendingAmount: 0, completedQty: 0, plannedQty: 0,
    });
    return projPerf.get(key);
  }
  for (const w of workOrders) {
    if (!w.projectId) continue;
    const p = ensureProj(w.projectId, w.projectName);
    p.woCount++;
    for (const item of w.scopeItems || []) {
      p.completedQty += item.completedQty || 0;
      p.plannedQty += item.plannedQty || 0;
    }
  }
  for (const b of billRequests) {
    if (!b.projectId) continue;
    const p = ensureProj(b.projectId, b.projectName);
    p.billRequestCount++;
    if (b.status === 'approved') p.approvedCount++;
  }
  for (const b of runningBills) {
    if (!b.projectId) continue;
    const p = ensureProj(b.projectId, b.projectName);
    if (b.status === 'paid') { p.paidCount++; p.releasedAmount += netReleased(b); }
    else if (['submitted', 'verified', 'approved', 'payment-initiated'].includes(b.status)) { p.pendingAmount += b.amount || 0; }
  }
  const projectPerformance = [...projPerf.values()].map(p => ({
    ...p, progressPct: p.plannedQty ? Math.min(100, Math.round((p.completedQty / p.plannedQty) * 100)) : 0,
  })).sort((a, b) => b.releasedAmount - a.releasedAmount);

  const operational = {
    kpis: {
      woCreatedToday: woToday.length,
      billRequestsToday: brToday.length,
      billsApprovedToday: brApprovedToday.length,
      paymentsReleasedToday: rbPaidToday.length,
      advancePaymentsToday: advanceToday.length,
      progressEntriesToday,
      pendingApprovals: pendingApprovalsList.length,
      contractorsActiveToday: activeContractors.size,
    },
    comparisons: operationalComparisons,
    details: operationalDetails,
    funnel,
    siteProgressToday: siteProgressToday.sort((a, b) => b.todayQty - a.todayQty).slice(0, 25),
    woTrend,
    woByCategory,
    projectPerformance,
  };

  // ══════════════════════════ FINANCIAL ══════════════════════════

  const amountReleasedToday = sum(rbPaidToday, netReleased);
  const billsRaisedToday = runningBills.filter(b => inRange(b.billDate, dayStart, dayEnd));
  const billsRaisedValueToday = sum(billsRaisedToday, b => b.amount);
  const approvedValueToday = sum(rbApprovedToday, b => b.amount);
  const unpaidBills = runningBills.filter(b => ['submitted', 'verified', 'approved', 'payment-initiated'].includes(b.status));
  const pendingValueToday = sum(unpaidBills.filter(b => !['approved', 'payment-initiated'].includes(b.status)), b => b.amount);
  const outstandingLiability = sum(unpaidBills.filter(b => ['approved', 'payment-initiated'].includes(b.status)), b => b.amount);
  const advanceAmountToday = sum(advanceToday, a => a.amount);

  const financialDetails = {
    amountReleasedToday: rbPaidToday.map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: netReleased(b) })),
    billsRaisedValueToday: billsRaisedToday.map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: b.amount || 0 })),
    approvedValueToday: rbApprovedToday.map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: b.amount || 0 })),
    advanceAmountToday: advanceToday.map(a => ({ id: a._id, label: a.slipNo, project: a.projectName, vendor: a.contractorName, value: a.amount || 0 })),
    pendingValueToday: unpaidBills.filter(b => !['approved', 'payment-initiated'].includes(b.status)).map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: b.amount || 0 })),
    outstandingLiability: unpaidBills.filter(b => ['approved', 'payment-initiated'].includes(b.status)).map(b => ({ id: b._id, label: b.billNo, project: b.projectName, vendor: b.vendorName, value: b.amount || 0 })),
  };

  const paidBills = runningBills.filter(b => b.status === 'paid');
  const paymentBreakdown = {
    released: sum(paidBills, netReleased),
    retentionHeld: sum(runningBills, b => (b.retentionAmount || 0) - (b.retentionReleased || 0)),
    advanceRecovered: sum(runningBills, b => b.advanceRecovery || 0),
    tds: sum(paidBills, b => (b.amount || 0) * (b.tdsPercent || 0) / 100),
  };
  paymentBreakdown.net = Math.max(0, paymentBreakdown.released - paymentBreakdown.tds);

  // Daily release trend — last 7 days
  const releaseTrendMap = new Map();
  for (let i = 0; i < 7; i++) releaseTrendMap.set(dayKey(new Date(trend7Start.getTime() + i * DAY_MS)), 0);
  for (const b of paidBills) {
    if (!b.paymentDate || new Date(b.paymentDate) < trend7Start || new Date(b.paymentDate) >= dayEnd) continue;
    const k = dayKey(b.paymentDate);
    if (releaseTrendMap.has(k)) releaseTrendMap.set(k, releaseTrendMap.get(k) + netReleased(b));
  }
  const dailyReleaseTrend = [...releaseTrendMap.entries()].map(([date, amount]) => ({ date, amount }));

  // Bills raised vs approved vs paid — last 30 days
  const billsTrendMap = new Map();
  for (let i = 0; i < 30; i++) billsTrendMap.set(dayKey(new Date(trend30Start.getTime() + i * DAY_MS)), { raised: 0, approved: 0, paid: 0 });
  for (const b of runningBills) {
    if (b.billDate && new Date(b.billDate) >= trend30Start && new Date(b.billDate) < dayEnd) {
      const k = dayKey(b.billDate); if (billsTrendMap.has(k)) billsTrendMap.get(k).raised++;
    }
    if (b.approvedAt && new Date(b.approvedAt) >= trend30Start && new Date(b.approvedAt) < dayEnd) {
      const k = dayKey(b.approvedAt); if (billsTrendMap.has(k)) billsTrendMap.get(k).approved++;
    }
    if (b.paymentDate && new Date(b.paymentDate) >= trend30Start && new Date(b.paymentDate) < dayEnd) {
      const k = dayKey(b.paymentDate); if (billsTrendMap.has(k)) billsTrendMap.get(k).paid++;
    }
  }
  const billsTrend = [...billsTrendMap.entries()].map(([date, v]) => ({ date, ...v }));

  // Aging report — unpaid bills, age = days since billDate (fallback createdAt)
  const agingCounts = AGING_BUCKETS.map(() => ({ count: 0, amount: 0 }));
  const agingTable = [];
  const heatmapMap = new Map(); // `${projectId}|${bucketLabel}` -> count
  let oldestPending = null;
  const now = new Date();
  for (const b of unpaidBills) {
    const raisedAt = b.billDate || b.createdAt;
    const days = daysBetween(raisedAt, now);
    const bIdx = agingBucketIndex(days);
    agingCounts[bIdx].count++;
    agingCounts[bIdx].amount += b.amount || 0;
    agingTable.push({
      contractor: b.vendorName, project: b.projectName,
      projectLocation: projectLocation.get(String(b.projectId)) || '',
      billNo: b.billNo,
      amount: b.amount || 0, daysPending: days,
      status: b.status === 'payment-initiated' ? 'Awaiting Release'
        : b.status === 'approved' ? 'Payment Pending'
        : b.status === 'verified' ? 'Approval Pending'
        : 'Verification Pending',
    });
    if (b.projectId) {
      const hKey = `${b.projectId}|${AGING_BUCKETS[bIdx].label}`;
      heatmapMap.set(hKey, (heatmapMap.get(hKey) || 0) + 1);
    }
    if (!oldestPending || days > oldestPending.daysPending) {
      oldestPending = { contractor: b.vendorName, project: b.projectName, amount: b.amount || 0, daysPending: days };
    }
  }
  agingTable.sort((a, b) => b.daysPending - a.daysPending);
  const agingHeatmap = [...heatmapMap.entries()].map(([key, count]) => {
    const [pid, bucket] = key.split('|');
    return { projectId: pid, projectName: projectName.get(pid) || 'Unknown', projectLocation: projectLocation.get(pid) || '', bucket, count };
  });

  // Approval-cycle timings (days), across bills that have the relevant timestamps
  const verifyTimes = [], approveTimes = [], paymentTimes = [];
  for (const b of runningBills) {
    if (b.verifiedAt && (b.billDate || b.createdAt)) verifyTimes.push(daysBetween(b.billDate || b.createdAt, b.verifiedAt));
    if (b.approvedAt && b.verifiedAt) approveTimes.push(daysBetween(b.verifiedAt, b.approvedAt));
    if (b.paymentDate && b.approvedAt) paymentTimes.push(daysBetween(b.approvedAt, b.paymentDate));
  }
  const approvalTimes = {
    avgVerificationDays: avg(verifyTimes),
    avgApprovalDays: avg(approveTimes),
    avgPaymentDays: avg(paymentTimes),
  };

  // Top delayed contractors / projects (by currently-unpaid bills)
  const byContractor = new Map(), byProjectDelay = new Map();
  for (const b of unpaidBills) {
    const days = daysBetween(b.billDate || b.createdAt, now);
    if (b.vendorName) {
      if (!byContractor.has(b.vendorName)) byContractor.set(b.vendorName, { pendingAmount: 0, maxDays: 0, count: 0 });
      const c = byContractor.get(b.vendorName);
      c.pendingAmount += b.amount || 0; c.maxDays = Math.max(c.maxDays, days); c.count++;
    }
    if (b.projectId) {
      const key = String(b.projectId);
      if (!byProjectDelay.has(key)) byProjectDelay.set(key, { projectName: b.projectName, pendingAmount: 0, days: [] });
      const p = byProjectDelay.get(key);
      p.pendingAmount += b.amount || 0; p.days.push(days);
    }
  }
  const topDelayedContractors = [...byContractor.entries()]
    .map(([vendorName, v]) => ({ vendorName, pendingAmount: v.pendingAmount, daysWaiting: v.maxDays, billCount: v.count }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting).slice(0, 5);
  const topDelayedProjects = [...byProjectDelay.entries()]
    .map(([projectId, v]) => ({ projectId, projectName: v.projectName, projectLocation: projectLocation.get(projectId) || '', pendingAmount: v.pendingAmount, avgDelayDays: avg(v.days) }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount).slice(0, 5);

  // Advance payments list (most recent 15)
  const advancePaymentsList = [...advanceSlips]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 15)
    .map(a => ({
      vendorName: a.contractorName, projectName: a.projectName,
      projectLocation: projectLocation.get(String(a.projectId)) || '',
      amount: a.amount,
      reason: a.reference || a.notes || '—', adjusted: a.amountRecovered || 0,
      balance: (a.amount || 0) - (a.amountRecovered || 0), date: a.date,
    }));

  // Alerts
  const alerts = [];
  const critical16Plus = agingCounts[3];
  if (critical16Plus.count > 0) alerts.push(`${critical16Plus.count} bill${critical16Plus.count !== 1 ? 's' : ''} pending payment for more than 15 days (₹${Math.round(critical16Plus.amount).toLocaleString('en-IN')})`);
  if (outstandingLiability > 0) alerts.push(`₹${Math.round(outstandingLiability).toLocaleString('en-IN')} approved and awaiting payment`);
  if (oldestPending) alerts.push(`${oldestPending.contractor || 'A contractor'} has been waiting ${oldestPending.daysPending} days for ₹${Math.round(oldestPending.amount).toLocaleString('en-IN')}`);
  const topProjToday = [...projPerf.values()].sort((a, b) => b.releasedAmount - a.releasedAmount)[0];
  if (topProjToday && topProjToday.releasedAmount > 0) alerts.push(`${topProjToday.projectName} released the most this period: ₹${Math.round(topProjToday.releasedAmount).toLocaleString('en-IN')}`);
  if (amountReleasedToday === 0 && woToday.length === 0 && brToday.length === 0) alerts.push('No activity recorded for the selected period');

  // Simple payment-health score: % of paid bills settled within 15 days of raising
  const paidWithDays = paidBills.filter(b => b.billDate && b.paymentDate).map(b => daysBetween(b.billDate, b.paymentDate));
  const onTimePaid = paidWithDays.filter(d => d <= 15).length;
  const healthScore = paidWithDays.length ? Math.round((onTimePaid / paidWithDays.length) * 100) : 100;

  const financial = {
    kpis: {
      amountReleasedToday, billsRaisedValueToday, approvedValueToday,
      pendingValueToday, outstandingLiability, advanceAmountToday,
    },
    comparisons: financialComparisons,
    details: financialDetails,
    paymentBreakdown,
    dailyReleaseTrend,
    billsTrend,
    aging: {
      buckets: AGING_BUCKETS.map((b, i) => ({ label: b.label, count: agingCounts[i].count, amount: Math.round(agingCounts[i].amount) })),
      table: agingTable.slice(0, 50),
      heatmap: agingHeatmap,
      oldestPending,
    },
    approvalTimes,
    topDelayedContractors,
    topDelayedProjects,
    advancePaymentsList,
    alerts,
    healthScore: { score: healthScore, status: healthScore >= 90 ? 'good' : healthScore >= 70 ? 'warning' : 'critical' },
  };

  // ── Morning Brief — narrative bullets, split by theme so each view only
  // surfaces highlights about its own numbers (no Executive view to share one
  // combined feed anymore) ──
  const operationalBriefs = [];
  const financialBriefs = [];
  const periodWord = isSingleDay ? 'today' : 'in this period';

  const woYestPct = operationalComparisons.woCreated.yesterday;
  if (isSingleDay && woYestPct !== null && woYestPct !== 0) {
    operationalBriefs.push(`Work Orders ${woYestPct > 0 ? 'increased' : 'decreased'} by ${Math.abs(woYestPct)}% compared to yesterday.`);
  }
  if (progressEntriesToday > 0) {
    const woWithProgress = new Set(siteProgressToday.map(s => s.workOrderNo)).size;
    operationalBriefs.push(`${progressEntriesToday} site progress ${progressEntriesToday !== 1 ? 'entries' : 'entry'} logged across ${woWithProgress} work order${woWithProgress !== 1 ? 's' : ''} ${periodWord}.`);
  }
  if (pendingApprovalsList.length > 0) {
    operationalBriefs.push(`${pendingApprovalsList.length} bill request${pendingApprovalsList.length !== 1 ? 's' : ''} waiting on approval.`);
  }
  if (activeContractors.size > 0) {
    operationalBriefs.push(`${activeContractors.size} contractor${activeContractors.size !== 1 ? 's' : ''} active ${periodWord}.`);
  }
  if (operationalBriefs.length === 0) operationalBriefs.push('No notable operational activity for the selected period.');

  const releasedProjectCount = new Set(rbPaidToday.map(b => String(b.projectId)).filter(Boolean)).size;
  if (amountReleasedToday > 0) {
    financialBriefs.push(`₹${Math.round(amountReleasedToday).toLocaleString('en-IN')} released${releasedProjectCount ? ` across ${releasedProjectCount} project${releasedProjectCount !== 1 ? 's' : ''}` : ''} ${periodWord}.`);
  }
  if (billsRaisedValueToday > 0) {
    const byProjToday = new Map();
    for (const b of billsRaisedToday) byProjToday.set(b.projectName, (byProjToday.get(b.projectName) || 0) + (b.amount || 0));
    const [topName, topAmt] = [...byProjToday.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    if (topName) financialBriefs.push(`${topName} contributed ${Math.round((topAmt / billsRaisedValueToday) * 100)}% of ${isSingleDay ? "today's" : "this period's"} billing.`);
  }
  if (critical16Plus.count > 0) {
    financialBriefs.push(`${critical16Plus.count} bill${critical16Plus.count !== 1 ? 's' : ''} crossed the payment SLA (16+ days overdue).`);
  }
  const statusCounts = new Map();
  for (const r of agingTable) statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
  const [bottleneckStatus, bottleneckCount] = [...statusCounts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (bottleneckStatus && bottleneckCount >= 2) {
    financialBriefs.push(`${bottleneckStatus} is currently the biggest bottleneck (${bottleneckCount} bill${bottleneckCount !== 1 ? 's' : ''}).`);
  }
  if (financialBriefs.length === 0) financialBriefs.push('No notable financial activity for the selected period.');

  operational.briefs = operationalBriefs;
  financial.briefs = financialBriefs;

  success(res, {
    meta: {
      date: dayKey(new Date(dayEnd.getTime() - DAY_MS)),
      dateFrom: rangeFrom ? dayKey(dayStart) : null,
      dateTo: dayKey(new Date(dayEnd.getTime() - DAY_MS)),
      isSingleDay,
      projectId: projectId || null,
      generatedAt: new Date(),
    },
    operational, financial,
  });
});
