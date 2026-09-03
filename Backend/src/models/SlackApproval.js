const mongoose = require('mongoose');

// One row per approval pushed to Slack — independent of WorkflowInstance
// (which is a best-effort parallel tracker that may not even exist for a given
// entity). This is the source of truth for "what did we post to Slack, and
// what happened to it", so a button click can find its way back to the real
// WorkOrder/RunningBill/BillRequest action and every posted copy of the
// message (one per DM'd recipient, plus the shared group channel) can be
// updated in place together.
const slackApprovalSchema = new mongoose.Schema(
  {
    approvalType: {
      type: String,
      required: true,
      enum: [
        'WORK_ORDER_CHECKER_APPROVAL', 'WORK_ORDER_APPROVER_APPROVAL', 'WORK_ORDER_OWNER_APPROVAL',
        'BILL_REQUEST_AGM_APPROVAL', 'BILL_REQUEST_GM_APPROVAL',
        'PAYMENT_MANUAL_AGM_APPROVAL', 'PAYMENT_MANUAL_GM_APPROVAL',
        'PAYMENT_VERIFY_APPROVAL', 'PAYMENT_L1_AGM_APPROVAL', 'PAYMENT_L2_GM_APPROVAL',
      ],
    },
    entityType: { type: String, required: true, enum: ['WorkOrder', 'RunningBill', 'BillRequest'] },
    entityId:   { type: mongoose.Schema.Types.ObjectId, required: true },

    // Everyone individually DM'd for this approval — not necessarily the only
    // person allowed to act (a click is re-checked against the stage's real
    // permission gate at decision time, see slackController.js's `can()` use).
    approverUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },

    // Snapshot of what the Slack message shows — rendered once at creation time
    // so re-rendering never needs a fresh DB fetch of the entity.
    title: { type: String, required: true },
    lines: [{ label: String, value: String, _id: false }],
    deepLinkPath: { type: String, required: true },

    // Every posted copy of this message — one per DM recipient plus one for
    // the shared group channel. Deciding from any one of them updates all.
    messages: [{ channel: String, ts: String, _id: false }],

    decidedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt:     { type: Date },
    remarks:       { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SlackApproval', slackApprovalSchema);
