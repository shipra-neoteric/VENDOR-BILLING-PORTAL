const mongoose = require('mongoose');
const { Schema } = mongoose;

const recoverySchema = new Schema({
  billNo:      { type: String },
  amount:      { type: Number, required: true },
  date:        { type: Date,   default: Date.now },
  releasedBy:  { type: String },
}, { _id: false });

const advanceSlipSchema = new Schema(
  {
    slipNo:          { type: String, required: true, unique: true },
    contractorCode:  { type: String, required: true },
    contractorName:  { type: String },
    projectId:       { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName:     { type: String },
    // Which group company this advance is raised through — same concept as
    // RunningBill's own companyId/companyName (createBill's "no work order,
    // no company to inherit" case). Previously never collected at all, so
    // the print template always fell back to a hardcoded default name.
    companyId:       { type: Schema.Types.ObjectId, ref: 'Company' },
    companyName:     { type: String, default: '' },
    amount:          { type: Number, required: true },
    amountRecovered: { type: Number, default: 0 },
    date:            { type: Date, required: true },
    reference:       { type: String },
    notes:           { type: String },
    status: {
      type: String,
      enum: ['outstanding', 'partial', 'recovered'],
      default: 'outstanding',
    },
    recoveries: [recoverySchema],
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

advanceSlipSchema.virtual('balance').get(function () {
  return this.amount - this.amountRecovered;
});
advanceSlipSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('AdvanceSlip', advanceSlipSchema);
