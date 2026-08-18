const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { exportBackup, importBackup } = require('../controllers/backupController');

router.use(authenticate);

// Owner-only, no authorizeOr escape hatch — this is a whole-database
// export/wipe-and-replace, not something to ever extend to another role via
// the per-user permission system (same pattern as auth.js's /switch and
// workOrders.js's lock/unlock).
router.get('/export', authorize('owner'), exportBackup);
router.post(
  '/import',
  authorize('owner'),
  // Raw .zip bytes, not multipart — scoped to just this route so every other
  // route on the app keeps using express.json() as normal.
  express.raw({ type: 'application/zip', limit: '1gb' }),
  importBackup
);

module.exports = router;
