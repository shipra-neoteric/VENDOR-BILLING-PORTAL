const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getUserMis } = require('../controllers/userMisController');

router.use(authenticate);
// Feeds the user table on the MIS Report page, so it follows the MIS Report permission.
router.get('/', authorizeOr('mis-report', 'view', 'owner'), getUserMis);

module.exports = router;
