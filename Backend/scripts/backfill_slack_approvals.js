// One-off: the Slack-approvals feature only pushes a notification at the
// moment a Work Order/Bill *transitions* into pending-final / l1-approved
// (see workOrderController.approverApprove / billController.l1AgmApprove).
// Anything that was already sitting at that stage before the feature shipped
// never triggered that hook, so this backfills those into #rahul-approvals.
// Safe to re-run — skips anything that already has a SlackApproval row.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');
const SlackApproval = require('../src/models/SlackApproval');
const { createApprovalAndNotify, resolveApproverUser } = require('../src/utils/slackApprovals');

async function backfillWorkOrders() {
  const approver = await resolveApproverUser('work-orders', 'ceo-approve');
  if (!approver) {
    console.log('No owner has a slackUserId set yet — skipping Work Order backfill.');
    return;
  }

  const pending = await WorkOrder.find({ approvalStatus: 'pending-final' });
  for (const workOrder of pending) {
    const already = await SlackApproval.findOne({ entityType: 'WorkOrder', entityId: workOrder._id, status: 'pending' });
    if (already) { console.log(`Skipped (already posted): ${workOrder.workOrderNo}`); continue; }

    await createApprovalAndNotify({
      approvalType: 'WORK_ORDER_OWNER_APPROVAL',
      entityType: 'WorkOrder',
      entityId: workOrder._id,
      approverUser: approver,
      title: 'Work Order — L4 Owner Approval Required',
      lines: [
        { label: 'Project', value: workOrder.projectName || '—' },
        { label: 'Contractor', value: workOrder.vendorName || '—' },
        { label: 'Work Order', value: workOrder.workOrderNo },
        { label: 'Work Description', value: (workOrder.scopeOfWork || '—').slice(0, 200) },
        { label: 'Work Order Value', value: `₹${(workOrder.contractValue || 0).toLocaleString('en-IN')}` },
        { label: 'Current Approval', value: 'L4 Owner' },
      ],
      deepLinkPath: `/work-items/${workOrder._id}`,
    });
    console.log(`Posted: ${workOrder.workOrderNo}`);
  }
}

async function backfillBills() {
  const approver = await resolveApproverUser('accounts-payment', 'l2-director-approve');
  if (!approver) {
    console.log('No owner has a slackUserId set yet — skipping Bill backfill.');
    return;
  }

  const pending = await RunningBill.find({ status: 'l1-approved' }).populate('l1ApprovedBy', 'name role');
  for (const bill of pending) {
    const already = await SlackApproval.findOne({ entityType: 'RunningBill', entityId: bill._id, status: 'pending' });
    if (already) { console.log(`Skipped (already posted): ${bill.billNo}`); continue; }

    await createApprovalAndNotify({
      approvalType: 'PAYMENT_L2_GM_APPROVAL',
      entityType: 'RunningBill',
      entityId: bill._id,
      approverUser: approver,
      title: 'Accounts Payment — L2 GM Approval Required',
      lines: [
        { label: 'Project', value: bill.projectName || '—' },
        { label: 'Contractor', value: bill.vendorName || '—' },
        { label: 'Bill', value: bill.billNo },
        { label: 'Work Order', value: bill.workOrderNo || '—' },
        { label: 'Bill Amount', value: `₹${(bill.amount || 0).toLocaleString('en-IN')}` },
        { label: 'Previous Approval', value: `L1 AGM${bill.l1ApprovedBy?.name ? ` — ${bill.l1ApprovedBy.name}` : ''}` },
        { label: 'Current Approval', value: 'L2 GM' },
      ],
      deepLinkPath: `/accounts-payment?bill=${bill._id}`,
    });
    console.log(`Posted: ${bill.billNo}`);
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await backfillWorkOrders();
  await backfillBills();
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
