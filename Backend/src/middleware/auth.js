const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized — no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User no longer exists' });
    if (!req.user.isActive) return res.status(403).json({ message: 'Account is deactivated' });
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized — token invalid or expired' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Role '${req.user.role}' does not have access to this action`,
    });
  }
  next();
};

// Like authorize, but also passes if the user has an explicit module+action permission grant
// (set via User Management). Allows admins to extend access to DRI/other roles per-user.
const authorizeOr = (module, action, ...roles) => (req, res, next) => {
  if (roles.includes(req.user.role)) return next();
  const perm = (req.user.permissions || []).find(p => p.module === module);
  if (perm && perm.actions.includes(action)) return next();
  return res.status(403).json({
    message: `Role '${req.user.role}' does not have access to this action`,
  });
};

module.exports = { authenticate, authorize, authorizeOr };
