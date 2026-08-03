const mongoose = require('mongoose');

const quotedItemSchema = new mongoose.Schema(
  {
    // References the draft WorkOrder's own scopeItems._id when the contractor
    // quoted against a pre-listed item, so approval can map rates back 1:1 —
    // left null for a line the contractor added themselves.
    scopeItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    description: { type: String, required: true },
    unit:        { type: String, default: 'sq.ft' },
    plannedQty:  { type: Number, default: 0 },
    rate:        { type: Number, default: 0 },
    amount:      { type: Number, default: 0 },
  },
  { _id: true }
);

const contractorQuotationSchema = new mongoose.Schema(
  {
    quotationNo: { type: String, required: true, unique: true },
    workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOrder', required: true },

    // Submitter identity — a public, no-login form, so an existing registered
    // contractor is matched by vendorCode if given, but any name/contact can
    // submit a quote (same "no portal/login" reality as the rest of Contractor).
    vendorCode:      { type: String, default: '' },
    contractorName:  { type: String, required: true },
    contractorMobile:{ type: String, required: true },
    contractorEmail: { type: String, default: '' },

    quotedItems: [quotedItemSchema],
    totalQuoted: { type: Number, default: 0 },
    remarks:     { type: String, default: '' },

    status: {
      type: String,
      enum: ['submitted', 'approved', 'rejected'],
      default: 'submitted',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    rejectReason: { type: String, default: '' },
  },
  { timestamps: true }
);

contractorQuotationSchema.index({ workOrderId: 1, createdAt: -1 });

module.exports = mongoose.model('ContractorQuotation', contractorQuotationSchema);
