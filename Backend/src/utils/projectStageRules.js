// Phase 2 of the Projects Overview executive dashboard rebuild — Overall
// Stage / Bottleneck / Health rules, plus "Needs Your Attention" alerts and
// "If This Continues" forecasts.
//
// Everything here is PURE and DETERMINISTIC: given the same WorkOrders/
// RunningBills/BillRequests for a project (the exact same in-memory buckets
// executiveDashboardController.js already builds — nothing is re-queried
// here), the same answer comes out every time. No AI, no per-project
// overrides, no hardcoded project names/ids anywhere in this file.
//
// Every signal is traced to a real field on WorkOrder/RunningBill/
// BillRequest/Project (see the model files under Backend/src/models/) — if a
// signal can't honestly be computed from what's actually on those models, it
// is OMITTED, not faked. Notably: none of these three models stamp "entered
// status X at time T" for every status directly. RunningBill/BillRequest DO
// keep an append-only `approvalHistory` array (stage/action/at), which is the
// most accurate "when did this doc last change status" signal available —
// used here in preference to `updatedAt` (which technically only means
// "last saved", i.e. any field changing bumps it — the same true for
// mongoose timestamps in general). Where a doc has never gone through an
// approval step (e.g. a bill still in 'draft'), we fall back to `createdAt`.

// ── Same status vocabularies executiveDashboardController.js already uses —
// duplicated here as their own constants rather than imported, so this
// module stays a self-contained, easily-unit-testable rules file. Keep in
// sync by hand if the controller's own lists ever change. ───────────────────
const PENDING_BILL_REQ_STATUSES = ['pending', 'pending-gm', 'pending-l3', 'pending-l4'];
const CLOSED_BILL_STATUSES      = ['approved', 'paid', 'rejected'];
const OPEN_BILL_STATUSES        = ['draft', 'verify-done', 'l1-approved', 'sent-to-tms', 'hold'];

// Explicit thresholds — every "aged N+ days" rule below reads from here, not
// a magic number buried in a conditional, so the actual policy is visible
// and adjustable in one place.
const HEALTH_THRESHOLDS = {
  // Certified-but-unpaid bill, days since it was certified.
  certifiedUnpaidAttentionDays: 7,
  certifiedUnpaidCriticalDays: 30,
  // A single bill request/bill sitting in one non-terminal status.
  stuckStatusAttentionDays: 15,
  stuckStatusCriticalDays: 30,
  // billedGross exceeding workExecutedValue — treated as a fraction of
  // workExecutedValue (guards against dividing by ~0 on a brand-new project
  // with no executed value yet — see overbillingSeverity below).
  overbillingAttentionRatio: 0.05,  // 5% over executed value
  overbillingCriticalRatio: 0.15,   // 15% over executed value
  // "No progress logged" window for an active WorkOrder.
  noProgressAttentionDays: 21,
  noProgressCriticalDays: 45,
  // WorkOrder issued with literally zero completedQty across all scope items.
  zeroProgressAlertDays: 14,
  // Bill pending approval (BillRequest or RunningBill non-terminal status).
  pendingApprovalAlertDays: 7,
};

function daysSince(date) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// Most recent approvalHistory entry's `at`, or createdAt if there's no
// history yet (e.g. a bill still sitting in its very first status) — the
// best available proxy this data model offers for "when did this document
// last change status".
function lastStatusChangeAt(doc) {
  const hist = doc.approvalHistory;
  if (Array.isArray(hist) && hist.length > 0) {
    return hist[hist.length - 1].at || doc.updatedAt || doc.createdAt;
  }
  return doc.updatedAt || doc.createdAt;
}

function isWoApproved(wo) {
  return wo.approvalStatus === 'approved';
}

function woCompletedQty(wo) {
  return (wo.scopeItems || []).reduce((s, si) => s + (si.completedQty || 0), 0);
}

function woHasAnyProgress(wo) {
  return woCompletedQty(wo) > 0;
}

