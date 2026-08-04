const mongoose = require('mongoose');
const { Schema } = mongoose;

// A DRI's request for a drawing from Planning/Design — raised from the Daily
// Progress Report form (authenticated sessions only; the public no-login
// form has no such button since there's no requester identity to route it to).
const drawingRequestSchema = new Schema(
  {
    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, default: '' },
    description: { type: String, required: true },
    priority:    { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    status:      { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

drawingRequestSchema.index({ projectId: 1, createdAt: -1 });
drawingRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DrawingRequest', drawingRequestSchema);
