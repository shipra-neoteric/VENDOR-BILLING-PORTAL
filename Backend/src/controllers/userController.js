const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, forbidden, unauthorized } = require('../utils/responseFormatter');
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

// Both routes here (/users POST and PUT) are reached purely via an explicit
// 'user-management' permission grant (see authorizeOr('user-management',
// 'edit') in routes/users.js — no role-name bypass exists there anymore).
// owner/gm are trusted with this regardless, since granting someone the
// 'owner' role is itself the one privilege-escalation this file still
// explicitly guards against — see canAssignRole below, which the user has
// asked to keep exactly as-is.
const TRUSTED_USER_MANAGER_ROLES = ['owner', 'gm'];

const FIXED_DEPARTMENTS = ['civil', 'marketing', 'planning', 'maintenance'];

// Keeps only valid, deduped fixed departments, and drops whichever one is
// already the primary `department` — a team can't be both "home" and
// "additional" for the same person at once.
function sanitizeAdditionalDepartments(list, primaryDepartment) {
  if (!Array.isArray(list)) return [];
  const unique = [...new Set(list)];
  return unique.filter((d) => FIXED_DEPARTMENTS.includes(d) && d !== primaryDepartment);
}

// A limited-permission caller (or GM) must never be able to hand out the Owner role
// itself — only an actual Owner can assign or create the Owner role.
function canAssignRole(caller, role) {
  if (role === 'owner') return caller.role === 'owner';
  if (TRUSTED_USER_MANAGER_ROLES.includes(caller.role)) return true;
  return true;
}

// Previously restricted a limited-permission caller (anyone reaching this
// route via a delegated 'user-management' grant rather than owner/gm) to
// only handing out permissions they themselves already held. Removed per
// explicit request: whoever has been granted 'user-management' access via
// the role/permission matrix is now trusted the same way owner/gm always
// were — reaching this route at all already requires that explicit grant
// (see authorizeOr('user-management', 'edit') in routes/users.js).
function canGrantPermissions() {
  return true;
}

// GET /api/users
exports.listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  success(res, { users });
});

// GET /api/users/:id — single user, for the standalone Edit User page.
exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return notFound(res, 'User not found');
  success(res, { user });
});

// POST /api/users
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions, mobile, department, customDepartment, additionalDepartments } = req.body;

  if (!name || !email || !password || !role) {
    return badRequest(res, 'Name, email, password, and role are required');
  }
  if (!isValidRole(role)) {
    return badRequest(res, 'Invalid role name');
  }
  if (role === 'owner' && req.user.role !== 'owner') {
    return forbidden(res, 'Only Owner can assign the Owner role');
  }
  if (!canAssignRole(req.user, role)) {
    return forbidden(res, 'Only Owner can assign the Owner role');
  }
  if (!canGrantPermissions(req.user, permissions)) {
    return forbidden(res, 'You cannot grant permissions you do not have yourself');
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return badRequest(res, 'A user with this email already exists');

  const user = await User.create({
    name, email, password, role, permissions: permissions || [], mobile: mobile || '',
    department: department || '', customDepartment: department === 'custom' ? (customDepartment || '') : '',
    additionalDepartments: sanitizeAdditionalDepartments(additionalDepartments, department || ''),
  });
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
  const { name, email, role, isActive, permissions, mobile, slackUserId, department, customDepartment, additionalDepartments } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');
  const before = user.toObject();

  // Target is an Owner account: only an Owner is allowed to modify an Owner's account details/role/permissions
  if (user.role === 'owner' && req.user.role !== 'owner') {
    return forbidden(res, 'Only Owner can modify an Owner account');
  }

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
  if (role && role === 'owner' && req.user.role !== 'owner') {
    return forbidden(res, 'Only Owner can assign the Owner role');
  }
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
  if (department !== undefined) {
    user.department = department || '';
    user.customDepartment = department === 'custom' ? (customDepartment || '') : '';
  }
  if (additionalDepartments !== undefined) {
    user.additionalDepartments = sanitizeAdditionalDepartments(additionalDepartments, user.department);
  }

  await user.save();
  const safe = user.toObject();
  delete safe.password;

  const changes = diffFields(before, safe, ['name', 'email', 'role', 'isActive', 'permissions', 'mobile', 'slackUserId', 'department', 'customDepartment', 'additionalDepartments']);
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
  const { currentPassword, password } = req.body;
  if (!password || password.length < 6) {
    return badRequest(res, 'Password must be at least 6 characters');
  }
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return notFound(res, 'User not found');

  // Security Rule 1: Non-owner must NOT reset an Owner's password
  if (user.role === 'owner' && req.user.role !== 'owner') {
    return forbidden(res, 'Only Owner can reset an Owner account password');
  }

  // Security Rule 2: If a user is changing their own password, verify currentPassword
  const isSelf = req.user._id.toString() === user._id.toString();
  if (isSelf) {
    if (!currentPassword) {
      return badRequest(res, 'Current password is required to change your own password');
    }
    const matches = await user.matchPassword(currentPassword);
    if (!matches) {
      return unauthorized(res, 'Current password is incorrect');
    }
  }

  user.password = password;
  await user.save();

  await logAudit({
    action: 'UPDATE', module: 'user-management', user: req.user,
    description: isSelf
      ? 'User changed their own password'
      : `Admin reset password for ${user.name} (${user.email})`,
    entityType: 'User', entityId: user._id, entityLabel: user.email,
  });

  success(res, {}, 'Password updated');
});

// DELETE /api/users/:id  (soft-delete = deactivate)
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');

  // Security Rule: Only Owner can deactivate an Owner account
  if (user.role === 'owner' && req.user.role !== 'owner') {
    return forbidden(res, 'Only Owner can deactivate an Owner account');
  }

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
