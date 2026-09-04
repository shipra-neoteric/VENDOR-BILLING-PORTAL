const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getSummary, getWorkOrderLedger } = require('../controllers/ledgerController');

router.use(authenticate);

router.get('/summary',      authorizeOr('ledger', 'view'), getSummary);
router.get('/:workOrderId', authorizeOr('ledger', 'view'), getWorkOrderLedger);

module.exports = router;
