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
//   - paidAmount: netPayable of paid bills (cash out, after TDS/adjustment).
//   - certifiedUnpaid: netAfterHold of bills still 'approved' (certified but
//     not yet paid). This — not certifiedNet - paidAmount — is the real
//     outstanding: that difference also contains the TDS/adjustment withheld on
//     bills that are already fully paid, which is not owed to anyone.
//   - remainingContract: contract minus what has been paid before TDS
//     (paidGross), so a fully paid project with TDS doesn't show a remainder.
const { billFinancialsForBill } = require('./billFinancials');
const {
  isCountableWo, scopeProgress, daysSince, lastStatusChangeAt, HEALTH_THRESHOLDS,
} = require('./projectStageRules');

const isRejectedBill = (b) => b.status === 'rejected' || b.manualApprovalStatus === 'rejected';
const isAdvanceBill = (b) => String(b.billType || '').startsWith('advance');
const isWorkBill = (b) => !isRejectedBill(b) && !b.isUnsubmittedDraft && !isAdvanceBill(b);

function computeProjectRollup(wos, bills) {
  const countedWos = wos.filter(isCountableWo);
  const awardedContractValue = countedWos.reduce((s, w) => s + (w.contractValue || 0), 0);
  const { executedValue: workExecutedValue, percent: progress } = scopeProgress(countedWos);

  const billedGross = bills.filter(isWorkBill).reduce((s, b) => s + (b.amount || 0), 0);
  const advanceAmount = bills.filter(b => isAdvanceBill(b) && !isRejectedBill(b) && !b.isUnsubmittedDraft)
    .reduce((s, b) => s + (b.amount || 0), 0);

  let certifiedNet = 0, paidAmount = 0, paidGross = 0, certifiedUnpaid = 0, overdueAmount = 0;
  for (const b of bills) {
    if (b.status !== 'approved' && b.status !== 'paid') continue;
    const f = billFinancialsForBill(b);
    certifiedNet += f.netAfterHold;
    if (b.status === 'paid') {
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
    advanceAmount,
    certifiedNet,
    paidAmount,
    paidGross,
    certifiedUnpaid,
    overdueAmount,
    remainingContract: Math.max(0, awardedContractValue - paidGross),
  };
}

module.exports = { computeProjectRollup, isRejectedBill, isAdvanceBill, isWorkBill };
