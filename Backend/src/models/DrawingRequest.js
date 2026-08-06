const mongoose = require('mongoose');
const { Schema } = mongoose;

// A ticketed request for a drawing from Planning/Design — raised either from
// inside the app (the Daily Progress Report page's "Drawing Request" button)
// or via the public no-login form. Carries its own small lifecycle: AGM
// assigns it + commits a date, GM sets a priority, Planning updates status
// and actual completion, and Planning/the project team check off verification.
const drawingRequestSchema = new Schema(
  {
    ticketNo: { type: String, required: true, unique: true },

    projectId:   { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    projectName: { type: String, default: '' },
    description: { type: String, required: true },
    drawingType: {
      type: String,
      enum: ['Architectural', 'Structural', 'MEP', 'Civil', 'Interior', 'Landscape', 'Shop Drawing', 'As-Built', 'Other'],
      required: true,
    },
    source: {
      type: String,
      enum: ['', 'Site Visit', 'RFI', 'Client Request', 'Internal Review', 'Other'],
      default: '',
    },
    driName: { type: String, required: true }, // "Requested By (DRI)" — free text, same convention as Daily Progress Report

    // ── Review chain — AGM then GM must approve before Planning can act on it.
    // Kept separate from `status` below (which tracks the actual drawing's
    // production progress, only meaningful once reviewStatus === 'approved').
    // "Returned" is a dead end only the DRI can revive, via resubmit — it
    // always goes back to AGM review, never straight to GM, same "always to
    // L1" segregation the Work Order approval chain uses.
    reviewStatus: { type: String, enum: ['agm-review', 'gm-review', 'approved', 'returned'], default: 'agm-review' },
    reviewHistory: [{
      stage:   { type: String, enum: ['agm', 'gm', 'dri'], required: true },
      action:  { type: String, enum: ['forwarded', 'approved', 'returned', 'resubmitted'], required: true },
      by:      { type: Schema.Types.ObjectId, ref: 'User' },
      at:      { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
    }],

    // ── AGM response ──
    assignedTo:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    committedDate: { type: Date, default: null },

    // ── GM ──
    priority: { type: String, enum: ['', 'low', 'medium', 'high', 'urgent'], default: '' },

    // ── Planning ──
    status:               { type: String, enum: ['pending', 'committed', 'completed', 'delayed'], default: 'pending' },
    actualCompletionDate: { type: Date, default: null },

    // ── Verification ──
    planningVerified:   { type: Boolean, default: false },
    projectAcknowledged: { type: Boolean, default: false },
    remarks:             { type: String, default: '' },

    submittedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isPublicSubmission: { type: Boolean, default: false },
  },
  { timestamps: true }
);

drawingRequestSchema.index({ projectId: 1, createdAt: -1 });
drawingRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DrawingRequest', drawingRequestSchema);
