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
    workOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    workOrderNo: { type: String },
    projectName: { type: String },
    vendorCode:  { type: String },
    vendorName:  { type: String },
    category:    { type: String, default: '' },
    subCategory: { type: String, default: '' },
    items:       { type: [itemSchema], default: [] },
    remarks:     { type: String, default: '' },
    status: {
      type:    String,
      enum:    ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    billId:       { type: Schema.Types.ObjectId, ref: 'RunningBill' },
    requestedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    processedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt:  { type: Date },
    rejectReason: { type: String, default: '' },
  },
  { timestamps: true }
);

billRequestSchema.index({ workOrderId: 1 });
billRequestSchema.index({ requestedBy: 1, status: 1 });

module.exports = mongoose.model('BillRequest', billRequestSchema);
