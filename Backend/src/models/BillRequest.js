const mongoose = require('mongoose');
const { Schema } = mongoose;

const itemSchema = new Schema({
  scopeItemId:  { type: Schema.Types.ObjectId },
  // Set only when this line bills a specific particular within scopeItemId
  // rather than the scope item as a whole — same convention as
  // RunningBill.lineItemSchema's subItemId.
  subItemId:    { type: Schema.Types.ObjectId },
  description:  { type: String, required: true },
  unit:         { type: String, default: '' },
  billedQty:    { type: Number, required: true, min: 0 },
  rate:         { type: Number, default: 0 },
  amount:       { type: Number, default: 0 },
  // Notes the DRI wrote against the specific progress entries being billed
  // here — distinct from the scope item's own static instruction remarks.
  progressRemarks: { type: String, default: '' },
}, { _id: false });

const billRequestSchema = new Schema(
  {
    reqNo:       { type: String, required: true, unique: true },
    stageNo:     { type: Number, default: 1 },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    workOrderNo: { type: String },
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectName: { type: String },
    projectLocation: { type: String, default: '' },
    vendorCode:  { type: String },
    vendorName:  { type: String },
    // Denormalized from WorkOrder.companyName — the issuing entity (this system
    // spans multiple legal companies, not just "Neoteric Properties"), needed
    // on the request itself since a print can happen before any RunningBill
    // (which normally carries this) exists.
    companyName: { type: String, default: '' },
    category:    { type: String, default: '' },
    subCategory: { type: String, default: '' },
    items:       { type: [itemSchema], default: [] },
    remarks:     { type: String, default: '' },
    periodFrom:  { type: Date },
    periodTo:    { type: Date },
    // pending = awaiting L1 (AGM) · pending-gm = AGM approved, awaiting L2 (GM)
    // · approved = GM approved, RunningBill created · rejected = terminal, a
    // fresh request must be raised from new progress (this one never revives).
    status: {
      type:    String,
      enum:    ['pending', 'pending-gm', 'approved', 'rejected'],
      default: 'pending',
    },
    // Set by agmApprove (L1) — retention/advance are decided here but not
    // acted on until gmApprove (L2) actually builds the RunningBill, so they
    // have to be persisted rather than staying a one-time req.body value.
    agmApprovedBy:    { type: Schema.Types.ObjectId, ref: 'User' },
    agmApprovedAt:    { type: Date },
    retentionAmount:  { type: Number, default: 0 },
    advanceRecovery:  { type: Number, default: 0 },
    // Which real AdvanceSlip(s) advanceRecovery is actually settling — set by
    // AGM alongside advanceRecovery, but not applied (slip balances updated)
    // until gmApprove actually creates the RunningBill, exactly like the
    // manual Billing flow applies its own recoveries at bill-creation time.
    // Without this, advanceRecovery was just a bare number never linked back
    // to any real slip, so a slip stayed "outstanding" forever even once its
    // amount had genuinely been recovered through this approval flow.
    advanceRecoveries: {
      type: [{ slipId: { type: Schema.Types.ObjectId, ref: 'AdvanceSlip' }, amount: Number, _id: false }],
      default: [],
    },
    // Lets AGM set/override the GST% actually applied on the eventual bill —
    // mainly for a work order that has no GST% configured at all. Null means
    // "use the work order's own gstPercent", exactly like retention/advance
    // default to the WO's own calculation when left blank.
    gstPercentOverride: { type: Number, default: null },
    // Who this request's eventual bill should actually pay — normally left
    // unset (defaults to the work order's own vendor at gmApprove); only
    // set when AGM names a fellow Vendor Group member as the payee instead.
    payeeVendorCode:  { type: String, default: '' },
    payeeVendorName:  { type: String, default: '' },
    billId:           { type: Schema.Types.ObjectId, ref: 'RunningBill' },
    requestedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    // Whoever did the LAST terminal action — gmApprove or a reject at either stage.
    processedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt:      { type: Date },
    rejectReason:     { type: String, default: '' },
    // Append-only, mirrors WorkOrder.approvalHistory/RunningBill.approvalHistory —
    // 'rejected' (not 'sent-back': this is terminal, the document never revives).
    approvalHistory: [{
      stage:   { type: String, enum: ['agm', 'gm'], required: true },
      action:  { type: String, enum: ['approved', 'rejected'], required: true },
      by:      { type: Schema.Types.ObjectId, ref: 'User' },
      // Snapshotted from the actual approver at the moment they acted (same
      // pattern as WorkOrder.approvalHistory) — the real name and whatever
      // role/custom-role they held then, not a hardcoded "AGM"/"GM" label.
      // A user's role can change or their account can be deactivated later;
      // this keeps the history entry accurate to what actually happened.
      byName:  { type: String, default: '' },
      byRole:  { type: String, default: '' },
      at:      { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
      _id: false,
    }],
    milestoneAchieved:{ type: Boolean, default: false },
    milestoneDate:    { type: Date },
    batchId:          { type: String, default: null },
    isArchived:       { type: Boolean, default: false },
    archivedAt:       { type: Date, default: null },
  },
  { timestamps: true }
);

billRequestSchema.index({ workOrderId: 1 });
billRequestSchema.index({ requestedBy: 1, status: 1 });

module.exports = mongoose.model('BillRequest', billRequestSchema);
