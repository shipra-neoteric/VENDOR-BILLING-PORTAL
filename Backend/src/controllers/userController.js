const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');

const ROLE_HIERARCHY = ['owner', 'gm', 'engineer', 'accounts', 'dri', 'contractor'];

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
  created(res, { user: safe }, `User ${user.name} created`);
});

// PUT /api/users/:id
exports.updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, isActive, permissions } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return notFound(res, 'User not found');

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
  success(res, {}, `${user.name} has been deactivated`);
});
