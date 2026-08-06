const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createReport, listReports, getReport } = require('../controllers/dailyProgressReportController');

router.use(authenticate);

router.get('/',    listReports);
router.get('/:id', getReport);
// site-dri bypasses unconditionally — submitting today's report is core to
// that role, same treatment the sidebar itself already gives "Daily
// Progress Report" (always shown, never gated behind the permission
// checklist for a DRI). Any other role needs an explicit grant.
router.post('/',   authorizeOr('daily-progress-report', 'create', 'owner', 'gm', 'agm', 'site-dri'), createReport);

module.exports = router;
