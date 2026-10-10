const { effectiveDepartment, getApprovalConfig } = require('./approvalRules');

// Work Order equivalent of approvalRules.js's getApprovalConfig/approverAllowed
// — same DepartmentApprovalConfig doc, just the WO-specific fields
// (woRequiredApprovals/checkerUserIds/approverUserIds/finalUserIds) added
// there for exactly this purpose.
const STAGE_FIELDS = {
  checker:  { userIds: 'checkerUserIds',  action: 'checker' },
  approver: { userIds: 'approverUserIds', action: 'approver' },
  final:    { userIds: 'finalUserIds',    action: 'ceo-approve' },
};

async function getWoApprovalConfig(workOrder) {
  return getApprovalConfig(workOrder);
}

// Same rule as bills' approverAllowed/hasExplicitPermission: a department
// naming specific people for a stage narrows who's EXPECTED to act there,
// but must never lock out someone who's been separately, explicitly granted
// that stage's permission via User Management (module 'work-orders') — a
// named list adds to who can act, it doesn't take away from an existing
// permission grant. Unlike bills there's no hardcoded role list to fall back
// to here — Work Order access today is purely this permission-matrix
// (already enforced once by the route's own authorizeOr before this ever
// runs), not literal role names — so an unconfigured stage (no config doc,
// or an empty *UserIds list for this stage) stays `true` unconditionally.
function woApproverAllowed(user, config, stage) {
  // Owner/CEO bypass every department-specific checker/approver/final-approver
  // restriction, same as approvalRules.js's approverAllowed (bills) and every
  // other department-scoped gate in this app — a department naming specific
  // people for a Work Order stage must narrow everyone else down to exactly
  // them, but must never lock Owner/CEO out of a Work Order they can
  // otherwise see and act on. CEO's own permission grant only ever covers
  // the final stage ('ceo-approve'), so without this he'd be wrongly
  // blocked acting as checker/approver on a work order that hasn't reached
  // 'pending-final' yet.
  if (user.role === 'owner' || user.role === 'CEO') return true;
  const fields = STAGE_FIELDS[stage];
  const userIds = config?.[fields.userIds];
  if (!userIds || !userIds.length) return true;
  if (userIds.some((id) => String(id) === String(user._id))) return true;
  const perm = (user.permissions || []).find((p) => p.module === 'work-orders');
  return !!(perm && perm.actions.includes(fields.action));
}

module.exports = { getWoApprovalConfig, woApproverAllowed };
