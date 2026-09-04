const mongoose = require('mongoose');

// One doc per department team — keyed by the same team-name string
// canActOnDepartment (utils/departmentAccess.js) already scopes bills by:
// a built-in department value ('civil'/'marketing'/'planning'/'maintenance'),
// or a custom team's own typed name (not the literal 'custom' — that value
// is just an escape hatch, never a team of its own; see that file's own note
// on this same distinction).
//
// Missing a doc for a given department is a valid, common state — it just
// means that team hasn't been customized yet and gets the original hardcoded
// behavior (2-stage AGM→GM, no role narrowing). approvalRuleController's
// list endpoint fills in that default for every department that has no doc.
const departmentApprovalConfigSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, unique: true, trim: true },
    // How many sign-offs this department's bill requests/manual bills need
    // before a RunningBill is actually created. 2 = current/default behavior
    // (AGM, then GM). 1 = AGM alone finalizes. 3/4 = GM (and L3) become
    // intermediate stages instead of final — see billRequestController's
    // gmApproveHandler/l3ApproveHandler for exactly where the bill gets
    // created based on this number.
    requiredApprovals: { type: Number, enum: [1, 2, 3, 4], default: 2 },
    // Empty array = fall back to the hardcoded default roles (['owner','agm']
    // for the AGM stage, ['owner','gm'] for the GM stage; L3/L4 have no
    // hardcoded default — an empty list there means ONLY Owner can act,
    // since no role in this org is inherently "the L3/L4 approver" the way
    // agm/gm roles map onto L1/L2). A non-empty array narrows (or changes)
    // who can act at that stage for this department specifically — 'owner'
    // is always implicitly allowed regardless.
    // Ignored once the matching *UserIds list below is non-empty — naming
    // specific people is a stronger, more specific choice than a role list.
    agmRoles: [{ type: String }],
    gmRoles:  [{ type: String }],
    l3Roles:  [{ type: String }],
    l4Roles:  [{ type: String }],
    // Specific named approvers — when set, ONLY these people (plus Owner)
    // may act at that stage for this department, regardless of role.
    agmUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    gmUserIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    l3UserIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    l4UserIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DepartmentApprovalConfig', departmentApprovalConfigSchema);
