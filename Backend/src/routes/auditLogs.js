const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { listAuditLogs, listAuditLogModules } = require('../controllers/auditLogController');

router.use(authenticate);

router.get('/',         authorizeOr('audit-logs', 'view', 'owner'), listAuditLogs);
router.get('/modules',  authorizeOr('audit-logs', 'view', 'owner'), listAuditLogModules);

module.exports = router;
