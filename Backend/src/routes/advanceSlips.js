const express    = require('express');
const router     = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl       = require('../controllers/advanceSlipController');

router.use(authenticate);

router.get('/pending', authorize('owner', 'admin'), ctrl.getPendingAdvances);
router.get('/',        authorize('owner', 'admin'), ctrl.listAdvanceSlips);
router.post('/',       authorize('owner', 'admin'), ctrl.createAdvanceSlip);
router.delete('/:id',  authorize('owner', 'admin'), ctrl.deleteAdvanceSlip);
router.patch('/archive-bulk',   authorize('owner', 'admin'), ctrl.archiveAdvanceSlipsBulk);
router.patch('/unarchive-bulk', authorize('owner', 'admin'), ctrl.unarchiveAdvanceSlipsBulk);
router.patch('/:id/archive',    authorize('owner', 'admin'), ctrl.archiveAdvanceSlip);
router.patch('/:id/unarchive',  authorize('owner', 'admin'), ctrl.unarchiveAdvanceSlip);

module.exports = router;
