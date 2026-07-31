const mongoose = require('mongoose');
const { Schema } = mongoose;

// "Daily Contractor / Labour Report - All Sites" — mirrors the team's
// existing Google Form. Submittable two ways: logged in from the DRI's own
// dashboard (submittedBy set), or via the public no-login form
// (submittedBy null, isPublicSubmission true).
const dailyLabourReportSchema = new Schema(
  {
    vendorCode:  { type: String, required: true },
    vendorName:  { type: String, default: '' },
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, default: '' },
    date:        { type: Date, required: true },
    workType:    { type: String, required: true },
    shiftType:   { type: String, required: true, enum: ['Day', 'Night'] },
    labourCount: { type: Number, required: true, min: 0 },

    submittedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isPublicSubmission:{ type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyLabourReportSchema.index({ projectId: 1, date: -1 });
dailyLabourReportSchema.index({ vendorCode: 1, date: -1 });

module.exports = mongoose.model('DailyLabourReport', dailyLabourReportSchema);
