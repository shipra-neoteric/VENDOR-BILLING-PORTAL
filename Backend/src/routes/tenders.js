const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listDraftWorkOrders, getWorkOrderTenderContext, listTendersForWorkOrder,
  submitTender, approveTender, rejectTender,
} = require('../controllers/tenderController');

router.use(authenticate);

router.get('/draft-work-orders', authorizeOr('tender-documentation', 'view'), listDraftWorkOrders);
router.get('/work-order/:workOrderId/context',   authorizeOr('tender-documentation', 'view'), getWorkOrderTenderContext);
router.get('/work-order/:workOrderId',           authorizeOr('tender-documentation', 'view'), listTendersForWorkOrder);
router.post('/work-order/:workOrderId',          authorizeOr('tender-documentation', 'create'), submitTender);
router.patch('/:id/approve', authorizeOr('tender-documentation', 'approve'), approveTender);
router.patch('/:id/reject',  authorizeOr('tender-documentation', 'approve'), rejectTender);

module.exports = router;
