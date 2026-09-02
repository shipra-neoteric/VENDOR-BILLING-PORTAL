const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

const ROLE_HIERARCHY = ['owner', 'gm', 'agm', 'accounts', 'process-coordinator', 'site-dri'];

// A role is either one of the 6 built-in ones above, or a genuinely new
// custom role name — accepted as long as it isn't just a different-case
// spelling of a built-in role (which could otherwise be confused for one by
// any future case-insensitive check, e.g. the 'owner'/'site-dri' bypasses
// elsewhere in the app that are — and must stay — exact-match only).
function isValidRole(role) {
  if (typeof role !== 'string') return false;
  const trimmed = role.trim();
  if (!trimmed) return false;
  if (ROLE_HIERARCHY.includes(trimmed)) return true;
  if (ROLE_HIERARCHY.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return false;
  return /^[A-Za-z0-9 _-]{2,40}$/.test(trimmed);
}

// Both routes here (/users POST and PUT) are reachable two ways: via the
// 'owner'/'gm' role bypass (the existing, already-trusted admin path — see
// authorizeOr('user-management', 'edit', 'owner', 'gm') in routes/users.js),
// or via a narrow delegated 'user-management' permission grant handed to
// some other role. Only that second, limited-permission path is what needs
// restricting — 'owner' and 'gm' keep managing users exactly as before.
const TRUSTED_USER_MANAGER_ROLES = ['owner', 'gm'];

// A limited-permission caller must never be able to hand out the Owner role
// itself — that would be a full privilege escalation via a narrow grant.
function canAssignRole(caller, role) {
  if (TRUSTED_USER_MANAGER_ROLES.includes(caller.role)) return true;
  return role !== 'owner';
}

// A limited-permission caller can only grant a permission (module+action)
// they themselves already hold — otherwise anyone with a narrow
// 'user-management' grant could hand out capabilities they were never given,
// e.g. granting someone else full 'accounts-payment' access.
function canGrantPermissions(caller, permissions) {
  if (TRUSTED_USER_MANAGER_ROLES.includes(caller.role)) return true;
  const callerPerms = caller.permissions || [];
  const callerHasAction = (module, action) =>
    !!callerPerms.find((p) => p.module === module)?.actions?.includes(action);
  return (permissions || []).every((p) => (p.actions || []).every((a) => callerHasAction(p.module, a)));
}

// GET /api/users
exports.listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  success(res, { users });
});

// POST /api/users
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions, mobile } = req.body;

  if (!name || !email || !password || !role) {
    return badRequest(res, 'Name, email, password, and role are required');
  }
  if (!isValidRole(role)) {
    return badRequest(res, 'Invalid role name');
  }
  if (!canAssignRole(req.user, role)) {
    return forbidden(res, 'Only Owner can assign the Owner role');
  }
  if (!canGrantPermissions(req.user, permissions)) {
    return forbidden(res, 'You cannot grant permissions you do not have yourself');
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return badRequest(res, 'A user with this email already exists');

  const user = await User.create({ name, email, password, role, permissions: permissions || [], mobile: mobile || '' });
  const safe = user.toObject();
  delete safe.password;

  await logAudit({
    action: 'CREATE', module: 'user-management', user: req.user,
    description: `Created user ${user.name} (${user.email}) as ${user.role}`,
    entityType: 'User', entityId: user._id, entityLabel: user.email,
  });

  created(res, { user: safe }, `User ${user.name} created`);
});

// PUT /api/users/:id
exports.updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, isActive, permissions, mobile, slackUserId } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');
  const before = user.toObject();

  // Prevent demoting/deactivating self
  if (req.user._id.toString() === user._id.toString()) {
    if (isActive === false) return badRequest(res, 'You cannot deactivate your own account');
    if (role && role !== user.role && user.role === 'owner') {
      return badRequest(res, 'You cannot change your own owner role');
    }
  }

  if (email && email !== user.email) {
    const taken = await User.findOne({ email: email.toLowerCase().trim() });
    if (taken) return badRequest(res, 'Email already in use by another account');
    user.email = email.toLowerCase().trim();
  }
  if (role && !isValidRole(role)) return badRequest(res, 'Invalid role name');
  if (role && !canAssignRole(req.user, role)) {
    return forbidden(res, 'Only Owner can assign the Owner role');
  }
  if (permissions !== undefined && !canGrantPermissions(req.user, permissions)) {
    return forbidden(res, 'You cannot grant permissions you do not have yourself');
  }
  if (name)                    user.name        = name;
  if (role)                    user.role        = role;
  if (isActive !== undefined)  user.isActive    = isActive;
  if (permissions !== undefined) user.permissions = permissions;
  if (mobile !== undefined)    user.mobile      = mobile;
  if (slackUserId !== undefined) user.slackUserId = slackUserId.trim() || null;

  await user.save();
  const safe = user.toObject();
  delete safe.password;

  const changes = diffFields(before, safe, ['name', 'email', 'role', 'isActive', 'permissions', 'mobile', 'slackUserId']);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'user-management', user: req.user,
      description: `Updated user ${user.name} (${user.email})`,
      entityType: 'User', entityId: user._id, entityLabel: user.email,
      changes,
    });
  }

  success(res, { user: safe }, 'User updated');
});

// PATCH /api/users/:id/password
exports.changePassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return badRequest(res, 'Password must be at least 6 characters');
  }
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return notFound(res, 'User not found');

  user.password = password;
  await user.save();

  await logAudit({
    action: 'UPDATE', module: 'user-management', user: req.user,
    description: `Reset password for ${user.name} (${user.email})`,
    entityType: 'User', entityId: user._id, entityLabel: user.email,
  });

  success(res, {}, 'Password updated');
});

// DELETE /api/users/:id  (soft-delete = deactivate)
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');
  if (req.user._id.toString() === user._id.toString()) {
    return badRequest(res, 'You cannot delete your own account');
  }
  user.isActive = false;
  await user.save();

  await logAudit({
    action: 'UPDATE', module: 'user-management', user: req.user,
    description: `Deactivated user ${user.name} (${user.email})`,
    entityType: 'User', entityId: user._id, entityLabel: user.email,
  });

  success(res, {}, `${user.name} has been deactivated`);
});
