const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
  name:                { type: String, required: true, trim: true },
  order:               { type: Number, required: true },
  assignedRole:        { type: String, default: 'any' }, // role key, or 'any'
  assignedUserId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  slaHours:            { type: Number, required: true, min: 0.5 },
  businessHoursOnly:   { type: Boolean, default: false },
  workingDays:         [{ type: String }], // e.g. ['mon','tue','wed','thu','fri']
  reminderBeforeMinutes: { type: Number, default: 0 },
  escalateAfterMinutes:  { type: Number, default: 0 },
  escalateToUserId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true });

const workflowTemplateSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    entityType:  { type: String, enum: ['WorkOrder', 'BillRequest', 'Custom'], required: true },
    isActive:    { type: Boolean, default: true },
    stages:      [stageSchema],
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkflowTemplate', workflowTemplateSchema);
