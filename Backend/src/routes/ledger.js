const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getSummary, getWorkOrderLedger } = require('../controllers/ledgerController');

router.use(authenticate);

router.get('/summary',      authorizeOr('ledger', 'view', 'owner', 'gm', 'agm', 'accounts'), getSummary);
router.get('/:workOrderId', authorizeOr('ledger', 'view', 'owner', 'gm', 'agm', 'accounts'), getWorkOrderLedger);

module.exports = router;
