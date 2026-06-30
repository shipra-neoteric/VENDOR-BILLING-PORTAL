const mongoose = require('mongoose');

const milestoneActivitySchema = new mongoose.Schema(
  {
    milestoneId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone', required: true },
    activityId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Activity',  required: true },
    requiredPercentage: { type: Number, default: 100, min: 1, max: 100 },
  },
  { timestamps: false }
);

milestoneActivitySchema.index({ milestoneId: 1 });
milestoneActivitySchema.index({ activityId:  1 });
milestoneActivitySchema.index({ milestoneId: 1, activityId: 1 }, { unique: true });

module.exports = mongoose.model('MilestoneActivity', milestoneActivitySchema);
