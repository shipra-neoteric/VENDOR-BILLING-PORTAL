const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  scopeItemId: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, required: true },
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
    paymentUTR:        { type: String },
    paymentChequeNo:   { type: String },
    paymentDate:       { type: Date },
    paymentBank:       { type: String },
    paymentMode:       { type: String, enum: ['neft', 'rtgs', 'imps', 'internet_banking', 'upi', 'cheque', 'dd', 'cash', ''] },
    paymentReleasedBy: { type: String },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RunningBill', runningBillSchema);
