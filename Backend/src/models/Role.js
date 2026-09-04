const mongoose = require('mongoose');

// A reusable permission set, independent of any one user — the eventual
// point of this model is "edit the role once, everyone on it updates",
// but Phase 1 only introduces the role library itself; User.permissions
// stays the source of truth for what a user can actually do until a later
// phase moves User onto a roleId reference (see UserManagement's own
// migration notes on the frontend).
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: '' },
    permissions: [{
      module:  { type: String, required: true },
      actions: [{ type: String }],
      _id: false,
    }],
    // The 6 built-in roles (owner/gm/agm/accounts/process-coordinator/
    // site-dri) are seeded here as read-only entries so they show up
    // alongside custom roles in the library — never editable or deletable
    // through this model, since their behavior is hardcoded across the
    // app (authorizeOr bypasses, role-specific UI, etc.), not driven by
    // this permissions array.
    isSystem: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
