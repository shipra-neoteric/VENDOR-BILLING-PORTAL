const mongoose = require('mongoose');

const progressEntrySchema = new mongoose.Schema(
  {
    date:         { type: Date, required: true },
    qtyAdded:     { type: Number, required: true, min: 0 },
    remarks:      { type: String, default: '' },
    tower:        { type: String, default: '' },
    floor:        { type: String, default: '' },
    flatNo:       { type: String, default: '' },
    plotNo:       { type: String, default: '' },
    locationNote: { type: String, default: '' },
    // Set once this entry's remarks have been carried into a BillRequest, so a
    // later (possibly partial) billing cycle knows exactly which entries are
    // still "new" — cumulative qty alone can't tell that apart once billing
    // becomes selective per item. Cleared automatically if that bill is later
    // rejected, so the entry becomes billable again.
    billedInRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillRequest', default: null },
    // Who actually logged this entry — there was previously no way to answer
    // "who entered this" at all.
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set when the entry itself turns out to be wrong (e.g. a bill made from it
    // was rejected for bad data, not just bad bundling). Never deleted — kept
    // visible for audit — but excluded from completedQty and future billing.
    invalidated: {
      done:   { type: Boolean, default: false },
      by:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:     { type: Date },
      reason: { type: String, default: '' },
    },
  },
  { _id: true, timestamps: false }
);

const subItemSchema = new mongoose.Schema(
  {
    description: { type: String },
    remarks:     { type: String, default: '' },
    unit:        { type: String },
    plannedQty:  { type: Number, default: 0 },
    rate:        { type: Number, default: 0 },
    amount:      { type: Number, default: 0 },
    // Progress is tracked per particular when an item has them — the parent
    // item's own status/completedQty are then derived from these (see
    // recomputeParentFromSubItems in workOrderController.js).
    status:          { type: String, enum: ['pending', 'running', 'completed'], default: 'pending' },
    completedQty:    { type: Number, default: 0 },
    lastBilledQty:   { type: Number, default: 0 },
    progressEntries: [progressEntrySchema],
    // Progress is allowed to exceed plannedQty (never hard-blocked) — AGM/GM
    // must explicitly sign off on the overage before it can be billed.
    // varianceApprovedAtQty snapshots the completedQty that was actually
    // reviewed, so a later edit only invalidates the sign-off if the qty
    // genuinely changed — not for e.g. a remarks/location correction.
    varianceApproved:     { type: Boolean, default: false },
    varianceApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    varianceApprovedAt:   { type: Date },
    varianceApprovedAtQty:{ type: Number },
  },
  { _id: true }
);

const scopeItemSchema = new mongoose.Schema(
  {
    description:     { type: String, required: true },
    remarks:         { type: String, default: '' },
    unit:            { type: String, default: 'sq.ft' },
    plannedQty:      { type: Number, default: 0 },
    rate:            { type: Number, default: 0 },
    amount:          { type: Number, default: 0 },
    gstPercent:      { type: Number, default: 18 },
    plannedStart:    { type: String },
    plannedEnd:      { type: String },
    // Only meaningful for a professional-services WorkOrder's deliverables —
    // e.g. "Concept", "Design Development", "Final Submission". Blank/unused
    // for execution scope items.
    stage:           { type: String, default: '' },
    status:          { type: String, enum: ['pending', 'running', 'completed'], default: 'pending' },
    completedQty:    { type: Number, default: 0 },
    lastBilledQty:   { type: Number, default: 0 },
    progressEntries: [progressEntrySchema],
    subItems:        [subItemSchema],
    // Same variance sign-off as subItemSchema, for items with no particulars.
    varianceApproved:     { type: Boolean, default: false },
    varianceApprovedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    varianceApprovedAt:   { type: Date },
    varianceApprovedAtQty:{ type: Number },
  },
  { _id: true }
);

const paymentMilestoneSchema = new mongoose.Schema(
  {
    stage:      { type: String, default: '' },
    date:       { type: Date },
    type:       { type: String, default: '' },
    mode:       { type: String, default: 'Bank Transfer' },
    amount:     { type: Number, default: 0 },
    amountMode:    { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
    amountPercent: { type: Number, default: null },
    gstPercent: { type: Number, default: 18 },
    gstType:    { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' },
    payable:    { type: Number, default: 0 },
  },
  { _id: true }
);

const workOrderSchema = new mongoose.Schema(
  {
    workOrderNo:   { type: String, required: true, unique: true },
    issueDate:     { type: Date, required: true },
    preparedByName:    { type: String, default: '' },
    preparedByContact: { type: String, default: '' },
    companyId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    companyName:   { type: String, default: '' },
    projectId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName:   { type: String },
    projectLocation: { type: String, default: '' },
    // Execution (construction, the default — measured scope items, retention/
    // DLP, qty-based progress) vs professional-services (design/consultancy —
    // deliverables, stages, milestone fees, no measurement). Existing WOs
    // predating this field are all execution, matching the default below.
    contractType:  { type: String, enum: ['execution', 'professional-services'], default: 'execution' },
    // For professional-services, this resolves against Consultant instead of
    // Contractor (consultantCode/vendorCode prefixes CN-/VC- never collide,
    // so the same field doubles as the lookup key into either collection).
    vendorCode:    { type: String, required: true },
    vendorName:    { type: String },
    ownerName:     { type: String },
    mobile:        { type: String },
    // Which of the two contractor identities above this work order is drawn
    // up in — e.g. a consultant who wants the WO addressed to them personally
    // rather than through their firm. Purely a display choice on the printed
    // WO PDF; the contractor record itself (vendorCode) never changes.
    issuedUnder:   { type: String, enum: ['company', 'owner'], default: 'company' },
    category: {
      type: String,
      default: '',
    },
    subCategory: {
      type: String,
      default: '',
    },
    description:   { type: String, default: '' },
    scopeOfWork:   { type: String },
    totalTenure:   { type: String, default: '' },
    // A general remark on the work order itself (not per-item) — shown
    // throughout the app and on the printed WO PDF, same visibility as every
    // other WO field.
    internalRemark: { type: String, default: '' },
    scopeItems:    [scopeItemSchema],
    contractValue: { type: Number, default: 0 },
    // Flat rupee discount off the overall contract value — entered once payment
    // milestones are set up, not per-milestone.
    discount:      { type: Number, default: 0 },
    gstPercent:    { type: Number, default: 18 },
    retentionPercent: { type: Number, default: 0 },
    // Deprecated single-document pair — kept read-only for work orders saved
    // before multi-document support; new saves only write `documents`.
    documentUrl:   { type: String },
    documentName:  { type: String },
    documents: [{ name: { type: String, required: true }, url: { type: String, required: true }, _id: false }],
    paymentMilestones: [paymentMilestoneSchema],
    warrantyTerms:     [{ type: String }],
    status: {
      type: String,
      enum: ['draft', 'issued', 'in-progress', 'completed', 'cancelled'],
      default: 'draft',
    },
    cancelReason: { type: String },
    cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt:  { type: Date },
    // Once locked, rates/scope/milestones/contract value can no longer be edited
    // (updateWorkOrder rejects the request) — used once a deal's final rates are
    // decided so no one can quietly renegotiate the terms afterwards. Set manually
    // by Owner via lock/unlock, and also automatically the moment finalApprove
    // completes the 4-level approval chain below.
    isLocked:   { type: Boolean, default: false },
    lockedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lockedAt:   { type: Date },
    assignedDRI: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── 4-level approval workflow (maker → checker → approver → final) ──
    // Existing work orders predating this feature default to 'approved' (grand-
    // fathered — see the one-off migration script) so ongoing progress/billing on
    // them is never disrupted; only work orders created from here on start at
    // 'draft' and must actually travel through the chain.
    approvalStatus: {
      type: String,
      enum: ['draft', 'pending-checker', 'pending-approver', 'pending-final', 'approved', 'sent-back'],
      default: 'approved',
    },
    makerBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    makerAt:          { type: Date },
    checkerBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkerAt:        { type: Date },
    checkerRemarks:   { type: String, default: '' },
    approverBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approverAt:       { type: Date },
    approverRemarks:  { type: String, default: '' },
    finalApprovedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    finalApprovedAt:  { type: Date },
    finalRemarks:     { type: String, default: '' },
    // Append-only — every submit/approve/send-back event, oldest first. This is
    // what the Live Workflow Screen's timeline renders directly, so repeated
    // send-back → resubmit cycles are never lost the way a single "last action"
    // field would lose them.
    approvalHistory: [{
      stage:   { type: String, required: true }, // 'maker' | 'checker' | 'approver' | 'final'
      action:  { type: String, required: true }, // 'submitted' | 'approved' | 'sent-back'
      by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at:      { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
      _id: false,
    }],
  },
  { timestamps: true }
);

workOrderSchema.index({ projectId: 1, createdAt: -1 });
workOrderSchema.index({ assignedDRI: 1, createdAt: -1 });
workOrderSchema.index({ vendorCode: 1 });
workOrderSchema.index({ status: 1 });
workOrderSchema.index({ projectId: 1, assignedDRI: 1, status: 1 });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
