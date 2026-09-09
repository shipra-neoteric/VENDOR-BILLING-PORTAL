const DepartmentApprovalConfig = require('../models/DepartmentApprovalConfig');
const { effectiveDepartment } = require('./approvalRules');

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
  const dept = effectiveDepartment(workOrder);
  if (!dept) return null;
  return DepartmentApprovalConfig.findOne({ department: dept }).lean();
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
  // Owner bypasses every department-specific checker/approver/final-approver
  // restriction, same as approvalRules.js's approverAllowed (bills) and every
  // other department-scoped gate in this app — a department naming specific
  // people for a Work Order stage must narrow everyone else down to exactly
  // them, but must never lock Owner out of a Work Order Owner can otherwise
  // see and act on.
  if (user.role === 'owner') return true;
  const fields = STAGE_FIELDS[stage];
  const userIds = config?.[fields.userIds];
  if (!userIds || !userIds.length) return true;
  if (userIds.some((id) => String(id) === String(user._id))) return true;
  const perm = (user.permissions || []).find((p) => p.module === 'work-orders');
  return !!(perm && perm.actions.includes(fields.action));
}

module.exports = { getWoApprovalConfig, woApproverAllowed };