// Sum of plannedQty across every scope item — a WO can be 'approved' with
// every scope item's plannedQty left at 0 (seen in practice on legacy/
// migrated work orders carrying a comment like "physically signed", never
// given a real quantity plan). Such a WO has literally nothing to make
// progress ON, so it must not be flagged as "issued but zero progress,
// needs attention" alongside real work orders that were actually given a
// scope and then neglected — that would be flagging an empty record as a
// stalled one.
function woHasPlannedScope(wo) {
  return (wo.scopeItems || []).reduce((s, si) => s + (si.plannedQty || 0), 0) > 0;
}

// Latest progress-entry date across every scope item of a WorkOrder, or null
// if none logged yet.
function woLastProgressDate(wo) {
  let latest = null;
  for (const si of wo.scopeItems || []) {
    for (const pe of si.progressEntries || []) {
      if (pe.invalidated && pe.invalidated.done) continue;
      const d = new Date(pe.date);
      if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
    }
  }
  return latest;
}

// ── Overall Stage ────────────────────────────────────────────────────────
// Precedence (checked top to bottom — first match wins):
//   1. Completed      — work fully done AND certifiedNet === paidAmount AND
//                        no bill requests still open. Checked first so a
//                        genuinely finished project never gets relabeled by
//                        a later, broader rule.
//   2. Work in Progress — an approved WorkOrder exists, some scope item has
//                        completedQty > 0, AND site execution genuinely
//                        isn't finished yet (some scope item's completedQty
//                        is still short of its plannedQty) — checked BEFORE
//                        Billing so a project mid-construction doesn't get
//                        stuck showing "Billing" just because one bill is
//                        mid-approval while the crew keeps working. Once
//                        every scope item is fully executed (completedQty >=
//                        plannedQty), the project is done being "worked on"
//                        even if billing hasn't caught up — that's Billing's
//                        job below, not Work in Progress's.
//   3. Billing         — a RunningBill or BillRequest exists in a
//                        non-terminal status right now AND nothing above
//                        applied — an in-flight billing action to take.
//   4. Payment Pending — certifiedNet > paidAmount and nothing is actively
//                        mid-flight (rules 2-3 already ruled that out) —
//                        money has been certified but not yet released.
//   5. Work Orders Issued — an approved WorkOrder exists but nothing above
//                        applied (rules 2-4 already ruled out any currently
//                        active progress/billing/payment situation). A
//                        project with only closed/rejected bills or bill
//                        requests and no other activity still counts here,
//                        not Planning — it has a real approved WorkOrder.
//   6. Planning        — fallback: no approved WorkOrder at all.
function computeOverallStage({ project, wos, bills, billReqs, certifiedNet, paidAmount }) {
  const approvedWos = wos.filter(isWoApproved);
  const hasApprovedWo = approvedWos.length > 0;
  const hasOpenBill = bills.some(b => OPEN_BILL_STATUSES.includes(b.status));
  const hasOpenBillReq = billReqs.some(b => PENDING_BILL_REQ_STATUSES.includes(b.status));

  const fullyBilled = approvedWos.length > 0 &&
    approvedWos.every(wo => (wo.scopeItems || []).every(si => (si.completedQty || 0) <= (si.lastBilledQty || 0) + 0.0001));

  // `anyProgress` and `stillExecuting` are BOTH derived from this one
  // aggregate (sum plannedQty/completedQty across every scope item on every
  // work order — approved or not), the exact same computation
  // executiveDashboardController.js uses for the `progress` field shown to
  // the user. Deriving both flags from the identical totals — instead of
  // one checking only approved WOs and the other checking a per-item split
  // — is what keeps this in lockstep with the displayed percentage: 0%
  // progress can never read as "Work in Progress" (anyProgress requires
  // totalCompletedQty > 0) and 100% progress can never read as "Work in
  // Progress" either (stillExecuting requires completed < planned).
  let totalPlannedQty = 0, totalCompletedQty = 0;
  for (const wo of wos) {
    for (const si of wo.scopeItems || []) {
      totalPlannedQty   += si.plannedQty   || 0;
      totalCompletedQty += si.completedQty || 0;
    }
  }
  const anyProgress = totalCompletedQty > 0;
  const stillExecuting = totalPlannedQty > 0 && totalCompletedQty < totalPlannedQty;

  if (hasApprovedWo && anyProgress && fullyBilled && certifiedNet === paidAmount && !hasOpenBillReq && !hasOpenBill) {
    return 'Completed';
  }
  if (hasApprovedWo && anyProgress && stillExecuting) {
    return 'Work in Progress';
  }
  if (hasOpenBill || hasOpenBillReq) {
    return 'Billing';
  }
  if (certifiedNet > paidAmount) {
    return 'Payment Pending';
  }
  if (hasApprovedWo) {
    return 'Work Orders Issued';
  }
  return 'Planning';
}

