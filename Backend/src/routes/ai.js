const router = require('express').Router();
const { authenticate, authorizeAnyOr } = require('../middleware/auth');
const { extractWorkOrderDocument } = require('../controllers/aiController');

router.use(authenticate);

// Same gate as creating a work order — extraction only matters to whoever
// can actually act on the result.
router.post('/extract-work-order', authorizeAnyOr('work-orders', ['create', 'maker'], 'owner'), extractWorkOrderDocument);

module.exports = router;
