const express    = require('express');
const router     = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl       = require('../controllers/advanceSlipController');

router.use(authenticate);

router.get('/pending', authorizeOr('advance-payments', 'view',   'owner'), ctrl.getPendingAdvances);
router.get('/',        authorizeOr('advance-payments', 'view',   'owner'), ctrl.listAdvanceSlips);
router.post('/',       authorizeOr('advance-payments', 'create', 'owner'), ctrl.createAdvanceSlip);
router.delete('/:id',  authorizeOr('advance-payments', 'delete', 'owner'), ctrl.deleteAdvanceSlip);
router.patch('/archive-bulk',   authorizeOr('advance-payments', 'edit', 'owner'), ctrl.archiveAdvanceSlipsBulk);
router.patch('/unarchive-bulk', authorizeOr('advance-payments', 'edit', 'owner'), ctrl.unarchiveAdvanceSlipsBulk);
router.patch('/:id/archive',    authorizeOr('advance-payments', 'edit', 'owner'), ctrl.archiveAdvanceSlip);
router.patch('/:id/unarchive',  authorizeOr('advance-payments', 'edit', 'owner'), ctrl.unarchiveAdvanceSlip);

module.exports = router;
