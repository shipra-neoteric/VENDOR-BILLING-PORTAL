const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getSummary, getWorkOrderLedger } = require('../controllers/ledgerController');

router.use(authenticate);

router.get('/summary',        getSummary);
router.get('/:workOrderId',   getWorkOrderLedger);

module.exports = router;
