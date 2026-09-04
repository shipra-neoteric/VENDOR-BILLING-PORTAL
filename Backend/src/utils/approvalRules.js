const DepartmentApprovalConfig = require('../models/DepartmentApprovalConfig');

// Kill switch — while every user's department isn't finalized yet, a
// half-configured "specific approvers" list can lock a real approver out of
// their own department's bills (already happened once — see approverAllowed's
// own note below). Flip this to true once departments/approvers have been
// fully reviewed. Off: approverAllowed always passes (role/permission checks
// already done by the route's authorizeOr still apply as before) — the
// required-approvals LEVEL COUNT (1-4, whichever stage finalizes the bill)
// stays enforced regardless, since that's a deliberate per-department choice,
// not an accidental lockout risk the way naming specific people/roles is.
const DEPARTMENT_APPROVER_RESTRICTIONS_ENABLED = true;

const DEFAULT_AGM_ROLES = ['owner', 'agm'];
const DEFAULT_GM_ROLES  = ['owner', 'gm'];
// L3/L4 have no hardcoded role in this org's hierarchy the way agm/gm do —
// an unconfigured L3/L4 stage is Owner-only until a department explicitly
// names roles or specific people for it.
const DEFAULT_L3_ROLES = ['owner'];
const DEFAULT_L4_ROLES = ['owner'];

const STAGE_FIELDS = {
  agm: { roles: 'agmRoles', userIds: 'agmUserIds', fallback: DEFAULT_AGM_ROLES, action: 'agm-approve' },
  gm:  { roles: 'gmRoles',  userIds: 'gmUserIds',  fallback: DEFAULT_GM_ROLES,  action: 'gm-approve' },
  l3:  { roles: 'l3Roles',  userIds: 'l3UserIds',  fallback: DEFAULT_L3_ROLES,  action: 'l3-approve' },
  l4:  { roles: 'l4Roles',  userIds: 'l4UserIds',  fallback: DEFAULT_L4_ROLES,  action: 'l4-approve' },
};

// Same check authorizeOr already does at the route level (role OR an
// explicit module+action permission grant via User Management) — approver-
// Allowed below must never re-block someone the route already let through.
function hasExplicitPermission(user, action) {
  const perm = (user.permissions || []).find((p) => p.module === 'bill-requests');
  return !!(perm && perm.actions.includes(action));
}

// The team-name a doc's department/customDepartment actually resolves to —
// same rule canActOnDepartment (departmentAccess.js) uses: 'custom' itself
// is never a team, only the typed customDepartment name is.
function effectiveDepartment(doc) {
  if (!doc || !doc.department) return '';
  return doc.department === 'custom' ? (doc.customDepartment || '') : doc.department;
}

// Looks up this department's approval config, if any — returns null (not a
// default object) when nothing's configured, so callers can cheaply tell
// "no override, use hardcoded defaults" apart from "1-approval override".
async function getApprovalConfig(doc) {
  const dept = effectiveDepartment(doc);
  if (!dept) return null;
  return DepartmentApprovalConfig.findOne({ department: dept }).lean();
}

// owner always passes, regardless of any configured role list — matches
// every existing hardcoded owner-bypass elsewhere in the approval chain.
function roleAllowed(role, configuredRoles, fallbackRoles) {
  if (role === 'owner') return true;
  const list = configuredRoles && configuredRoles.length ? configuredRoles : fallbackRoles;
  return list.includes(role);
}

// Named approvers are a stronger, more specific choice than a role list —
// when a department DELIBERATELY names specific people or roles for a
// stage, that narrows access down to exactly them (plus Owner), even over
// someone who already holds an explicit module-permission grant — naming a
// department's approvers is a more specific decision than a blanket
// checkbox. But when a department has configured NOTHING for this stage
// (no named people, no role list — the default, unconfigured case), this
// must never be more restrictive than the route's own authorizeOr check
// already was: fall back to "role in the hardcoded default list OR an
// explicit agm-approve/gm-approve/l3-approve/l4-approve permission grant".
// Getting this fallback wrong once already locked out a GM who'd been
// explicitly granted 'agm-approve' via User Management — the hardcoded
// role list alone silently ignored that grant.
function approverAllowed(user, config, stage) {
  if (user.role === 'owner') return true;
  if (!DEPARTMENT_APPROVER_RESTRICTIONS_ENABLED) return true;
  const fields = STAGE_FIELDS[stage];
  const userIds = config?.[fields.userIds];
  if (userIds && userIds.length) {
    return userIds.some((id) => String(id) === String(user._id));
  }
  const configuredRoles = config?.[fields.roles];
  if (configuredRoles && configuredRoles.length) {
    return configuredRoles.includes(user.role);
  }
  return fields.fallback.includes(user.role) || hasExplicitPermission(user, fields.action);
}

module.exports = {
  DEFAULT_AGM_ROLES, DEFAULT_GM_ROLES, DEFAULT_L3_ROLES, DEFAULT_L4_ROLES,
  effectiveDepartment, getApprovalConfig, roleAllowed, approverAllowed,
};
