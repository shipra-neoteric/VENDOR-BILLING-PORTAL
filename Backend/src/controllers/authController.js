const jwt  = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, fail, badRequest, unauthorized, forbidden } = require('../utils/responseFormatter');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const userPayload = (user) => ({
  id:         user._id,
  name:       user.name,
  email:      user.email,
  role:       user.role,
  vendorCode: user.vendorCode,
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
  success(res, { token, user: userPayload(user) }, 'Login successful');
});

exports.getMe = asyncHandler(async (req, res) => {
  success(res, { user: req.user });
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
