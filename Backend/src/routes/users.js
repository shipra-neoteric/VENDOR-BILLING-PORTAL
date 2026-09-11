const express = require('express');
const router  = express.Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const ctrl = require('../controllers/userController');

// User Management is a checklist module like any other (see UserManagement's
// MODULE_DEFS on the frontend) — owner/gm get it for free, anyone else only
// if the Owner explicitly ticks the box for them. Previously hardcoded to
// owner/gm only with no checklist fallback at all, so granting e.g. "User
// Management: Create" to another role silently did nothing.
// Allows users to change their own password, or admins with user-management edit permission to reset others' passwords
const authorizePasswordChange = (req, res, next) => {
  if (req.user && req.params.id && req.user._id.toString() === req.params.id) {
    return next();
  }
  return authorizeOr('user-management', 'edit')(req, res, next);
};

router.get('/',               authenticate, authorizeOr('user-management', 'view'), ctrl.listUsers);
router.get('/:id',            authenticate, authorizeOr('user-management', 'view'), ctrl.getUser);
router.post('/',              authenticate, authorizeOr('user-management', 'create'), ctrl.createUser);
router.put('/:id',            authenticate, authorizeOr('user-management', 'edit'), ctrl.updateUser);
router.patch('/:id/password', authenticate, authorizePasswordChange, ctrl.changePassword);
router.delete('/:id',         authenticate, authorizeOr('user-management', 'delete'), ctrl.deleteUser);

module.exports = router;
