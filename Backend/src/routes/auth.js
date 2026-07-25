const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword, listUsers, switchUser } = require('../controllers/authController');

router.post('/register', registerRules, register);
router.post('/login',    loginRules,    login);
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
