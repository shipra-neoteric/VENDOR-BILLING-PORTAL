const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getDPR } = require('../controllers/dprController');

router.use(authenticate);

// Only ever called by the Dashboard page's useDPRData hook (Frontend/src/
// features/dashboard/hooks/useDPRData.ts) — that page's own sidebar entry
// (and the /dashboard route's Owner/process-coordinator branch — GM/AGM get
// MyTasksDashboard, accounts gets AccountsPayment instead, neither call this)
// is already gated behind the 'dashboard' module, so enforcing it here just
// matches what the UI already implies rather than restricting anyone new.
router.get('/', authorizeOr('dashboard', 'view'), getDPR);

module.exports = router;
