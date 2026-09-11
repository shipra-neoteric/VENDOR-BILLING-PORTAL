const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/notificationController');

// No authorizeOr(module, action) gate here on purpose — every route below is
// scoped to req.user._id inside the controller itself (see
// notificationController.js), so being authenticated is the only requirement:
// there is no separate "notifications" permission to grant, and there's
// nothing to see here that isn't already the caller's own.
router.use(authenticate);

router.get('/',                  ctrl.listNotifications);
router.get('/unread-count',      ctrl.unreadCount);
router.get('/preferences',       ctrl.getPreferences);
router.patch('/preferences',     ctrl.updatePreferences);
router.patch('/mark-all-read',   ctrl.markAllRead);
router.patch('/:id/read',        ctrl.markRead);

module.exports = router;
