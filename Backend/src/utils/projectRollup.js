// Single per-project financial rollup, shared by the Dashboard / Projects
// Overview (executiveDashboardController.js) and the per-project stats
// endpoint (projectController.getProjectStats) so the two can never drift.
//
// Definitions (what each figure counts, and deliberately does not):
//   - Contract / executed / progress: only WorkOrders that are approved and not
//     cancelled (isCountableWo) — drafts, pending-approval, sent-back and
//     cancelled work orders are not awarded work.
//   - billedGross: value of WORK billed — excludes rejected bills, bills never
//     submitted, and advance bills (an advance is cash given up front, not work
//     done; it comes back through advanceRecovery on later running bills, so
//     counting both double-counts it and distorts "billed vs executed").
//   - certifiedNet: netAfterHold of approved + paid bills (advances included —
//     they are real certified money).
//   - paidAmount: netPayable of paid bills (cash out, after TDS/adjustment). While TMS is not connected, bills
//     that are Ready for TMS / Sent to TMS count as paid too (see ./paidStatuses.js).
//   - certifiedUnpaid: netAfterHold of bills still 'approved' (certified but
//     not yet paid). This — not certifiedNet - paidAmount — is the real
//     outstanding: that difference also contains the TDS/adjustment withheld on
//     bills that are already fully paid, which is not owed to anyone.
//   - remainingContract: contract minus what has been paid before TDS
//     (paidGross), so a fully paid project with TDS doesn't show a remainder.
const { billFinancialsForBill } = require('./billFinancials');
const { isPaidLike, CERTIFIED_STATUSES } = require('./paidStatuses');
const {
  isCountableWo, scopeProgress, daysSince, lastStatusChangeAt, HEALTH_THRESHOLDS,
} = require('./projectStageRules');

const isRejectedBill = (b) => b.status === 'rejected' || b.manualApprovalStatus === 'rejected';
const isAdvanceBill = (b) => String(b.billType || '').startsWith('advance');
const isWorkBill = (b) => !isRejectedBill(b) && !b.isUnsubmittedDraft && !isAdvanceBill(b);

// `cumulativeOffsets` (optional, billId -> amount from utils/cumulativeOffsets.js): the part of a cumulative bill that repeats earlier
// bills — taken off billedGross so the same work is not counted twice.
// A work order counts toward contract / executed / progress when it is approved and not cancelled, OR when a live bill
// (not rejected, not archived, not an unsubmitted draft) was raised against it — work that was billed is real work even
// if the work order itself never got its approval. (Only when it has a contract value: a ₹0 work order adds nothing to the
// contract, and its progress entries are not a trustworthy measure of executed work.)
// What one bill adds to "Billed": a work bill's gross less what is taken off it (cumulativeOffsets), an advance bill's full
// amount, nothing for rejected / unsubmitted bills. The Dashboard's category spend and monthly trend use this too, so every
// Billed figure adds up the same way.
const billedContribution = (b, offsets) => {
  if (isRejectedBill(b) || b.isUnsubmittedDraft) return 0;
  if (isAdvanceBill(b)) return b.amount || 0;
  return (b.amount || 0) - (offsets ? (offsets.get(String(b._id)) || 0) : 0);
};
const hasLiveBill = (b) => !isRejectedBill(b) && !b.isUnsubmittedDraft && !b.isArchived;
function countedWosFor(wos, bills) {
  const billed = new Set((bills || []).filter(hasLiveBill).map(b => String(b.workOrderId)));
  return wos.filter(w => isCountableWo(w) || ((w.contractValue || 0) > 0 && billed.has(String(w._id))));
}

function computeProjectRollup(wos, bills, cumulativeOffsets = null) {
  const countedWos = countedWosFor(wos, bills);
  const awardedContractValue = countedWos.reduce((s, w) => s + (w.contractValue || 0), 0);
  const { executedValue: workExecutedValue, percent: progress } = scopeProgress(countedWos);

  const advanceAmount = bills.filter(b => isAdvanceBill(b) && !isRejectedBill(b) && !b.isUnsubmittedDraft)
    .reduce((s, b) => s + (b.amount || 0), 0);
  // Billed = running bills' gross, less what repeats earlier bills or recovers an advance (cumulativeOffsets), PLUS the advances
  // given. Advances are counted because the money is out; their recovery is taken off the running bills so nothing is counted twice.
  const billedGross = bills.reduce((s, b) => s + billedContribution(b, cumulativeOffsets), 0);
  // Work billed only (no advances; a real advance recovery is not taken off) — what "billed more than executed / more than the
  // contract" health checks and alerts compare, because an advance is not work.
  const backedMap = cumulativeOffsets && cumulativeOffsets.backedMap;
  const billedWork = bills.filter(isWorkBill).reduce((s, b) => s + (b.amount || 0)
    - (cumulativeOffsets ? (cumulativeOffsets.get(String(b._id)) || 0) : 0) + (backedMap ? (backedMap.get(String(b._id)) || 0) : 0), 0);

  // Bills still waiting (in verification / approval / hold) — raised, not rejected, not yet counted as paid. Net payable, like Paid.
  const pendingBillsAmount = bills
    .filter(b => !isRejectedBill(b) && !b.isUnsubmittedDraft && !b.isArchived && !isPaidLike(b.status))
    .reduce((s, b) => s + billFinancialsForBill(b).netPayable, 0);

  let certifiedNet = 0, paidAmount = 0, paidGross = 0, certifiedUnpaid = 0, overdueAmount = 0;
  for (const b of bills) {
    if (!CERTIFIED_STATUSES.includes(b.status)) continue;
    const f = billFinancialsForBill(b);
    certifiedNet += f.netAfterHold;
    if (isPaidLike(b.status)) {
      paidAmount += f.netPayable;
      paidGross += f.netAfterHold;
    } else {
      certifiedUnpaid += f.netAfterHold;
      const days = daysSince(lastStatusChangeAt(b));
      if (days !== null && days >= HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays) overdueAmount += f.netAfterHold;
    }
  }

  return {
    countedWos,
    awardedContractValue,
    workExecutedValue,
    progress,
    billedGross,
    billedWork,
    advanceAmount,
    certifiedNet,
    paidAmount,
    paidGross,
    certifiedUnpaid,
    overdueAmount,
    remainingContract: Math.max(0, awardedContractValue - paidGross),
    pendingBillsAmount,
  };
}

module.exports = { computeProjectRollup, countedWosFor, billedContribution, isRejectedBill, isAdvanceBill, isWorkBill };
