const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

const ROLE_HIERARCHY = ['owner', 'gm', 'agm', 'accounts', 'site-dri'];

// GET /api/users
exports.listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  success(res, { users });
});

// POST /api/users
exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions } = req.body;

  if (!name || !email || !password || !role) {
    return badRequest(res, 'Name, email, password, and role are required');
  }
  if (!ROLE_HIERARCHY.includes(role)) {
    return badRequest(res, `Invalid role. Must be one of: ${ROLE_HIERARCHY.join(', ')}`);
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return badRequest(res, 'A user with this email already exists');

  const user = await User.create({ name, email, password, role, permissions: permissions || [] });
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
  const { name, email, role, isActive, permissions } = req.body;
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
  if (name)                    user.name        = name;
  if (role)                    user.role        = role;
  if (isActive !== undefined)  user.isActive    = isActive;
  if (permissions !== undefined) user.permissions = permissions;

  await user.save();
  const safe = user.toObject();
  delete safe.password;

  const changes = diffFields(before, safe, ['name', 'email', 'role', 'isActive', 'permissions']);
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
