const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');

// In-memory cache for the Role lookup below — this ran on EVERY single
// authenticated request (every page load fires several), and this app's
// Render region sits far enough from its MongoDB Atlas cluster that one
// round trip alone measured ~500-600ms in production (confirmed directly:
// a no-DB health check responded in ~340ms, any DB-touching endpoint took
// 550-990ms). A single approval action chains 5-6 sequential DB calls on
// top of this one, so trimming this one query off every request is a real,
// broad win. A role's permission set changes rarely (an admin edit via
// User Management), so a short TTL is an acceptable staleness window —
// same "best-effort, bounded staleness" tradeoff this codebase already
// makes elsewhere (e.g. notifications/Slack are fire-and-forget) — worst
// case, a just-edited role's new permissions take up to ROLE_CACHE_TTL_MS
// to reach a user's very next already-logged-in request.
const ROLE_CACHE_TTL_MS = 30000;
const roleCache = new Map(); // roleName -> { role, expiresAt }

async function getCachedRole(roleName) {
  const cached = roleCache.get(roleName);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  const role = await Role.findOne({ name: roleName }).select('permissions').lean();
  roleCache.set(roleName, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

// Merges a role's library permissions (Backend/src/models/Role.js) into a
// user's own permissions array — union per module, so a permission granted
// either on the Role or directly on the User is honored either way. This is
// what actually makes the Roles-tab UI's "Manage Permissions" page live:
// access everywhere in the app is now decided purely by this merged
// permissions array (no hardcoded owner/gm/agm/etc. role-name bypasses
// remain in authorizeOr/authorizeAnyOr call sites), so editing a role here
// genuinely changes what everyone on it can do.
async function mergeRolePermissions(user) {
  const role = await getCachedRole(user.role);
  if (!role || !role.permissions?.length) return user;

  const merged = new Map((user.permissions || []).map(p => [p.module, new Set(p.actions)]));
  for (const { module, actions } of role.permissions) {
    const set = merged.get(module) || new Set();
    for (const a of actions) set.add(a);
    merged.set(module, set);
  }
  user.permissions = [...merged.entries()].map(([module, actions]) => ({ module, actions: [...actions] }));
  return user;
}

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
    await mergeRolePermissions(req.user);
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

// Core permission check shared by authorizeOr/authorizeAnyOr and by anything
// (e.g. the Slack interaction handler) that needs to ask "can this user do X"
// outside of an Express middleware chain.
const can = (user, module, action, ...roles) => {
  if (roles.includes(user.role)) return true;
  const perm = (user.permissions || []).find(p => p.module === module);
  return !!(perm && perm.actions.includes(action));
};

// Like authorize, but also passes if the user has an explicit module+action permission grant
// (set via User Management). Allows admins to extend access to DRI/other roles per-user.
const authorizeOr = (module, action, ...roles) => (req, res, next) => {
  if (can(req.user, module, action, ...roles)) return next();
  return res.status(403).json({
    message: `Role '${req.user.role}' does not have access to this action`,
  });
};

// Like authorizeOr, but passes if the user holds ANY of the listed actions on the
// module — for gates like "reject" where whoever's turn it currently is (maker,
// checker, approver, or release) should be allowed, not just one specific action.
const authorizeAnyOr = (module, actions, ...roles) => (req, res, next) => {
  if (roles.includes(req.user.role)) return next();
  const perm = (req.user.permissions || []).find(p => p.module === module);
  if (perm && actions.some(a => perm.actions.includes(a))) return next();
  return res.status(403).json({
    message: `Role '${req.user.role}' does not have access to this action`,
  });
};

module.exports = { authenticate, authorize, authorizeOr, authorizeAnyOr, can, mergeRolePermissions };
