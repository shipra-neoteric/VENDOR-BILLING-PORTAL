const router = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword, listUsers, switchUser } = require('../controllers/authController');

router.post('/register', registerRules, register);
router.post('/login',    loginRules,    login);
router.get('/me',        authenticate,  getMe);
router.patch('/change-password', authenticate, changePassword);
router.get('/users', authenticate, authorizeOr('user-management', 'view', 'owner', 'gm', 'accounts'), listUsers);
router.post('/switch/:userId', authenticate, authorize('owner'), switchUser);

module.exports = router;
