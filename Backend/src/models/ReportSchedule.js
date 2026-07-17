const mongoose = require('mongoose');

// No email/SMTP is wired up yet, so "delivery" means: the schedule becomes
// due at timeOfDay and shows up as an in-app notification (see
// reportScheduleController.getDueSchedules) the next time the owner loads
// the dashboard, rather than being emailed out.
const reportScheduleSchema = new mongoose.Schema(
  {
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    viewType:        { type: String, enum: ['operational', 'financial'], required: true },
    projectId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    projectName:     { type: String, default: 'All Projects' },
    timeOfDay:       { type: String, required: true }, // 'HH:mm', 24h
    active:          { type: Boolean, default: true },
    lastNotifiedDate: { type: String, default: null }, // 'YYYY-MM-DD'
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReportSchedule', reportScheduleSchema);
