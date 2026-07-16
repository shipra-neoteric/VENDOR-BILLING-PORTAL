const mongoose = require('mongoose');

// One row per calendar day — captured lazily (see slaEngine.captureDailySnapshotIfNeeded)
// the first time anyone loads the MIS report on a given day. No cron job required,
// same "compute on read, not on a schedule" approach already used for SLA breach
// detection. This is what powers trend-over-time charts once enough days accumulate.
const misSnapshotSchema = new mongoose.Schema(
  {
    date:            { type: String, required: true, unique: true }, // 'YYYY-MM-DD'
    netSla:          { type: Number, default: 0 },
    ongoing:         { type: Number, default: 0 },
    slaBreach:       { type: Number, default: 0 },
    slaCompleted:    { type: Number, default: 0 },
    pendingAmount:   { type: Number, default: 0 },
    breachedAmount:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MISSnapshot', misSnapshotSchema);
