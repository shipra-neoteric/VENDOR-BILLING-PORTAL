const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { registerRules, loginRules } = require('../validators/auth.validator');
const { register, login, getMe, changePassword } = require('../controllers/authController');

router.post('/register', registerRules, register);
router.post('/login',    loginRules,    login);
router.get('/me',        authenticate,  getMe);
router.patch('/change-password', authenticate, changePassword);

module.exports = router;
