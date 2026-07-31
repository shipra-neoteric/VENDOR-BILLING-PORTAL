const mongoose = require('mongoose');
const { Schema } = mongoose;

// A DRI's end-of-day site report — distinct from `dprController.js`'s
// "Daily Progress Report" aggregation (that's a computed rollup of activity
// across the system; this is an actual submitted form, mirroring the team's
// existing Google Form field-for-field). Submittable two ways: logged in
// from the DRI's own dashboard (submittedBy set), or via the public no-login
// form (submittedBy null, isPublicSubmission true) for anyone without an
// account yet.
const dailyProjectReportSchema = new Schema(
  {
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, default: '' },
    driUserId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    driName:     { type: String, required: true },
    date:        { type: Date, required: true },

    tomorrowsPlan: { type: String, required: true },

    workDelayed: { type: String, required: true },

    labourShort:            { type: String, required: true },
    additionalLabourNeeded: { type: String, default: '' },
    labourShortageImpact:   { type: String, default: '' },

    materialShort:          { type: String, required: true },
    materialRunOutDays:     { type: String, default: '' },
    materialReceivedOnTime: { type: String, required: true },
    materialShortageImpact: { type: String, default: '' },

    drawingPending:          { type: String, required: true },
    drawingReference:        { type: String, default: '' },
    drawingPendingDays:      { type: String, default: '' },
    drawingBlockedActivity:  { type: String, default: '' },

    challengeBlocking:    { type: String, required: true },
    challengeDescription: { type: String, default: '' },
    escalationRequired:   { type: String, required: true },
    escalationAction:     { type: String, default: '' },

    submittedBy:       { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isPublicSubmission:{ type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyProjectReportSchema.index({ projectId: 1, date: -1 });
dailyProjectReportSchema.index({ driUserId: 1, date: -1 });
dailyProjectReportSchema.index({ escalationRequired: 1, date: -1 });

module.exports = mongoose.model('DailyProjectReport', dailyProjectReportSchema);
