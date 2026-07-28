const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  scopeItemId: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, required: true },
  remarks:     { type: String, default: '' },
  // Notes from the actual progress entries billed here — distinct from
  // `remarks` above, which is the scope item's static instruction note.
  progressRemarks: { type: String, default: '' },
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
    projectLocation: { type: String, default: '' },
    vendorCode:  { type: String },
    vendorName:  { type: String },
    // Denormalized from WorkOrder.companyName — the issuing entity this bill
    // was raised under (this system spans multiple legal companies).
    companyName: { type: String, default: '' },
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

    // L1 maker's confirmation that the bill was actually keyed into Tally —
    // both required server-side before makerConfirm succeeds.
    makerChecklist: {
      tallyEntryDone:       { type: Boolean, default: false },
      newItemsAddedInTally: { type: Boolean, default: false },
    },

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

    // draft = awaiting L1 maker confirm · submitted = L1 maker confirmed (or, for
    // legacy bills predating the maker stage, AGM approved) · verified = legacy-only,
    // GM approved (no longer set on new bills) · approved = L2 checker verified
    // WO/bill match + set hold/advance/TDS · payment-initiated = L3 approver
    // signed off, now moving through payment-preparation → physical-verify →
    // release (all gated by sub-object flags within this one status, same
    // pattern physicalVerification already used before payment-preparation
    // existed) · hold = L3 approver paused the payment (see holdBy/At/Reason) —
    // reachable only from 'approved', returns there via releaseHold · paid =
    // physically released — the actual payment detail fields are filled in
    // afterward (see paymentDetails below), not required at this point.
    status: {
      type: String,
      enum: ['draft', 'submitted', 'verified', 'approved', 'payment-initiated', 'hold', 'rejected', 'paid'],
      default: 'submitted',
    },
    submittedAt: { type: Date },
    agmApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agmApprovedAt: { type: Date },
    makerBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    makerAt:  { type: Date },
    verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt:  { type: Date },
    checkerBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkerAt:  { type: Date },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:  { type: Date },
    paymentInitiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentInitiatedAt: { type: Date },
    tdsAmount:   { type: Number, default: 0 },
    physicalVerification: {
      done:   { type: Boolean, default: false },
      by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:     { type: Date },
      remark: { type: String, default: '' },
    },
    rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectReason:{ type: String },

    // Set by the Approver's Hold action (only from 'approved') and left
    // in place — not cleared — by releaseHold, so "was this ever held" stays
    // visible from the document alone without hydrating approvalHistory.
    holdBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdAt:         { type: Date },
    holdReason:     { type: String },
    holdReleasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdReleasedAt: { type: Date },

    // "Payment Maker" stage — Accounts picks the real payment mode and
    // confirms a readiness checklist before Physical Verification is allowed.
    paymentPreparation: {
      done:        { type: Boolean, default: false },
      by:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:          { type: Date },
      paymentMode: { type: String, enum: ['neft', 'rtgs', 'imps', 'internet_banking', 'upi', 'cheque', 'dd', 'cash', ''] },
      checklist: {
        bankDetailsVerified: { type: Boolean, default: false },
        fundsAvailable:      { type: Boolean, default: false },
        voucherPrepared:     { type: Boolean, default: false },
      },
      remark: { type: String, default: '' },
    },

    // "Mark as Paid" (releasePayment) only flips status — the actual payment
    // fields below (paymentUTR/paymentDate/paymentMode/paymentBank/
    // paymentReleasedBy/paidAmount) are filled in afterward by this stage,
    // once the paperwork/bank statement catches up with what already
    // physically happened. Same {done,by,at,remark} completion-marker shape
    // as physicalVerification/paymentPreparation — no duplicate fields,
    // submitPaymentDetails just sets the existing flat fields directly.
    paymentDetails: {
      done:   { type: Boolean, default: false },
      by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:     { type: Date },
      remark: { type: String, default: '' },
    },

    // Append-only record of every stage transition (submit/approve/send-back/
    // hold/release-hold/payment-prep/physical-verify/release/reconcile) —
    // mirrors WorkOrder.approvalHistory exactly, kept separate from the
    // system-wide audit log (logAudit calls already made at every transition)
    // since this one drives just this drawer's timeline UI.
    approvalHistory: [{
      stage:   { type: String, enum: ['maker', 'checker', 'approver', 'hold', 'payment-maker', 'physical-verify', 'release', 'payment-details'], required: true },
      action:  { type: String, enum: ['submitted', 'approved', 'sent-back', 'held', 'released-hold', 'done'], required: true },
      by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:      { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
      _id: false,
    }],

    paymentUTR:              { type: String },
    paymentChequeNo:         { type: String },
    paymentDate:             { type: Date },
    paymentBank:             { type: String },
    paymentMode:             { type: String, enum: ['neft', 'rtgs', 'imps', 'internet_banking', 'upi', 'cheque', 'dd', 'cash', ''] },
    paymentReleasedBy:       { type: String },
    retentionReleased:       { type: Number, default: 0 },
    retentionReleaseRemark:  { type: String, default: '' },
    isArchived:  { type: Boolean, default: false },
    archivedAt:  { type: Date, default: null },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

runningBillSchema.index({ workOrderId: 1, createdAt: -1 });
runningBillSchema.index({ projectId: 1, status: 1 });
runningBillSchema.index({ vendorCode: 1, createdAt: -1 });
runningBillSchema.index({ status: 1 });

module.exports = mongoose.model('RunningBill', runningBillSchema);
