const express = require('express');
const router  = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl = require('../controllers/formConfigController');

// Same 'user-management' checklist gate as Approval Rules/Users/Roles —
// owner gets it for free, anyone else only if explicitly granted.
router.get('/:formType',  authenticate, authorizeOr('user-management', 'view', 'owner'), ctrl.getFormConfig);
router.put('/:formType',  authenticate, authorizeOr('user-management', 'edit', 'owner'), ctrl.updateFormConfig);

module.exports = router;
