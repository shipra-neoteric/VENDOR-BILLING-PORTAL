const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema(
  {
    projectId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project',    required: true },
    stageId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Stage',      required: true },
    categoryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category',   required: true },
    workOrderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder',  required: true },
    vendorCode:    { type: String },
    vendorName:    { type: String },
    name:          { type: String, required: true, trim: true },
    description:   { type: String },
    paymentAmount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type:    String,
      enum:    ['pending', 'eligible', 'bill-generated', 'paid'],
      default: 'pending',
    },
    achieved:     { type: Boolean, default: false },
    achievedDate: { type: Date },
    billId:       { type: mongoose.Schema.Types.ObjectId, ref: 'RunningBill' },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

milestoneSchema.index({ projectId: 1, stageId: 1 });

module.exports = mongoose.model('Milestone', milestoneSchema);
