const router     = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const {
  listBillRequests,
  createBillRequest,
  createBatchBillRequest,
  approveBillRequest,
  rejectBillRequest,
  markMilestone,
  archiveBillRequest,
  unarchiveBillRequest,
  archiveBillRequestsBulk,
  unarchiveBillRequestsBulk,
} = require('../controllers/billRequestController');

router.use(authenticate);

router.get('/',                listBillRequests);
router.post('/batch',          authorize('site-dri', 'owner', 'gm'), createBatchBillRequest);
router.post('/',               authorize('site-dri', 'owner', 'gm'), createBillRequest);
// Stage 1 (AGM sets hold/advance and approves) — restricted to AGM/owner only.
router.put('/:id/approve',   authorizeOr('bill-requests', 'approve', 'owner', 'agm'), approveBillRequest);
router.put('/:id/reject',    authorizeOr('bill-requests', 'approve', 'owner', 'agm', 'gm', 'accounts'), rejectBillRequest);
// Stage 5 (Accounts releases payment, only once the linked bill is 'payment-initiated').
router.put('/:id/milestone', authorizeOr('bill-requests', 'approve', 'owner', 'accounts'), markMilestone);
router.patch('/archive-bulk',   authorizeOr('bill-requests', 'edit', 'owner', 'gm', 'accounts'), archiveBillRequestsBulk);
router.patch('/unarchive-bulk', authorizeOr('bill-requests', 'edit', 'owner', 'gm', 'accounts'), unarchiveBillRequestsBulk);
router.patch('/:id/archive',    authorizeOr('bill-requests', 'edit', 'owner', 'gm', 'accounts'), archiveBillRequest);
router.patch('/:id/unarchive',  authorizeOr('bill-requests', 'edit', 'owner', 'gm', 'accounts'), unarchiveBillRequest);

module.exports = router;
