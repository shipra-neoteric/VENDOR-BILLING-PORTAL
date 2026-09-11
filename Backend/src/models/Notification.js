const mongoose = require('mongoose');

// One row per (recipient, event) — never a broadcast row shared across users,
// so a user can only ever query/see their OWN notifications (userId is always
// part of every read query in notificationController.js). `type` is a stable
// event key (e.g. 'BILL_REQUEST_AGM_APPROVAL', 'DRAWING_REQUEST_L1_REVIEW')
// used both for de-duplication and for the category filter on the frontend.
const notificationSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:       { type: String, required: true },
    // Coarse grouping shown in the "View All" filter — one of the 9 categories
    // the notification center covers (Work Orders, Bill Requests, Approvals,
    // Payments, Site Progress, Drawing Requests, Advance Recovery, Contract
    // Limits, Vendor Compliance).
    category:   { type: String, required: true },
    title:      { type: String, required: true },
    message:    { type: String, default: '' },
    entityType: { type: String, required: true },
    entityId:   { type: mongoose.Schema.Types.ObjectId, required: true },
    // Frontend route this notification opens straight to the record (mirrors
    // approvalStages.js's deepLinkPath convention already used for Slack).
    link:       { type: String, default: '' },
    read:       { type: Boolean, default: false },
    readAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

// Same (user, type, entity) combination is idempotent — a retried request, a
// resubmit-after-send-back cycle re-hitting the same stage, etc. never
// produces a second row for the same person. Mirrors notifyStagePending's own
// existing-pending-row dedup guard in slackApprovals.js.
notificationSchema.index({ userId: 1, type: 1, entityId: 1 }, { unique: true });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
