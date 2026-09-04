const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { listAuditLogs, listAuditLogSummary } = require('../controllers/auditLogController');

router.use(authenticate);

router.get('/',         authorizeOr('audit-logs', 'view'), listAuditLogs);
router.get('/summary',  authorizeOr('audit-logs', 'view'), listAuditLogSummary);

module.exports = router;
