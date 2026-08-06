const mongoose = require('mongoose');
const { Schema } = mongoose;

// One image, stored as a base64 data URL — same inline-attachment convention
// as WorkOrder documents (see utils/validateDocuments.js), just grouped under
// a work-type category instead of a flat list.
const workImageSchema = new Schema({ name: String, url: String }, { _id: false });

const workEntrySchema = new Schema(
  {
    workType: { type: String, required: true },
    images: [workImageSchema],
    // Distinct from `images` (general work-in-progress shots) — one snapshot
    // of the same spot before work started and after it finished.
    beforeImages: [workImageSchema],
    afterImages:  [workImageSchema],
  },
  { _id: false }
);

// The combined end-of-day site report — merges what used to be two separate
// submissions (Daily Project Report + Daily Contractor/Labour Report) into
// one form: project/DRI/date, a contractor + shift + labour count, and a
// work-type checklist where each ticked category carries its own site-photo
// evidence. Submittable two ways: logged in (submittedBy set) or via the
// public no-login form (submittedBy null, isPublicSubmission true).
const dailyProgressReportSchema = new Schema(
  {
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, default: '' },
    driUserId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    driName:     { type: String, required: true },
    date:        { type: Date, required: true },

    vendorCode: { type: String, required: true },
    vendorName: { type: String, default: '' },

    shiftType:   { type: String, enum: ['Day', 'Night'], required: true },
    labourCount: { type: Number, required: true, min: 0 },

    workEntries: [workEntrySchema],

    submittedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isPublicSubmission: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dailyProgressReportSchema.index({ projectId: 1, date: -1 });
dailyProgressReportSchema.index({ driUserId: 1, date: -1 });
dailyProgressReportSchema.index({ vendorCode: 1, date: -1 });

module.exports = mongoose.model('DailyProgressReport', dailyProgressReportSchema);