// ── Bottleneck ───────────────────────────────────────────────────────────
// Returns the single most urgent concrete thing stuck, or null if nothing
// qualifies. Checked in this order (most actionable/urgent first):
//   1. Bills stuck in a non-terminal status 15+ days (count + oldest days).
//   2. Certified-but-unpaid amount aged past the Attention threshold.
//   3. An approved WorkOrder with zero completedQty, aged past the alert
//      window (issued but nothing has started).
//   4. An approved WorkOrder with no progress logged in the "no progress"
//      window even though some work IS recorded (stalled mid-way).
function computeBottleneck({ wos, bills, billReqs, certifiedNet, paidAmount }) {
  const stuckBillReqs = billReqs
    .filter(b => PENDING_BILL_REQ_STATUSES.includes(b.status))
    .map(b => ({ doc: b, days: daysSince(lastStatusChangeAt(b)) }))
    .filter(x => x.days !== null && x.days >= HEALTH_THRESHOLDS.stuckStatusAttentionDays);
  const stuckBills = bills
    .filter(b => OPEN_BILL_STATUSES.includes(b.status))
    .map(b => ({ doc: b, days: daysSince(lastStatusChangeAt(b)) }))
    .filter(x => x.days !== null && x.days >= HEALTH_THRESHOLDS.stuckStatusAttentionDays);

  const allStuck = [...stuckBillReqs, ...stuckBills];
  if (allStuck.length > 0) {
    const oldest = allStuck.reduce((a, b) => (b.days > a.days ? b : a));
    const label = oldest.doc.reqNo ? `Bill Request ${oldest.doc.reqNo}` : `Bill ${oldest.doc.billNo || oldest.doc._id}`;
    if (allStuck.length === 1) {
      return `${label} awaiting approval ${oldest.days} days (status: ${oldest.doc.status})`;
    }
    return `${allStuck.length} bills/requests awaiting approval, oldest ${oldest.days} days (${label})`;
  }

  if (certifiedNet > paidAmount) {
    const unpaidBills = bills.filter(b => CLOSED_BILL_STATUSES.includes(b.status) && b.status !== 'paid' && b.status === 'approved');
    const oldestUnpaidDays = unpaidBills.length
      ? Math.max(...unpaidBills.map(b => daysSince(lastStatusChangeAt(b)) ?? 0))
      : null;
    if (oldestUnpaidDays !== null && oldestUnpaidDays >= HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays) {
      return `₹${Math.round(certifiedNet - paidAmount).toLocaleString('en-IN')} certified but unpaid, oldest bill ${oldestUnpaidDays} days`;
    }
  }

  const approvedWos = wos.filter(isWoApproved);
  for (const wo of approvedWos) {
    const issuedDays = daysSince(wo.issueDate);
    if (issuedDays === null) continue;
    if (woHasPlannedScope(wo) && !woHasAnyProgress(wo) && issuedDays >= HEALTH_THRESHOLDS.zeroProgressAlertDays) {
      return `${wo.workOrderNo} issued ${issuedDays} days ago, no progress logged`;
    }
    const lastProgress = woLastProgressDate(wo);
    const daysSinceProgress = lastProgress ? daysSince(lastProgress) : issuedDays;
    if (woHasAnyProgress(wo) && daysSinceProgress !== null && daysSinceProgress >= HEALTH_THRESHOLDS.noProgressAttentionDays) {
      return `${wo.workOrderNo} has had no new progress logged in ${daysSinceProgress} days`;
    }
  }

  return null;
}

