const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listActivities, createActivity, updateActivity, updateProgress, deleteActivity,
} = require('../controllers/activityController');

router.use(authenticate);
router.get('/',                   listActivities);
router.post('/',                  authorize('owner', 'gm'), createActivity);
router.put('/:id',                authorize('owner', 'gm'), updateActivity);
router.patch('/:id/progress',     authorize('owner', 'gm'), updateProgress);
router.delete('/:id',             authorize('owner', 'gm'),             deleteActivity);

module.exports = router;
