const express = require('express');
const router  = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl = require('../controllers/approvalRuleController');

// Same 'user-management' checklist gate as Users/Roles — owner/gm get it for
// free, anyone else only if explicitly granted (see routes/users.js's own note).
router.get('/',              authenticate, authorizeOr('user-management', 'view'), ctrl.listApprovalRules);
router.put('/:department',   authenticate, authorizeOr('user-management', 'edit'), ctrl.upsertApprovalRule);

module.exports = router;
