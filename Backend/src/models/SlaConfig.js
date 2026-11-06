const mongoose = require('mongoose');

// One document (_id 'default'): the working time every SLA clock runs on — which days, and between which hours (IST).
// Edited from Masters → SLA. Missing document = the built-in default (Monday–Saturday, 9am–6pm).
const slaConfigSchema = new mongoose.Schema(
  {
    _id:         { type: String, default: 'default' },
    workingDays: [{ type: String }],
    startHour:   { type: Number, default: 9 },
    endHour:     { type: Number, default: 18 },
    updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SlaConfig', slaConfigSchema);
