const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { getMisPerformance, exportMisPerformanceXlsx } = require('../controllers/misPerformanceController');

router.use(authenticate);
// MIS Dashboard + MIS Report (planned vs actual), under the MIS Report permission.
router.get('/', authorizeOr('mis-report', 'view', 'owner'), getMisPerformance);
router.get('/export.xlsx', authorizeOr('mis-report', 'view', 'owner'), exportMisPerformanceXlsx);

module.exports = router;
