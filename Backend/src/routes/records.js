const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/recordsController');

// Admin/owner only — same stance as /api/backup and /api/recycle-bin: managing records that were
// archived, cancelled, rejected or deleted is an administrator action, never a per-user grant.
router.use(authenticate, authorize('owner'));

router.get('/archived',                    ctrl.listArchived);
router.post('/archived/unarchive',         ctrl.unarchive);
router.get('/cancelled',                   ctrl.listCancelled);
router.post('/cancelled/:id/reactivate',   ctrl.reactivateWorkOrder);
router.get('/rejected',                    ctrl.listRejected);
router.post('/rejected/delete',            ctrl.deleteRejected);

module.exports = router;
