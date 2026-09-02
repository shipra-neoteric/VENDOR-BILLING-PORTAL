const mongoose = require('mongoose');

// One row per approval pushed to Slack — independent of WorkflowInstance
// (which is a best-effort parallel tracker that may not even exist for a given
// entity). This is the source of truth for "what did we post to Slack, and
// what happened to it", so a button click can find its way back to the real
// WorkOrder/RunningBill action and the Slack message can be updated in place.
const slackApprovalSchema = new mongoose.Schema(
  {
    approvalType: {
      type: String,
      required: true,
      enum: ['WORK_ORDER_OWNER_APPROVAL', 'PAYMENT_L2_GM_APPROVAL'],
    },
    entityType: { type: String, required: true, enum: ['WorkOrder', 'RunningBill'] },
    entityId:   { type: mongoose.Schema.Types.ObjectId, required: true },

    approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },

    // Snapshot of what the Slack message shows — rendered once at creation time
    // so re-rendering never needs a fresh DB fetch of the entity.
    title: { type: String, required: true },
    lines: [{ label: String, value: String, _id: false }],
    deepLinkPath: { type: String, required: true },

    slackChannel:   { type: String },
    slackMessageTs: { type: String },

    decidedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt:     { type: Date },
    remarks:       { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SlackApproval', slackApprovalSchema);
