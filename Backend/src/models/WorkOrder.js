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
  },
  { _id: true, timestamps: false }
);

const subItemSchema = new mongoose.Schema(
  {
    description: { type: String },
    unit:        { type: String },
    plannedQty:  { type: Number, default: 0 },
    rate:        { type: Number, default: 0 },
    amount:      { type: Number, default: 0 },
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
    plannedStart:    { type: String },
    plannedEnd:      { type: String },
    status:          { type: String, enum: ['pending', 'running', 'completed'], default: 'pending' },
    completedQty:    { type: Number, default: 0 },
    lastBilledQty:   { type: Number, default: 0 },
    progressEntries: [progressEntrySchema],
    subItems:        [subItemSchema],
  },
  { _id: true }
);

const workOrderSchema = new mongoose.Schema(
  {
    workOrderNo:   { type: String, required: true, unique: true },
    issueDate:     { type: Date, required: true },
    companyId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    companyName:   { type: String, default: '' },
    projectId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName:   { type: String },
    vendorCode:    { type: String, required: true },
    vendorName:    { type: String },
    ownerName:     { type: String },
    mobile:        { type: String },
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
    scopeItems:    [scopeItemSchema],
    contractValue: { type: Number, default: 0 },
    gstPercent:    { type: Number, default: 18 },
    retentionPercent: { type: Number, default: 0 },
    documentUrl:   { type: String },
    documentName:  { type: String },
    status: {
      type: String,
      enum: ['draft', 'issued', 'in-progress', 'completed'],
      default: 'draft',
    },
    assignedDRI: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

workOrderSchema.index({ projectId: 1, createdAt: -1 });
workOrderSchema.index({ assignedDRI: 1, createdAt: -1 });
workOrderSchema.index({ vendorCode: 1 });
workOrderSchema.index({ status: 1 });
workOrderSchema.index({ projectId: 1, assignedDRI: 1, status: 1 });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
