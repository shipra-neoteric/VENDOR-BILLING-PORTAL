// Central definition of every approval stage the Slack integration notifies
// on — one entry per approvalType. Deliberately pure data (no controller
// function references) so this can be required from anywhere (controllers,
// utils) without circular-require risk. slackController.js keeps its own
// separate map of the actual approve/reject functions to call, since it
// already requires those controllers directly.

const money = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const contractTypeLabel = (wo) => (wo.contractType === 'professional-services' ? 'Professional Services' : 'Execution');

function workOrderLines(wo, currentApproval) {
  return [
    { label: 'Project', value: wo.projectName || '—' },
    { label: 'Contractor', value: wo.vendorName || '—' },
    { label: 'Work Order', value: wo.workOrderNo },
    { label: 'Type', value: contractTypeLabel(wo) },
    { label: 'Work Description', value: (wo.scopeOfWork || '—').slice(0, 200) },
    { label: 'Work Order Value', value: money(wo.contractValue) },
    { label: 'Current Approval', value: currentApproval },
  ];
}
const workOrderDeepLink = (wo) => `/work-items/${wo._id}`;

function billRequestLines(br, currentApproval) {
  const total = (br.items || []).reduce((s, i) => s + (i.amount || 0), 0);
  return [
    { label: 'Project', value: br.projectName || '—' },
    { label: 'Contractor', value: br.vendorName || '—' },
    { label: 'Bill Request', value: br.reqNo },
    { label: 'Work Order', value: br.workOrderNo || '—' },
    { label: 'Stage', value: `Stage ${br.stageNo}` },
    { label: 'Amount', value: money(total) },
    { label: 'Current Approval', value: currentApproval },
  ];
}
const billRequestDeepLink = (br) => `/bill-requests?open=${br._id}`;

function runningBillLines(bill, currentApproval, previousApproval) {
  return [
    { label: 'Project', value: bill.projectName || '—' },
    { label: 'Contractor', value: bill.vendorName || '—' },
    { label: 'Bill', value: bill.billNo },
    { label: 'Work Order', value: bill.workOrderNo || '—' },
    { label: 'Bill Amount', value: money(bill.amount) },
    ...(previousApproval ? [{ label: 'Previous Approval', value: previousApproval }] : []),
    { label: 'Current Approval', value: currentApproval },
  ];
}
const runningBillDeepLink = (bill) => `/accounts-payment?bill=${bill._id}`;

const STAGES = {
  WORK_ORDER_CHECKER_APPROVAL: {
    entityType: 'WorkOrder', module: 'work-orders', action: 'checker', roles: ['owner'],
    title: 'Work Order — Checker (L2 AGM) Approval Required',
    buildLines: (wo) => workOrderLines(wo, 'Checker (L2 AGM)'),
    deepLinkPath: workOrderDeepLink,
  },
  WORK_ORDER_APPROVER_APPROVAL: {
    entityType: 'WorkOrder', module: 'work-orders', action: 'approver', roles: ['owner'],
    title: 'Work Order — Approver (L3 GM) Approval Required',
    buildLines: (wo) => workOrderLines(wo, 'Approver (L3 GM)'),
    deepLinkPath: workOrderDeepLink,
  },
  WORK_ORDER_OWNER_APPROVAL: {
    entityType: 'WorkOrder', module: 'work-orders', action: 'ceo-approve', roles: ['owner'],
    title: 'Work Order — L4 Owner Approval Required',
    buildLines: (wo) => workOrderLines(wo, 'L4 Owner'),
    deepLinkPath: workOrderDeepLink,
  },
  BILL_REQUEST_AGM_APPROVAL: {
    entityType: 'BillRequest', module: 'bill-requests', action: 'agm-approve', roles: ['owner', 'agm'],
    title: 'Bill Request — AGM Approval Required',
    buildLines: (br) => billRequestLines(br, 'AGM'),
    deepLinkPath: billRequestDeepLink,
  },
  BILL_REQUEST_GM_APPROVAL: {
    entityType: 'BillRequest', module: 'bill-requests', action: 'gm-approve', roles: ['owner', 'gm'],
    title: 'Bill Request — GM Approval Required',
    buildLines: (br) => billRequestLines(br, 'GM'),
    deepLinkPath: billRequestDeepLink,
  },
  PAYMENT_MANUAL_AGM_APPROVAL: {
    entityType: 'RunningBill', module: 'bill-requests', action: 'agm-approve', roles: ['owner', 'agm'],
    title: 'Accounts Payment — Manual Bill AGM Sign-off Required',
    buildLines: (bill) => runningBillLines(bill, 'AGM Sign-off'),
    deepLinkPath: runningBillDeepLink,
  },
  PAYMENT_MANUAL_GM_APPROVAL: {
    entityType: 'RunningBill', module: 'bill-requests', action: 'gm-approve', roles: ['owner', 'gm'],
    title: 'Accounts Payment — Manual Bill GM Sign-off Required',
    buildLines: (bill) => runningBillLines(bill, 'GM Sign-off', 'AGM Sign-off'),
    deepLinkPath: runningBillDeepLink,
  },
  PAYMENT_VERIFY_APPROVAL: {
    entityType: 'RunningBill', module: 'accounts-payment', action: 'verify', roles: ['owner'],
    title: 'Accounts Payment — Verification Required',
    buildLines: (bill) => runningBillLines(bill, 'Verify'),
    deepLinkPath: runningBillDeepLink,
  },
  PAYMENT_L1_AGM_APPROVAL: {
    entityType: 'RunningBill', module: 'accounts-payment', action: 'l1-agm-approve', roles: ['owner'],
    title: 'Accounts Payment — L1 AGM Approval Required',
    buildLines: (bill) => runningBillLines(bill, 'L1 AGM', 'Verified'),
    deepLinkPath: runningBillDeepLink,
  },
  PAYMENT_L2_GM_APPROVAL: {
    entityType: 'RunningBill', module: 'accounts-payment', action: 'l2-director-approve', roles: ['owner'],
    title: 'Accounts Payment — L2 GM Approval Required',
    buildLines: (bill) => runningBillLines(bill, 'L2 GM', bill.l1ApprovedBy?.name ? `L1 AGM — ${bill.l1ApprovedBy.name}` : 'L1 AGM'),
    deepLinkPath: runningBillDeepLink,
  },
};

module.exports = { STAGES };
