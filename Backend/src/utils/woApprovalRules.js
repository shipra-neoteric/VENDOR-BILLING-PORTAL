const DepartmentApprovalConfig = require('../models/DepartmentApprovalConfig');
const { effectiveDepartment } = require('./approvalRules');

// Work Order equivalent of approvalRules.js's getApprovalConfig/approverAllowed
// — same DepartmentApprovalConfig doc, just the WO-specific fields
// (woRequiredApprovals/checkerUserIds/approverUserIds/finalUserIds) added
// there for exactly this purpose.
const STAGE_USER_FIELD = {
  checker:  'checkerUserIds',
  approver: 'approverUserIds',
  final:    'finalUserIds',
};

async function getWoApprovalConfig(workOrder) {
  const dept = effectiveDepartment(workOrder);
  if (!dept) return null;
  return DepartmentApprovalConfig.findOne({ department: dept }).lean();
}

// Unlike bills' approverAllowed, there's no hardcoded role list to fall back
// to here — Work Order access today is purely the 'work-orders' module's
// checker/approver/ceo-approve permission grants (already enforced by the
// route's own authorizeOr before this ever runs), not literal role names.
// So an unconfigured stage (no config doc, or an empty *UserIds list for
// this stage) must stay `true` — this function only ever NARROWS access
// once a department has actually named specific people for a stage, never
// widens or re-blocks what the route already allowed.
function woApproverAllowed(user, config, stage) {
  const userIds = config?.[STAGE_USER_FIELD[stage]];
  if (userIds && userIds.length) {
    return userIds.some((id) => String(id) === String(user._id));
  }
  return true;
}

module.exports = { getWoApprovalConfig, woApproverAllowed };
