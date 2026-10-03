const mongoose = require('mongoose');

// One doc per recurring template — a saved snapshot of the exact body that
// would be POSTed to create a WorkOrder or a (manual, fixed-amount) Bill,
// plus a frequency/next-run clock. The daily cron (see recurringController's
// runDueSchedules) re-plays that same body through the real create+submit
// handlers on each due date, so a recurring entry goes through the exact
// same validation/approval-chain path a human creating it by hand would.
const recurringScheduleSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['WorkOrder', 'Bill'], required: true },
    // Admin-facing name for this schedule (e.g. "Monthly office rent") —
    // purely a label, never sent to the create endpoint.
    label: { type: String, required: true, trim: true },
    // The exact req.body a manual creation of this WorkOrder/Bill would send
    // — re-sent as-is on every run (only workOrderNo/billNo are freshly
    // generated server-side each time, same as any other creation).
    templateData: { type: mongoose.Schema.Types.Mixed, required: true },
    frequency: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'], required: true },
    startDate: { type: Date, required: true },
    // null = runs indefinitely until paused/deleted.
    endDate: { type: Date, default: null },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Append-only, newest last — same convention as approvalHistory
    // elsewhere in this codebase, so a failed run is visible without
    // digging through server logs.
    runHistory: [{
      ranAt: { type: Date, default: Date.now },
      success: { type: Boolean, required: true },
      error: { type: String, default: '' },
      entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
      entityLabel: { type: String, default: '' },
    }],
  },
  { timestamps: true }
);

recurringScheduleSchema.index({ isActive: 1, nextRunAt: 1 });

module.exports = mongoose.model('RecurringSchedule', recurringScheduleSchema);
