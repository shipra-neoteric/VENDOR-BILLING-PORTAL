const mongoose = require('mongoose');
const { Schema } = mongoose;

const itemSchema = new Schema({
  scopeItemId:  { type: Schema.Types.ObjectId },
  description:  { type: String, required: true },
  unit:         { type: String, default: '' },
  billedQty:    { type: Number, required: true, min: 0 },
  rate:         { type: Number, default: 0 },
  amount:       { type: Number, default: 0 },
}, { _id: false });

const billRequestSchema = new Schema(
  {
    reqNo:       { type: String, required: true, unique: true },
    stageNo:     { type: Number, default: 1 },
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    workOrderNo: { type: String },
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    projectName: { type: String },
    vendorCode:  { type: String },
    vendorName:  { type: String },
    category:    { type: String, default: '' },
    subCategory: { type: String, default: '' },
    items:       { type: [itemSchema], default: [] },
    remarks:     { type: String, default: '' },
    periodFrom:  { type: Date },
    periodTo:    { type: Date },
    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    billId:           { type: Schema.Types.ObjectId, ref: 'RunningBill' },
    requestedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    processedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt:      { type: Date },
    rejectReason:     { type: String, default: '' },
    milestoneAchieved:{ type: Boolean, default: false },
    milestoneDate:    { type: Date },
    batchId:          { type: String, default: null },
  },
  { timestamps: true }
);

billRequestSchema.index({ workOrderId: 1 });
billRequestSchema.index({ requestedBy: 1, status: 1 });

module.exports = mongoose.model('BillRequest', billRequestSchema);
