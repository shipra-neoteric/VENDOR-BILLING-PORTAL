const router     = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listBillRequests,
  createBillRequest,
  approveBillRequest,
  rejectBillRequest,
  markMilestone,
} = require('../controllers/billRequestController');

router.use(authenticate);

router.get('/',                listBillRequests);
router.post('/',               authorize('dri', 'owner', 'gm'), createBillRequest);
router.put('/:id/approve',     authorize('owner', 'gm', 'accounts'), approveBillRequest);
router.put('/:id/reject',      authorize('owner', 'gm', 'accounts'), rejectBillRequest);
router.put('/:id/milestone',   authorize('owner', 'gm', 'accounts'), markMilestone);

module.exports = router;
