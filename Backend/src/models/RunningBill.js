const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  scopeItemId: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, required: true },
  remarks:     { type: String, default: '' },
  unit:        { type: String, default: '' },
  plannedQty:  { type: Number, default: 0 },
  billedQty:   { type: Number, required: true },
  rate:        { type: Number, required: true },
  amount:      { type: Number, required: true },
}, { _id: false });

const runningBillSchema = new mongoose.Schema(
  {
    billNo:      { type: String, required: true, unique: true },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder' },
    workOrderNo: { type: String },
    projectId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    projectName: { type: String },
    vendorCode:  { type: String },
    vendorName:  { type: String },
    billDate:    { type: Date, required: true },
    billingPeriodFrom: { type: Date },
    billingPeriodTo:   { type: Date },
    contractorRefNo:   { type: String },
    generatedBy:       { type: String },
    lineItems:   [lineItemSchema],
    amount:           { type: Number, default: 0 },
    retentionPercent:  { type: Number, default: 0 },
    retentionAmount:   { type: Number, default: 0 },
    advanceRecovery:   { type: Number, default: 0 },
    paidAmount:        { type: Number },
    gstPercent:  { type: Number, default: 18 },
    tdsPercent:  { type: Number, default: 1 },
    remarks:     { type: String },

    // ── Bill Relationship Engine ──────────────────────────────
    billType: {
      type: String,
      enum: [
        'running',              // Standard Running / RA Bill
        'final',                // Final Cumulative Bill
        'advance_mobilization', // Mobilization Advance
        'advance_secured',      // Secured Advance
        'advance_material',     // Material Advance
        'recovery',             // Recovery Bill
        'credit_note',          // Credit Note (negative adjustment)
        'debit_note',           // Debit Note (positive adjustment)
        'revision',             // Revised Bill
        'correction',           // Correction Bill
        'retention_release',    // Retention Release
      ],
      default: 'running',
    },
    relationshipType: {
      type: String,
      enum: [
        'NONE',
        'CONTINUES',            // Next running bill in sequence
        'SUPERSEDES',           // Final bill superseding running bills
        'ADJUSTMENT',           // Credit/debit note adjustment on a bill
        'REVISION_OF',          // Revised version, replacing original
        'ADVANCE_FOR',          // Advance issued for future billing
        'RECOVERY_OF',          // Recovery of a previously issued advance
        'SETTLEMENT_OF',        // Full settlement of outstanding balance
        'CORRECTION_OF',        // Correction to a previous bill
        'RETENTION_RELEASE_OF', // Retention release linked to original bill
      ],
      default: 'NONE',
    },
    linkedBills: [{
      billId:           { type: mongoose.Schema.Types.ObjectId, ref: 'RunningBill' },
      billNo:           { type: String },
      relationshipType: { type: String },
      _id: false,
    }],
    billingCycle:  { type: Number, default: 1 },
    isActive:      { type: Boolean, default: true },
    supersededBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'RunningBill', default: null },
    // ─────────────────────────────────────────────────────────

    status: {
      type: String,
      enum: ['draft', 'submitted', 'verified', 'approved', 'rejected', 'paid'],
      default: 'submitted',
    },
    submittedAt: { type: Date },
    verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt:  { type: Date },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:  { type: Date },
    rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectReason:{ type: String },
    paymentUTR:              { type: String },
    paymentChequeNo:         { type: String },
    paymentDate:             { type: Date },
    paymentBank:             { type: String },
    paymentMode:             { type: String, enum: ['neft', 'rtgs', 'imps', 'internet_banking', 'upi', 'cheque', 'dd', 'cash', ''] },
    paymentReleasedBy:       { type: String },
    retentionReleased:       { type: Number, default: 0 },
    retentionReleaseRemark:  { type: String, default: '' },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

runningBillSchema.index({ workOrderId: 1, createdAt: -1 });
runningBillSchema.index({ projectId: 1, status: 1 });
runningBillSchema.index({ vendorCode: 1, createdAt: -1 });
runningBillSchema.index({ status: 1 });

module.exports = mongoose.model('RunningBill', runningBillSchema);
