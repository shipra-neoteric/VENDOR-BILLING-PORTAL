const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword, listUsers } = require('../controllers/authController');

router.post('/register', registerRules, register);
router.post('/login',    loginRules,    login);
router.get('/me',        authenticate,  getMe);
router.patch('/change-password', authenticate, changePassword);
router.get('/users', authenticate, authorizeOr('user-management', 'view', 'owner', 'gm', 'accounts'), listUsers);

module.exports = router;
