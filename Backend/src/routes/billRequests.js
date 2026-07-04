const router     = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const {
  listBillRequests,
  createBillRequest,
  createBatchBillRequest,
  approveBillRequest,
  rejectBillRequest,
  markMilestone,
} = require('../controllers/billRequestController');

router.use(authenticate);

router.get('/',                listBillRequests);
router.post('/batch',          authorize('dri', 'owner', 'gm'), createBatchBillRequest);
router.post('/',               authorize('dri', 'owner', 'gm'), createBillRequest);
router.put('/:id/approve',   authorizeOr('bill-requests', 'approve', 'owner', 'gm', 'accounts'), approveBillRequest);
router.put('/:id/reject',    authorizeOr('bill-requests', 'approve', 'owner', 'gm', 'accounts'), rejectBillRequest);
router.put('/:id/milestone', authorizeOr('bill-requests', 'approve', 'owner', 'gm', 'accounts'), markMilestone);

module.exports = router;
