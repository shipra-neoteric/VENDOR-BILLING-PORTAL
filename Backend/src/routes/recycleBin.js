const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/recycleBinController');

// Owner-only, no authorizeOr escape hatch — same stance as /api/backup: bringing
// deleted records back is an administrator action, not a per-user permission.
router.use(authenticate, authorize('owner'));

router.get('/',              ctrl.list);
router.get('/:id',           ctrl.getOne);
router.post('/:id/restore',  ctrl.restore);

module.exports = router;
