const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getDriHome } = require('../controllers/driHomeController');

router.use(authenticate);

// A personal dashboard, not a module with grantable actions — owner can still
// load it (support/preview), but it's meaningless for any other role since
// every figure on it is scoped to req.user._id.
router.get('/', authorize('site-dri', 'owner'), getDriHome);

module.exports = router;
