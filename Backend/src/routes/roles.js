const express = require('express');
const router  = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl = require('../controllers/roleController');

// Same gate as User Management itself (see routes/users.js) — the role
// library is part of that same module, not a separate permission.
router.get('/',       authenticate, authorizeOr('user-management', 'view',   'owner', 'gm'), ctrl.listRoles);
router.get('/:id',    authenticate, authorizeOr('user-management', 'view',   'owner', 'gm'), ctrl.getRole);
router.post('/',      authenticate, authorizeOr('user-management', 'create', 'owner', 'gm'), ctrl.createRole);
router.put('/:id',    authenticate, authorizeOr('user-management', 'edit',   'owner', 'gm'), ctrl.updateRole);
router.patch('/:id/rename', authenticate, authorizeOr('user-management', 'edit', 'owner', 'gm'), ctrl.renameRole);
router.delete('/:id', authenticate, authorizeOr('user-management', 'delete', 'owner', 'gm'), ctrl.deleteRole);

module.exports = router;
