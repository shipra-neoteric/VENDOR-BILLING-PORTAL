const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getUserMis } = require('../controllers/userMisController');

router.use(authenticate);
router.get('/', authorizeOr('user-mis', 'view', 'owner'), getUserMis);

module.exports = router;
