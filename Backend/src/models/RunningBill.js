const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  scopeItemId: { type: mongoose.Schema.Types.ObjectId },
  // Set only when this line bills a specific particular within scopeItemId,
  // rather than the scope item as a whole — lets billing (and the remaining-
  // qty guard) target the particular's own plannedQty/lastBilledQty.
  subItemId:   { type: mongoose.Schema.Types.ObjectId },
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

  // ── Quantity-variance evidence (snapshotted at bill creation) ──────────
  // Only the progress-driven flow (BillRequest -> gmApprove) can ever
  // produce a variance here — the manual entry flow (billController's
  // createBill) hard-caps billedQty at the scope item's remaining unbilled
  // qty, so it can never exceed plannedQty in the first place. When it can
  // (completedQty was allowed past plannedQty and AGM/GM signed off via
  // WorkOrder.scopeItems[].varianceApproved), these fields copy that sign-off
  // onto the bill itself — a permanent record of why this bill's quantity is
  // higher than the work order's planned quantity, independent of whatever
  // the work order's own live variance flag later becomes (it can be reset
  // by a later edit — see applyVarianceGate — without touching history here).
  previouslyBilledQty: { type: Number, default: 0 },  // cumulative billed on this item/particular, before this bill
  cumulativeBilledQty: { type: Number, default: 0 },  // previouslyBilledQty + billedQty (this bill's own qty)
  varianceQty:          { type: Number, default: 0 }, // max(0, cumulativeBilledQty - plannedQty)
  varianceApproved:     { type: Boolean, default: false },
  varianceApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  varianceApprovedAt:   { type: Date },
  varianceApprovedAtQty:{ type: Number },
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
    // was raised under (this system spans multiple legal companies). For a
    // bill with no work order, companyId/companyName are set directly from
    // the maker's own selection at creation (see billController.createBill)
    // instead of being derived from a work order.
    companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
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

    // draft = awaiting Verification · verify-done = the single Verification
    // actor checked the bill against its Work Order + vendor details and set
    // TDS · l1-approved = L1 AGM approved · approved = L2 Director approved —
    // ready to hand off to the external Transaction Management System (TMS) ·
    // sent-to-tms = the outbound API call to TMS succeeded, awaiting its
    // payment callback (see tmsSentAt/tmsSendAttempts/tmsLastError below) ·
    // paid = TMS's callback confirmed the payment, and populated the actual
    // payment fields below (paymentUTR/paymentDate/paymentMode/paymentBank/
    // paymentReleasedBy/paidAmount) — no manual entry anymore · hold = L2
    // Director paused the payment before handoff (see holdBy/At/Reason) —
    // reachable only from 'approved', returns there via releaseHold. Once a
    // bill reaches 'sent-to-tms' this system has no recall/reject action —
    // TMS owns it fully from that point.
    status: {
      type: String,
      enum: ['draft', 'verify-done', 'l1-approved', 'approved', 'sent-to-tms', 'hold', 'rejected', 'paid'],
      default: 'draft',
    },
    // Historical maker/checker/approver/GM stamps — no longer written by any
    // current action, kept only so bills created before this redesign still
    // display who did what. agmApprovedBy/At is a DIFFERENT concept, still
    // actively written by billRequestController's gmApprove: the Site
    // Progress AGM who approved the BillRequest this bill originated from
    // (only set for progress-cycle bills) — distinct from this module's own
    // new L1 AGM Approval stage below.
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

    // Current flow's own stage stamps.
    verificationBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verificationAt: { type: Date },
    l1ApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    l1ApprovedAt:   { type: Date },
    l2ApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    l2ApprovedAt:   { type: Date },

    tdsAmount:   { type: Number, default: 0 },

    // A one-off manual correction to net payable, set at Verify alongside
    // TDS — e.g. clawing back a small overpayment from a prior bill cycle,
    // or adding back a shortfall. Signed: positive adds to net payable,
    // negative subtracts. adjustmentRemark is required whenever this is
    // non-zero (enforced in verifyBill), since an unexplained deviation from
    // the computed net payable is exactly what a reviewer needs to justify.
    // Like tdsAmount/tdsPercent/remarks at this same stage, a re-verify after
    // being sent back overwrites the previous value rather than accumulating
    // — this corrects THIS bill's payout, it isn't a running ledger.
    adjustmentAmount: { type: Number, default: 0 },
    adjustmentRemark: { type: String, default: '' },

    rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectReason:{ type: String },

    // ── Pre-Accounts AGM/GM sign-off ────────────────────────────
    // Only meaningful for bills created directly via Billing -> New Bill
    // (billController.createBill) — a progress-driven bill already got this
    // exact sign-off via BillRequest.agmApprove/gmApprove before this
    // document even existed, so it's born 'approved' here and this whole
    // block stays untouched for it. verifyBill refuses to act on a manual
    // bill until this reaches 'approved', so Accounts can't touch it before
    // AGM then GM have — the same order a progress-driven bill already goes
    // through, just happening here instead of on a separate BillRequest.
    manualApprovalStatus: { type: String, enum: ['pending', 'pending-gm', 'approved', 'rejected'], default: 'approved' },
    manualAgmApprovedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manualAgmApprovedAt:  { type: Date },
    manualGmApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manualGmApprovedAt:   { type: Date },
    manualRejectedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    manualRejectReason:   { type: String, default: '' },

    // Set by the L2 Director's Hold action (only from 'approved') and left
    // in place — not cleared — by releaseHold, so "was this ever held" stays
    // visible from the document alone without hydrating approvalHistory.
    holdBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdAt:         { type: Date },
    holdReason:     { type: String },
    holdReleasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    holdReleasedAt: { type: Date },

    // Outbound handoff to the external Transaction Management System, fired
    // by sendToTms once a bill is 'approved' — tracked here rather than only
    // in approvalHistory since a failed send doesn't move status, so this is
    // the only place "how many times, and why did it last fail" is visible.
    tmsSentAt:            { type: Date },
    tmsSendAttempts:      { type: Number, default: 0 },
    tmsLastAttemptAt:     { type: Date },
    tmsLastError:         { type: String, default: '' },
    tmsCallbackReceivedAt:{ type: Date },

    // Append-only record of every stage transition — mirrors
    // WorkOrder.approvalHistory exactly, kept separate from the system-wide
    // audit log (logAudit calls already made at every transition) since this
    // one drives just this drawer's timeline UI. Deliberately NOT a closed
    // mongoose enum (unlike before this redesign) — a stage/action vocabulary
    // change would otherwise fail validation on a document's next unrelated
    // save() just because its historical entries use retired values.
    approvalHistory: [{
      stage:   { type: String, required: true },
      action:  { type: String, required: true },
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
