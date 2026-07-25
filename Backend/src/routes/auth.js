const router = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword, listUsers, switchUser } = require('../controllers/authController');

router.post('/register', registerRules, register);
router.post('/login',    loginRules,    login);
router.get('/me',        authenticate,  getMe);
router.patch('/change-password', authenticate, changePassword);
// Populating a "assign DRI" dropdown (Work Orders, DPR, etc.) isn't a User
// Management action — any authenticated user can see this narrow,
// site-dri-filtered list. Only an unfiltered/full user list needs real
// user-management view access.
router.get('/users', authenticate, (req, res, next) => {
  if (req.query.role === 'site-dri') return next();
  return authorizeOr('user-management', 'view', 'owner', 'gm', 'accounts')(req, res, next);
}, listUsers);
router.post('/switch/:userId', authenticate, authorize('owner'), switchUser);

module.exports = router;
