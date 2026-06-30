const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    projectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project',   required: true },
    stageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Stage',     required: true },
    categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category',  required: true },
    workOrderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder', required: true },
    vendorCode:   { type: String },
    vendorName:   { type: String },
    name:         { type: String, required: true, trim: true },
    unit:         { type: String, default: '' },
    plannedQty:   { type: Number, required: true, min: 0 },
    completedQty: { type: Number, default: 0, min: 0 },
    remarks:      { type: String },
    status: {
      type:    String,
      enum:    ['not-started', 'in-progress', 'completed', 'blocked', 'on-hold'],
      default: 'not-started',
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

activitySchema.index({ stageId: 1 });
activitySchema.index({ projectId: 1 });
activitySchema.index({ workOrderId: 1 });

// Virtual percentage — never stored, always derived
activitySchema.virtual('percentage').get(function () {
  if (!this.plannedQty) return 0;
  return Math.min(100, Math.round((this.completedQty / this.plannedQty) * 100));
});
activitySchema.set('toJSON',   { virtuals: true });
activitySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Activity', activitySchema);
