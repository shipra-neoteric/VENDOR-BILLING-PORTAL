const Role = require('../models/Role');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

// The 6 built-in roles are seeded here as read-only entries purely so the
// Roles library shows every role that exists, custom ones alongside
// built-in ones. Access is now decided purely by each role's `permissions`
// array (merged into every user on that role at request time — see
// mergeRolePermissions in middleware/auth.js): no module/action is granted
// through a hardcoded role-name check anymore, so this array (populated via
// a one-off migration for owner/gm, and via the Roles-tab UI or targeted
// backfills for the others) is the actual source of truth for what each
// built-in role can do.
const SYSTEM_ROLES = [
  { name: 'owner', description: 'Full system access — all modules, user management.' },
  { name: 'gm', description: 'Reviews DRI progress, generates bill requests, work order sign-off & Accounts Payment checker stage.' },
  { name: 'agm', description: 'Reviews DRI progress, generates bill requests, work order sign-off & first stage of bill approval.' },
  { name: 'accounts', description: 'Accounts Payment (maker/checker/approver/release), advance payments, ledger — per-user level assigned individually.' },
  { name: 'process-coordinator', description: 'Access assigned individually via the module permissions checklist.' },
  { name: 'site-dri', description: 'DRI Work Dashboard — logs daily progress only.' },
];

// Lazily backfills the 6 system roles the first time anyone opens the
// library — avoids a separate migration script, and stays harmless to
// call repeatedly (upsert, never overwrites an existing doc).
async function ensureSystemRoles() {
  for (const r of SYSTEM_ROLES) {
    await Role.updateOne(
      { name: r.name },
      { $setOnInsert: { ...r, isSystem: true, permissions: [] } },
      { upsert: true }
    );
  }
}

// GET /api/roles
exports.listRoles = asyncHandler(async (req, res) => {
  await ensureSystemRoles();
  const roles = await Role.find().sort({ isSystem: -1, name: 1 });
  const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map(c => [c._id, c.count]));
  success(res, {
    roles: roles.map(r => ({ ...r.toObject(), userCount: countMap.get(r.name) || 0 })),
  });
});

// GET /api/roles/:id — single role, for the standalone permissions-matrix page.
exports.getRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return notFound(res, 'Role not found');
  const userCount = await User.countDocuments({ role: role.name });
  success(res, { role: { ...role.toObject(), userCount } });
});

// POST /api/roles — custom roles only; the 6 system ones are seeded, never created here.
exports.createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || !name.trim()) return badRequest(res, 'Role name is required');

  const existing = await Role.findOne({ name: name.trim() });
  if (existing) return conflict(res, 'A role with this name already exists');

  const role = await Role.create({
    name: name.trim(), description: description || '', permissions: permissions || [],
    isSystem: false, createdBy: req.user._id,
  });

  await logAudit({
    action: 'CREATE', module: 'user-management', user: req.user,
    description: `Created role ${role.name}`,
    entityType: 'Role', entityId: role._id, entityLabel: role.name,
  });

  created(res, { role }, `Role ${role.name} created`);
});

// PUT /api/roles/:id — description/permissions only; name and isSystem never change
// after creation (renaming would silently orphan every user already on the old
// name — see renameRole). Built-in roles ARE allowed here, unlike rename/
// delete: the auth middleware (see mergeRolePermissions) merges a role's
// permissions into every user on it at request time, so editing e.g.
// "accounts" here genuinely changes access for every accounts-role user —
// there is no hardcoded role-name bypass left anywhere to fall back on.
exports.updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return notFound(res, 'Role not found');

  const before = role.toObject();
  if (req.body.description !== undefined) role.description = req.body.description;
  if (req.body.permissions !== undefined) role.permissions = req.body.permissions;
  await role.save();

  const changes = diffFields(before, role.toObject(), ['description', 'permissions']);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'user-management', user: req.user,
      description: `Updated role ${role.name}`,
      entityType: 'Role', entityId: role._id, entityLabel: role.name,
      changes,
    });
  }

  success(res, { role }, 'Role updated');
});

// PATCH /api/roles/:id/rename — the only place a role's name can change. Custom
// roles only (isSystem ones are the literal string every hardcoded role-name
// check in the app compares against — e.g. `role === 'owner'` — renaming one
// would silently break every one of those, not just this Role document).
// Cascades onto every User already on the old name, so nobody is silently
// left pointing at a role that no longer exists.
exports.renameRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return notFound(res, 'Role not found');
  if (role.isSystem) return badRequest(res, 'Built-in roles cannot be renamed');

  const name = (req.body.name || '').trim();
  if (!name) return badRequest(res, 'Role name is required');
  if (name === role.name) return success(res, { role }, 'Role updated');

  const clash = await Role.findOne({ name, _id: { $ne: role._id } });
  if (clash) return conflict(res, 'A role with this name already exists');

  const oldName = role.name;
  role.name = name;
  await role.save();
  await User.updateMany({ role: oldName }, { $set: { role: name } });

  await logAudit({
    action: 'UPDATE', module: 'user-management', user: req.user,
    description: `Renamed role ${oldName} → ${name}`,
    entityType: 'Role', entityId: role._id, entityLabel: name,
    changes: { name: { from: oldName, to: name } },
  });

  success(res, { role }, 'Role renamed');
});

// DELETE /api/roles/:id — refuses if any user is still on it, so deleting a role can
// never silently leave users pointing at a role name that no longer exists.
exports.deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return notFound(res, 'Role not found');
  if (role.isSystem) return badRequest(res, 'Built-in roles cannot be deleted');

  const inUse = await User.countDocuments({ role: role.name });
  if (inUse > 0) return badRequest(res, `${inUse} user(s) still have this role — reassign them first`);

  await role.deleteOne();

  await logAudit({
    action: 'DELETE', module: 'user-management', user: req.user,
    description: `Deleted role ${role.name}`,
    entityType: 'Role', entityId: role._id, entityLabel: role.name,
  });

  success(res, {}, 'Role deleted');
});
