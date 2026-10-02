const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { listAuditLogs, listAuditLogSummary, listAuditLogUsers } = require('../controllers/auditLogController');

router.use(authenticate);

router.get('/',         authorizeOr('audit-logs', 'view'), listAuditLogs);
router.get('/users',    authorizeOr('audit-logs', 'view'), listAuditLogUsers);
router.get('/summary',  authorizeOr('audit-logs', 'view'), listAuditLogSummary);

module.exports = router;
