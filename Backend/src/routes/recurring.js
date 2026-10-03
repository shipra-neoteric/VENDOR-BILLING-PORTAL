const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listRecurringSchedules, createRecurringSchedule, toggleRecurringSchedule,
  deleteRecurringSchedule, runDueSchedules,
} = require('../controllers/recurringController');

// No session exists when the external cron fires this — mounted before
// router.use(authenticate) below, same pattern as backup.js's own
// /scheduled route, protected by the same shared secret instead of a JWT.
router.get('/run-due', runDueSchedules);

router.use(authenticate);

router.get('/',           authorizeOr('recurring-billing', 'view', 'owner'), listRecurringSchedules);
router.post('/',          authorizeOr('recurring-billing', 'create', 'owner'), createRecurringSchedule);
router.patch('/:id/toggle', authorizeOr('recurring-billing', 'edit', 'owner'), toggleRecurringSchedule);
router.delete('/:id',     authorizeOr('recurring-billing', 'delete', 'owner'), deleteRecurringSchedule);

module.exports = router;
