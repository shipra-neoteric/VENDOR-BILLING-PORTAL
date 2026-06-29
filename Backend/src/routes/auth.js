const router  = require('express').Router();
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const { authenticate } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, role, vendorCode } = req.body;
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    try {
      if (await User.findOne({ email })) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const user = await User.create({ name, email, password, role, vendorCode });
      const token = signToken(user._id);

      res.status(201).json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, vendorCode: user.vendorCode },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email: rawEmail, password } = req.body;
    const email = rawEmail.trim().toLowerCase();

    try {
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await user.matchPassword(password))) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      const token = signToken(user._id);

      res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, vendorCode: user.vendorCode },
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/change-password
router.patch('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both currentPassword and newPassword are required' });
  }

  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
