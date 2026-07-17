const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/reportScheduleController');

router.use(authenticate);

router.get('/due', ctrl.getDueSchedules);
router.get('/', ctrl.listSchedules);
router.post('/', ctrl.createSchedule);
router.delete('/:id', ctrl.deleteSchedule);

module.exports = router;
