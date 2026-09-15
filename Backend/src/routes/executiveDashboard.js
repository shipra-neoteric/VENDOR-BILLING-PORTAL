const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getExecutiveDashboard, exportExecutiveDashboardCsv, getContractorMatrix } = require('../controllers/executiveDashboardController');

router.use(authenticate);

// Phase 1 (backend half) of the Projects Overview executive dashboard
// rebuild — gated on the same 'dashboard' module as /api/dpr (see dpr.js's
// own comment), since this is a new dashboard-only read, not a sub-resource
// of an existing page with its own broader access pattern.
// Mounted at /api/dashboard in index.js, so this is GET /api/dashboard/executive
// (mounted at the /api/dashboard prefix rather than directly at
// /api/dashboard/executive so a future Phase 2/3 endpoint, e.g. a
// stage-summary or alerts read, can be added alongside it under the same
// prefix without remounting).
router.get('/executive', authorizeOr('dashboard', 'view'), getExecutiveDashboard);
// Phase 3 — same auth gate and filter params as GET /executive, just CSV
// output for the "Export CSV" button on the Projects Overview page.
router.get('/executive/export.csv', authorizeOr('dashboard', 'view'), exportExecutiveDashboardCsv);
// Full (uncapped) contractor x category cross-tab, for the "Contractor
// Matrix" page linked off the "Contractors by Category" card above — same
// filters/gate as GET /executive.
router.get('/executive/contractor-matrix', authorizeOr('dashboard', 'view'), getContractorMatrix);

module.exports = router;
