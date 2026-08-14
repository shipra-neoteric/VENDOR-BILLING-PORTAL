const mongoose = require('mongoose');
const { Schema } = mongoose;

// A ticketed request for a drawing from Planning/Design — raised either from
// inside the app (the Daily Progress Report page's "Drawing Request" button)
// or via the public no-login form. Carries its own small lifecycle: L1 (GM)
// assigns it + commits a date, L2 (Architect) produces + uploads it, L3/L4
// (GM) review it, then Planning updates status and actual completion, and
// Planning/the project team check off verification.
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

    // ── Review chain — four stages before Planning can act on it:
    //   L1 (GM) screens whether the drawing is even needed → L2 (Architect)
    //   produces + uploads it → L3 (GM) cross-checks the upload → L4 (GM,
    //   a different specific person in practice) gives final approval.
    // Kept separate from `status` below (which tracks the actual drawing's
    // production progress, only meaningful once reviewStatus === 'approved').
    // "Returned" from L1 is a dead end only the DRI can revive, via resubmit
    // — always back to L1, same "always to L1" segregation the Work Order
    // approval chain uses. A rejection at L3 or L4 instead goes back to L2
    // (the drawing itself needs rework, not the original request).
    // Who may act at each stage is NOT role-based (both current GMs share
    // role 'gm') — it's the per-user 'l1-review'/'l2-draw'/'l3-review'/
    // 'l4-approve' grants on the 'drawing-requests' permission module,
    // assigned individually via User Management.
    reviewStatus: { type: String, enum: ['l1-gm', 'l2-architect', 'l3-gm', 'l4-gm', 'approved', 'returned'], default: 'l1-gm' },
    reviewHistory: [{
      stage:   { type: String, enum: ['l1-gm', 'l2-architect', 'l3-gm', 'l4-gm', 'dri'], required: true },
      action:  { type: String, enum: ['forwarded', 'submitted', 'approved', 'returned', 'resubmitted'], required: true },
      by:      { type: Schema.Types.ObjectId, ref: 'User' },
      at:      { type: Date, default: Date.now },
      remarks: { type: String, default: '' },
    }],

    // ── L2 (Architect) response — the produced drawing(s), e.g. separate
    // elevation + section sheets for the same request.
    drawingFiles: [{ name: { type: String }, url: { type: String } }],

    // ── L1 (GM) response — optionally assign which architect should draw
    // it, and a target date ──
    assignedTo:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    committedDate: { type: Date, default: null },

    // ── L4 (GM) ──
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
