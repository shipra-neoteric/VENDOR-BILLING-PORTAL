const mongoose = require('mongoose');

const progressEntrySchema = new mongoose.Schema(
  {
    date:     { type: Date, required: true },
    qtyAdded: { type: Number, required: true, min: 0 },
    remarks:  { type: String },
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
    unit:            { type: String, default: 'sq.ft' },
    plannedQty:      { type: Number, default: 0 },
    rate:            { type: Number, default: 0 },
    amount:          { type: Number, default: 0 },
    plannedStart:    { type: String },
    plannedEnd:      { type: String },
    status:          { type: String, enum: ['pending', 'running', 'completed'], default: 'pending' },
    completedQty:    { type: Number, default: 0 },
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
    scopeOfWork:   { type: String },
    scopeItems:    [scopeItemSchema],
    contractValue: { type: Number, default: 0 },
    documentUrl:   { type: String },
    documentName:  { type: String },
    status: {
      type: String,
      enum: ['draft', 'issued', 'in-progress', 'completed'],
      default: 'draft',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkOrder', workOrderSchema);
