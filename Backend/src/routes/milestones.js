const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listMilestones, createMilestone, updateMilestone, deleteMilestone,
  linkActivity, unlinkActivity,
} = require('../controllers/milestoneController');

router.use(authenticate);
router.get('/',    listMilestones);
router.post('/',   authorize('owner', 'gm'), createMilestone);
router.put('/:id', authorize('owner', 'gm'), updateMilestone);
router.delete('/:id',                        authorize('owner', 'gm'), deleteMilestone);
router.post('/:id/activities',               authorize('owner', 'gm'), linkActivity);
router.delete('/:id/activities/:actId',      authorize('owner', 'gm'),             unlinkActivity);

module.exports = router;
