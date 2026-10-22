const mongoose = require('mongoose');
const { Schema } = mongoose;

// Recycle Bin: a full copy of a record taken at the moment it was deleted, so
// the Masters → Recycle Bin screen can put the EXACT document back (same _id,
// so bills / requests / links that still point at it reconnect on their own).
// The snapshot is Mixed so ObjectIds and Dates survive as real BSON types.
const actorSchema = new Schema(
  { id: { type: Schema.Types.ObjectId, default: null }, name: { type: String, default: '' }, email: { type: String, default: '' } },
  { _id: false }
);

const deletedRecordSchema = new Schema(
  {
    entityType: { type: String, required: true, index: true }, // key of RECYCLABLE in utils/recycleBin.js
    entityId:   { type: Schema.Types.ObjectId, required: true, index: true },
    label:      { type: String, default: '' },                 // human label: WO number, vendor code, slip no …
    snapshot:   { type: Schema.Types.Mixed, required: true },
    reason:     { type: String, default: '' },
    deletedBy:  { type: actorSchema, default: () => ({}) },
    deletedAt:  { type: Date, default: Date.now, index: true },
    restoredAt: { type: Date, default: null },
    restoredBy: { type: actorSchema, default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model('DeletedRecord', deletedRecordSchema, 'deleted_records');