// ── Health ───────────────────────────────────────────────────────────────
// Healthy / Attention / Critical, worst-signal-wins. Signals honestly
// computable from real fields:
//   - Certified-unpaid age (30+ days -> Critical, 7-15+ -> Attention).
//   - Overbilling: billedGross exceeding workExecutedValue by a material
//     margin (ratio-based, not absolute, so a huge project's small rounding
//     gap doesn't falsely trip Critical).
//   - A single bill/bill-request stuck in one non-terminal status 30+ days
//     -> Critical, 15-30 -> Attention.
// Approximated, and documented as such: "stuck in status" uses
// lastStatusChangeAt (approvalHistory's last entry, or createdAt) — the best
// available proxy, not a guaranteed exact "entered this status at" stamp for
// every possible transition path.
function computeHealth({ workExecutedValue, billedGross, certifiedNet, paidAmount, bills, billReqs }) {
  let worst = 'Healthy';
  const reasons = [];
  const escalate = (level, reason) => {
    reasons.push(reason);
    if (level === 'Critical') worst = 'Critical';
    else if (level === 'Attention' && worst !== 'Critical') worst = 'Attention';
  };

  // Certified-unpaid age
  if (certifiedNet > paidAmount) {
    const unpaidBills = bills.filter(b => b.status === 'approved');
    const oldestDays = unpaidBills.length
      ? Math.max(...unpaidBills.map(b => daysSince(lastStatusChangeAt(b)) ?? 0))
      : null;
    if (oldestDays !== null) {
      if (oldestDays >= HEALTH_THRESHOLDS.certifiedUnpaidCriticalDays) {
        escalate('Critical', `Certified amount unpaid for ${oldestDays} days`);
      } else if (oldestDays >= HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays) {
        escalate('Attention', `Certified amount unpaid for ${oldestDays} days`);
      }
    }
  }

  // Overbilling ratio (guard divide-by-zero: only evaluated once there's
  // executed value to compare against).
  if (workExecutedValue > 0 && billedGross > workExecutedValue) {
    const ratio = (billedGross - workExecutedValue) / workExecutedValue;
    if (ratio >= HEALTH_THRESHOLDS.overbillingCriticalRatio) {
      escalate('Critical', `Billed ${Math.round(ratio * 100)}% above executed value`);
    } else if (ratio >= HEALTH_THRESHOLDS.overbillingAttentionRatio) {
      escalate('Attention', `Billed ${Math.round(ratio * 100)}% above executed value`);
    }
  }

  // Stuck-in-status
  const openDocs = [
    ...bills.filter(b => OPEN_BILL_STATUSES.includes(b.status)),
    ...billReqs.filter(b => PENDING_BILL_REQ_STATUSES.includes(b.status)),
  ];
  for (const doc of openDocs) {
    const days = daysSince(lastStatusChangeAt(doc));
    if (days === null) continue;
    if (days >= HEALTH_THRESHOLDS.stuckStatusCriticalDays) {
      escalate('Critical', `Stuck in status "${doc.status}" for ${days} days`);
    } else if (days >= HEALTH_THRESHOLDS.stuckStatusAttentionDays) {
      escalate('Attention', `Stuck in status "${doc.status}" for ${days} days`);
    }
  }

  return { health: worst, healthReasons: reasons };
}

// Computes overallStage/bottleneck/health for one project row. `financials`
// carries the numbers executiveDashboardController.js already computed for
// this project (workExecutedValue, billedGross, certifiedNet, paidAmount) —
// reused, never recomputed here.
function computeProjectStageInfo({ project, wos, bills, billReqs, financials }) {
  const { workExecutedValue, billedGross, certifiedNet, paidAmount } = financials;

  const overallStage = computeOverallStage({ project, wos, bills, billReqs, certifiedNet, paidAmount });
  const bottleneck = computeBottleneck({ wos, bills, billReqs, certifiedNet, paidAmount });
  const { health, healthReasons } = computeHealth({ workExecutedValue, billedGross, certifiedNet, paidAmount, bills, billReqs });

  return { overallStage, bottleneck, health, healthReasons };
}

