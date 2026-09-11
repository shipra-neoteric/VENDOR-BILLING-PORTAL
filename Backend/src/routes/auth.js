const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword, listUsers, switchUser } = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 login attempts per 15 min window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes.',
  },
});

router.post('/register', registerRules, register);
router.post('/login',    loginLimiter, loginRules, login);
router.get('/me',        authenticate,  getMe);
router.patch('/change-password', authenticate, changePassword);
// Read-only staff directory (name/email/role/isActive — no passwords) used
// all over the app for name lookups and assignment dropdowns: resolving
// maker/checker/approver names on the Work Order timeline, the "assign DRI"
// picker, SLA stage assignees, etc. None of that is a User Management action,
// so it's open to any authenticated user. Actually managing accounts
// (create/edit/delete/reset-password) is a separate, real permission —
// see /api/users, gated by the user-management checklist.
router.get('/users', authenticate, listUsers);
router.post('/switch/:userId', authenticate, authorize('owner'), switchUser);

module.exports = router;
