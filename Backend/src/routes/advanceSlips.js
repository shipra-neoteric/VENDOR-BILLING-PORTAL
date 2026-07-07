const express    = require('express');
const router     = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl       = require('../controllers/advanceSlipController');

router.use(authenticate);

router.get('/pending', authorize('owner', 'admin'), ctrl.getPendingAdvances);
router.get('/',        authorize('owner', 'admin'), ctrl.listAdvanceSlips);
router.post('/',       authorize('owner', 'admin'), ctrl.createAdvanceSlip);
router.delete('/:id',  authorize('owner', 'admin'), ctrl.deleteAdvanceSlip);

module.exports = router;
