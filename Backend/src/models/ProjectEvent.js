const mongoose = require('mongoose');
const { Schema } = mongoose;

const EVENT_TYPES = [
  'WORK_ORDER_CREATED', 'WORK_ORDER_ISSUED', 'WORK_ORDER_COMPLETED',
  'PROGRESS_ADDED',
  'BILL_REQUESTED', 'BILL_REQUEST_APPROVED', 'BILL_REQUEST_REJECTED',
  'RUNNING_BILL_CREATED', 'RUNNING_BILL_SUBMITTED',
  'RUNNING_BILL_VERIFIED', 'RUNNING_BILL_APPROVED', 'RUNNING_BILL_REJECTED',
  'PAYMENT_INITIATED', 'PAYMENT_RELEASED',
  'MILESTONE_ACHIEVED',
];

const projectEventSchema = new Schema({
  projectId:       { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  workOrderId:     { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
  workOrderNo:     { type: String },
  billRequestId:   { type: Schema.Types.ObjectId, ref: 'BillRequest' },
  runningBillId:   { type: Schema.Types.ObjectId, ref: 'RunningBill' },
  type:            { type: String, enum: EVENT_TYPES, required: true },
  vendorCode:      { type: String },
  vendorName:      { type: String },
  stageNo:         { type: Number },
  performedByName: { type: String },
  performedBy:     { type: Schema.Types.ObjectId, ref: 'User' },
  remarks:         { type: String, default: '' },
  metadata:        { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

projectEventSchema.index({ projectId: 1, createdAt: -1 });
projectEventSchema.index({ workOrderId: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectEvent', projectEventSchema);
