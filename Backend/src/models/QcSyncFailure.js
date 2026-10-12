const mongoose = require('mongoose');
const { Schema } = mongoose;

// Logged whenever syncToQc.js's live push fails or can't resolve a record
// (QC unreachable, unmapped project/DRI) — gives the retry path
// (scripts/vms-to-qc-migrate.js --retry-failures) a small, targeted list to
// re-attempt instead of a full rescan, and gives ops visibility beyond
// console-only logging. Purely an internal sync log — never read by any
// DPR/billing/UI code, never affects the VMS submission it's about.
const qcSyncFailureSchema = new Schema(
  {
    type:          { type: String, enum: ['dpr', 'drawing-request'], required: true },
    sourceId:      { type: String, required: true },
    reason:        { type: String, required: true },
    attempts:      { type: Number, default: 1 },
    lastAttemptAt: { type: Date, default: Date.now },
    // Set once a retry succeeds — kept, not deleted, so there's a visible
    // history of what used to fail and when it got fixed.
    resolvedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

qcSyncFailureSchema.index({ type: 1, sourceId: 1 }, { unique: true });
qcSyncFailureSchema.index({ resolvedAt: 1 });

module.exports = mongoose.model('QcSyncFailure', qcSyncFailureSchema);