// ── Alerts ("Needs Your Attention") ─────────────────────────────────────
// Builds every qualifying alert for ONE project. The caller (controller)
// concatenates across projects, sorts, and caps the list.
function buildProjectAlerts({ project, wos, bills, billReqs, financials }) {
  const { workExecutedValue, billedGross, certifiedNet, paidAmount } = financials;
  const alerts = [];
  const projectId = String(project._id);
  const projectName = project.name;

  // 1. Billing exceeds executed value
  if (workExecutedValue > 0 && billedGross > workExecutedValue) {
    const overAmount = Math.round(billedGross - workExecutedValue);
    const ratio = overAmount / workExecutedValue;
    alerts.push({
      type: 'billing-exceeds-executed',
      severity: ratio >= HEALTH_THRESHOLDS.overbillingCriticalRatio ? 'critical' : 'attention',
      projectId, projectName,
      title: 'Billing exceeds executed value',
      message: `${project.name}: billed ₹${billedGross.toLocaleString('en-IN')} against executed value of ₹${workExecutedValue.toLocaleString('en-IN')} — ₹${overAmount.toLocaleString('en-IN')} over.`,
      amount: overAmount,
      link: `/dashboard?projectId=${projectId}`,
    });
  }

  // 2. Bill/BillRequest pending approval beyond threshold
  for (const br of billReqs.filter(b => PENDING_BILL_REQ_STATUSES.includes(b.status))) {
    const days = daysSince(lastStatusChangeAt(br));
    if (days !== null && days >= HEALTH_THRESHOLDS.pendingApprovalAlertDays) {
      alerts.push({
        type: 'bill-request-pending-approval',
        severity: days >= HEALTH_THRESHOLDS.stuckStatusCriticalDays ? 'critical' : 'attention',
        projectId, projectName,
        title: 'Bill request pending approval',
        message: `${br.reqNo} (${project.name}) has been in status "${br.status}" for ${days} days.`,
        ageDays: days,
        link: `/bill-requests?open=${br._id}`,
      });
    }
  }
  for (const b of bills.filter(x => OPEN_BILL_STATUSES.includes(x.status))) {
    const days = daysSince(lastStatusChangeAt(b));
    if (days !== null && days >= HEALTH_THRESHOLDS.pendingApprovalAlertDays) {
      alerts.push({
        type: 'bill-pending-approval',
        severity: days >= HEALTH_THRESHOLDS.stuckStatusCriticalDays ? 'critical' : 'attention',
        projectId, projectName,
        title: 'Bill pending approval',
        message: `${b.billNo} (${project.name}) has been in status "${b.status}" for ${days} days.`,
        ageDays: days,
        link: `/accounts-payment?bill=${b._id}`,
      });
    }
  }

  // 3. Certified payment overdue
  if (certifiedNet > paidAmount) {
    const unpaidBills = bills.filter(b => b.status === 'approved');
    const oldest = unpaidBills.reduce((worst, b) => {
      const d = daysSince(lastStatusChangeAt(b));
      return (d !== null && (!worst || d > worst.days)) ? { bill: b, days: d } : worst;
    }, null);
    if (oldest && oldest.days >= HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays) {
      const overdueAmount = Math.round(certifiedNet - paidAmount);
      alerts.push({
        type: 'certified-payment-overdue',
        severity: oldest.days >= HEALTH_THRESHOLDS.certifiedUnpaidCriticalDays ? 'critical' : 'attention',
        projectId, projectName,
        title: 'Certified payment overdue',
        message: `${project.name}: ₹${overdueAmount.toLocaleString('en-IN')} certified but unpaid — oldest certified bill ${oldest.bill.billNo} is ${oldest.days} days old.`,
        ageDays: oldest.days,
        amount: overdueAmount,
        link: `/accounts-payment?bill=${oldest.bill._id}`,
      });
    }
  }

  // 4 & 5. No-progress / zero-progress on approved WorkOrders
  for (const wo of wos.filter(isWoApproved)) {
    const issuedDays = daysSince(wo.issueDate);
    if (issuedDays === null) continue;
    if (woHasPlannedScope(wo) && !woHasAnyProgress(wo) && issuedDays >= HEALTH_THRESHOLDS.zeroProgressAlertDays) {
      alerts.push({
        type: 'work-order-zero-progress',
        severity: issuedDays >= HEALTH_THRESHOLDS.noProgressCriticalDays ? 'critical' : 'attention',
        projectId, projectName,
        title: 'Work order issued, no progress recorded',
        message: `${wo.workOrderNo} (${project.name}) was issued ${issuedDays} days ago with zero completed quantity logged.`,
        ageDays: issuedDays,
        link: `/work-items/${wo._id}`,
      });
      continue; // don't double-report as "no progress recorded" below
    }
    const lastProgress = woLastProgressDate(wo);
    if (woHasAnyProgress(wo) && lastProgress) {
      const staleDays = daysSince(lastProgress);
      if (staleDays !== null && staleDays >= HEALTH_THRESHOLDS.noProgressAttentionDays) {
        alerts.push({
          type: 'no-progress-recorded',
          severity: staleDays >= HEALTH_THRESHOLDS.noProgressCriticalDays ? 'critical' : 'attention',
          projectId, projectName,
          title: 'No progress recorded recently',
          message: `${wo.workOrderNo} (${project.name}) has had no new progress logged in ${staleDays} days.`,
          ageDays: staleDays,
          link: `/work-items/${wo._id}`,
        });
      }
    }
  }

  return alerts;
}

