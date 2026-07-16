const mongoose = require('mongoose');

const instanceStageSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  order:             { type: Number, required: true },
  assignedRole:      { type: String, default: 'any' },
  assignedUserId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  slaHours:          { type: Number, required: true },
  businessHoursOnly: { type: Boolean, default: false },
  workingDays:       [{ type: String }],
  escalateAfterMinutes: { type: Number, default: 0 },
  escalateToUserId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  startedAt:   { type: Date, default: null },
  dueAt:       { type: Date, default: null },
  completedAt: { type: Date, default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  remarks:     { type: String, default: '' },
  status:      { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' },
  delayMinutes: { type: Number, default: 0 },
}, { _id: true });

const workflowInstanceSchema = new mongoose.Schema(
  {
    templateId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowTemplate', required: true },
    templateName: { type: String, required: true },
    entityType:   { type: String, enum: ['WorkOrder', 'BillRequest', 'Custom'], required: true },
    entityId:     { type: mongoose.Schema.Types.ObjectId, required: true },
    entityLabel:  { type: String, default: '' },
    // Denormalized reporting metadata — populated at start time so the MIS report can
    // group/sum by project, contractor, and value without re-joining WorkOrder/BillRequest.
    projectId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    projectName:  { type: String, default: '' },
    vendorName:   { type: String, default: '' },
    amount:       { type: Number, default: 0 },
    status:       { type: String, enum: ['in-progress', 'completed', 'cancelled'], default: 'in-progress' },
    currentStageIndex: { type: Number, default: 0 },
    stages:       [instanceStageSchema],
    startedAt:    { type: Date, default: Date.now },
    completedAt:  { type: Date, default: null },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

workflowInstanceSchema.index({ entityType: 1, entityId: 1 });

module.exports = mongoose.model('WorkflowInstance', workflowInstanceSchema);
