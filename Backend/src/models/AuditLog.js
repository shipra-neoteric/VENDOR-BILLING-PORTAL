const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT'],
    },
    module: { type: String, required: true }, // 'auth', 'work-orders', 'bill-requests', 'billing-payments', 'user-management', ...
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName:  { type: String, default: '' },
    userEmail: { type: String, default: '' },
    description: { type: String, required: true },
    entityType:  { type: String, default: '' }, // 'WorkOrder', 'BillRequest', 'RunningBill', 'User', ...
    entityId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    entityLabel: { type: String, default: '' }, // workOrderNo / reqNo / billNo / email, for display
    // Per-field before/after snapshot for updates — { fieldName: { from, to } } — kept
    // shallow and field-scoped rather than a full document diff, since what matters for
    // an audit trail is "what changed", not a byte-for-byte document dump.
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ module: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
