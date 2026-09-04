const DepartmentApprovalConfig = require('../models/DepartmentApprovalConfig');
const WorkOrder    = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');
const { DEFAULT_AGM_ROLES, DEFAULT_GM_ROLES, DEFAULT_L3_ROLES, DEFAULT_L4_ROLES } = require('../utils/approvalRules');

const BUILT_IN_DEPARTMENTS = ['civil', 'marketing', 'planning', 'maintenance'];

// GET /api/approval-rules — one row per department that could actually gate
// a bill: the 4 built-in teams, plus every distinct custom team name anyone
// has actually typed on a work order (department:'custom' is never a team of
// its own — see approvalRules.js's effectiveDepartment). Departments with no
// saved config still get a row here, defaulted to today's hardcoded behavior,
// so the admin sees every department's effective rule, not just customized ones.
exports.listApprovalRules = asyncHandler(async (req, res) => {
  const customNames = await WorkOrder.distinct('customDepartment', { department: 'custom', customDepartment: { $ne: '' } });
  const allDepartments = [...BUILT_IN_DEPARTMENTS, ...customNames.sort()];

  const configs = await DepartmentApprovalConfig.find({ department: { $in: allDepartments } })
    .populate('agmUserIds', 'name email')
    .populate('gmUserIds', 'name email')
    .populate('l3UserIds', 'name email')
    .populate('l4UserIds', 'name email')
    .lean();
  const configMap = new Map(configs.map(c => [c.department, c]));

  const rules = allDepartments.map(department => {
    const c = configMap.get(department);
    return {
      department,
      isCustom: !BUILT_IN_DEPARTMENTS.includes(department),
      requiredApprovals: c?.requiredApprovals ?? 2,
      agmRoles: c?.agmRoles ?? [],
      gmRoles:  c?.gmRoles  ?? [],
      l3Roles:  c?.l3Roles  ?? [],
      l4Roles:  c?.l4Roles  ?? [],
      // Populated to {_id, name, email} so the admin UI can show names, not
      // just opaque ids — upsertApprovalRule below only ever needs the ids.
      agmUsers: c?.agmUserIds ?? [],
      gmUsers:  c?.gmUserIds  ?? [],
      l3Users:  c?.l3UserIds  ?? [],
      l4Users:  c?.l4UserIds  ?? [],
      isDefault: !c,
    };
  });

  success(res, { rules, defaults: { agmRoles: DEFAULT_AGM_ROLES, gmRoles: DEFAULT_GM_ROLES, l3Roles: DEFAULT_L3_ROLES, l4Roles: DEFAULT_L4_ROLES } });
});

// PUT /api/approval-rules/:department — upsert. Passing back the hardcoded
// defaults (requiredApprovals:2, both role lists empty) is equivalent to
// deleting the override, but kept as a plain upsert rather than a delete —
// one code path, and the doc's updatedBy/timestamps stay as a record of who
// last touched this department's rule even if they reset it to default.
exports.upsertApprovalRule = asyncHandler(async (req, res) => {
  const department = (req.params.department || '').trim();
  if (!department) return badRequest(res, 'Department is required');

  const requiredApprovals = Number(req.body.requiredApprovals);
  if (![1, 2, 3, 4].includes(requiredApprovals)) return badRequest(res, 'requiredApprovals must be 1, 2, 3 or 4');

  const asStringArray = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
  const agmRoles = asStringArray(req.body.agmRoles);
  const gmRoles  = asStringArray(req.body.gmRoles);
  const l3Roles  = asStringArray(req.body.l3Roles);
  const l4Roles  = asStringArray(req.body.l4Roles);
  const agmUserIds = asStringArray(req.body.agmUserIds);
  const gmUserIds  = asStringArray(req.body.gmUserIds);
  const l3UserIds  = asStringArray(req.body.l3UserIds);
  const l4UserIds  = asStringArray(req.body.l4UserIds);

  const before = await DepartmentApprovalConfig.findOne({ department }).lean();

  const config = await DepartmentApprovalConfig.findOneAndUpdate(
    { department },
    { $set: {
      requiredApprovals, agmRoles, gmRoles, l3Roles, l4Roles,
      agmUserIds, gmUserIds, l3UserIds, l4UserIds, updatedBy: req.user._id,
    } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const changes = before
    ? diffFields(before, config.toObject(), ['requiredApprovals', 'agmRoles', 'gmRoles', 'l3Roles', 'l4Roles', 'agmUserIds', 'gmUserIds', 'l3UserIds', 'l4UserIds'])
    : { requiredApprovals: { from: 2, to: requiredApprovals } };
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'user-management', user: req.user,
      description: `Updated approval rule for "${department}"`,
      entityType: 'DepartmentApprovalConfig', entityId: config._id, entityLabel: department,
      changes,
    });
  }

  success(res, { rule: config }, `Approval rule for "${department}" saved`);
});
