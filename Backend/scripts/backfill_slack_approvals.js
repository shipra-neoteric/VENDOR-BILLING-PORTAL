// One-off: the Slack-approvals feature only pushes a notification at the
// moment an entity *transitions* into a given stage (see the notifySlack/
// notifyStagePending call sites in workOrderController.js, billController.js
// and billRequestController.js). Anything already sitting at one of those
// stages before this hook existed (or before a new stage was added) never
// triggered it — this finds everything currently pending at every stage in
// approvalStages.js and posts it. Safe to re-run — skips anything that
// already has a pending SlackApproval row for that entity+stage.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const SlackApproval = require('../src/models/SlackApproval');
const { notifyStagePending } = require('../src/utils/slackApprovals');

// One finder per approvalType — mirrors the exact status each controller
// hook fires at (see approvalStages.js for the shared line/title/deep-link
// config those hooks and this script both read).
const FINDERS = {
  WORK_ORDER_CHECKER_APPROVAL:  () => WorkOrder.find({ approvalStatus: 'pending-checker' }),
  WORK_ORDER_APPROVER_APPROVAL: () => WorkOrder.find({ approvalStatus: 'pending-approver' }),
  WORK_ORDER_OWNER_APPROVAL:    () => WorkOrder.find({ approvalStatus: 'pending-final' }),
  BILL_REQUEST_AGM_APPROVAL:    () => BillRequest.find({ status: 'pending' }),
  BILL_REQUEST_GM_APPROVAL:     () => BillRequest.find({ status: 'pending-gm' }),
  PAYMENT_MANUAL_AGM_APPROVAL:  () => RunningBill.find({ manualApprovalStatus: 'pending' }),
  PAYMENT_MANUAL_GM_APPROVAL:   () => RunningBill.find({ manualApprovalStatus: 'pending-gm' }),
  PAYMENT_VERIFY_APPROVAL:      () => RunningBill.find({ status: 'draft', manualApprovalStatus: 'approved' }),
  PAYMENT_L1_AGM_APPROVAL:      () => RunningBill.find({ status: 'verify-done' }),
  PAYMENT_L2_GM_APPROVAL:       () => RunningBill.find({ status: 'l1-approved' }).populate('l1ApprovedBy', 'name role'),
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  for (const [approvalType, find] of Object.entries(FINDERS)) {
    const entities = await find();
    for (const entity of entities) {
      const already = await SlackApproval.findOne({ approvalType, entityId: entity._id, status: 'pending' });
      if (already) { console.log(`Skipped (already posted): ${approvalType} ${entity._id}`); continue; }

      try {
        const posted = await notifyStagePending(approvalType, entity);
        console.log(posted ? `Posted: ${approvalType} ${entity._id}` : `No recipients configured — skipped: ${approvalType} ${entity._id}`);
      } catch (err) {
        console.error(`Failed: ${approvalType} ${entity._id} — ${err.message}`);
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
