const jwt  = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, fail, badRequest, unauthorized, forbidden, notFound } = require('../utils/responseFormatter');
const { logAudit } = require('../utils/auditLog');

const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const userPayload = (user) => ({
  id:          user._id,
  name:        user.name,
  email:       user.email,
  role:        user.role,
  vendorCode:  user.vendorCode,
  permissions: user.permissions || [],
});

exports.register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, role, vendorCode } = req.body;
  const email    = req.body.email?.trim().toLowerCase();
  const password = req.body.password;

  if (await User.findOne({ email })) {
    return badRequest(res, 'Email already registered');
  }

  const user  = await User.create({ name, email, password, role, vendorCode });
  const token = signToken(user._id);

  created(res, { token, user: userPayload(user) }, 'Registration successful');
});

exports.login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const email = req.body.email?.trim().toLowerCase();
  const { password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return unauthorized(res, 'Invalid email or password');
  }
  if (!user.isActive) {
    return forbidden(res, 'Account is deactivated');
  }

  const token = signToken(user._id);
  await logAudit({
    action: 'LOGIN', module: 'auth', user,
    description: 'User logged in',
    entityType: 'User', entityId: user._id, entityLabel: user.email,
    ip: clientIp(req),
  });
  success(res, { token, user: userPayload(user) }, 'Login successful');
});

exports.getMe = asyncHandler(async (req, res) => {
  success(res, { user: req.user });
});

// Owner-only "quick switch" — mints a real session token for another account
// without needing their password, for convenience while testing different
// roles. Gated to owner at the route level; every switch is audit-logged.
exports.switchUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target) return notFound(res, 'User not found');
  if (!target.isActive) return forbidden(res, 'That account is deactivated');

  const token = signToken(target._id);
  await logAudit({
    action: 'LOGIN', module: 'auth', user: req.user,
    description: `Owner switched into ${target.name}'s account (${target.email})`,
    entityType: 'User', entityId: target._id, entityLabel: target.email,
    ip: clientIp(req),
  });
  success(res, { token, user: userPayload(target) }, `Switched to ${target.name}`);
});

exports.listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  const users = await User.find(filter).select('name email role isActive').sort({ name: 1 });
  success(res, { users });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return badRequest(res, 'Both currentPassword and newPassword are required');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) {
    return unauthorized(res, 'Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();
  success(res, null, 'Password changed successfully');
});
