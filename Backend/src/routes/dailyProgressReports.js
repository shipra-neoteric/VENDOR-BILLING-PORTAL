const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { createReport, listReports, getReport } = require('../controllers/dailyProgressReportController');

router.use(authenticate);

router.get('/',    listReports);
router.get('/:id', getReport);
router.post('/',   createReport);

module.exports = router;
