const express    = require('express');
const router     = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl       = require('../controllers/advanceSlipController');

router.use(authenticate);

router.get('/pending', authorizeOr('advance-payments', 'view'), ctrl.getPendingAdvances);
router.get('/',        authorizeOr('advance-payments', 'view'), ctrl.listAdvanceSlips);
router.post('/',       authorizeOr('advance-payments', 'create'), ctrl.createAdvanceSlip);
router.delete('/:id',  authorizeOr('advance-payments', 'delete'), ctrl.deleteAdvanceSlip);
router.patch('/archive-bulk',   authorizeOr('advance-payments', 'edit'), ctrl.archiveAdvanceSlipsBulk);
router.patch('/unarchive-bulk', authorizeOr('advance-payments', 'edit'), ctrl.unarchiveAdvanceSlipsBulk);
router.patch('/:id/archive',    authorizeOr('advance-payments', 'edit'), ctrl.archiveAdvanceSlip);
router.patch('/:id/unarchive',  authorizeOr('advance-payments', 'edit'), ctrl.unarchiveAdvanceSlip);

module.exports = router;