// Stable id: deterministic hash of type+entity so the same underlying issue
// always gets the same alert id across requests (no DB write needed for an
// id sequence).
function stableAlertId(type, entityId) {
  const str = `${type}:${entityId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `alert-${Math.abs(hash).toString(36)}`;
}

// ── Forecasts ("If This Continues") ─────────────────────────────────────
// Only what's honestly computable with simple, explainable arithmetic — see
// module comment at top of file for what's NOT attempted (nothing beyond
// straight-line extrapolation from current progress/cost ratios).
const FORECAST_MIN_PROGRESS_PERCENT = 10; // below this, extrapolation is too noisy to report

function computeBudgetRiskForecast({ project, awardedContractValue, workExecutedValue, billedGross, progress }) {
  const projectId = String(project._id);
  const projectName = project.name;
  if (progress < FORECAST_MIN_PROGRESS_PERCENT || awardedContractValue <= 0) {
    return {
      type: 'budget-risk', projectId, projectName,
      message: 'Insufficient data for reliable forecast',
      basis: `progress=${progress}% (need >= ${FORECAST_MIN_PROGRESS_PERCENT}%) or no contract value on record`,
    };
  }
  // costUsedRatio = billedGross / contractValue vs progress% (workExecuted
  // basis) — if cost is running ahead of physical progress, straight-line
  // extrapolating that same ratio to 100% progress projects a final cost
  // above the contract value.
  const costUsedRatio = billedGross / awardedContractValue; // 0..N
  const progressRatio = progress / 100;
  const projectedFinalCost = Math.round(awardedContractValue * (costUsedRatio / progressRatio));
  const overrun = projectedFinalCost - awardedContractValue;
  const overrunPercent = Math.round((overrun / awardedContractValue) * 100);
  return {
    type: 'budget-risk', projectId, projectName,
    projectedFinalCost,
    contractValue: awardedContractValue,
    overrunPercent,
    flagged: overrunPercent >= 5,
    message: overrunPercent >= 5
      ? `At the current cost-vs-progress ratio, ${projectName} is on pace to finish ~${overrunPercent}% over its ₹${awardedContractValue.toLocaleString('en-IN')} contract value (projected ₹${projectedFinalCost.toLocaleString('en-IN')}).`
      : `${projectName} is tracking within budget at the current cost-vs-progress ratio (projected ₹${projectedFinalCost.toLocaleString('en-IN')} vs ₹${awardedContractValue.toLocaleString('en-IN')} contract value).`,
    basis: `Linear extrapolation of billedGross/contractValue (${(costUsedRatio * 100).toFixed(1)}% cost used) against ${progress}% physical progress.`,
  };
}

module.exports = {
  HEALTH_THRESHOLDS,
  FORECAST_MIN_PROGRESS_PERCENT,
  daysSince,
  lastStatusChangeAt,
  computeProjectStageInfo,
  buildProjectAlerts,
  stableAlertId,
  computeBudgetRiskForecast,
  isWoApproved,
  woHasAnyProgress,
  woHasPlannedScope,
  OPEN_BILL_STATUSES,
  PENDING_BILL_REQ_STATUSES,
};
