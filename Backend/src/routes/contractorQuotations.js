const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listDraftWorkOrders, getWorkOrderQuotationContext, listQuotationsForWorkOrder,
  submitQuotation, approveQuotation, rejectQuotation,
} = require('../controllers/contractorQuotationController');

router.use(authenticate);

router.get('/draft-work-orders', authorizeOr('quotation-comparison', 'view', 'owner', 'gm', 'agm'), listDraftWorkOrders);
router.get('/work-order/:workOrderId/context',   authorizeOr('quotation-comparison', 'view', 'owner', 'gm', 'agm'), getWorkOrderQuotationContext);
router.get('/work-order/:workOrderId',           authorizeOr('quotation-comparison', 'view', 'owner', 'gm', 'agm'), listQuotationsForWorkOrder);
router.post('/work-order/:workOrderId',          authorizeOr('quotation-comparison', 'create', 'owner', 'gm', 'agm'), submitQuotation);
router.patch('/:id/approve', authorizeOr('quotation-comparison', 'approve', 'owner', 'gm'), approveQuotation);
router.patch('/:id/reject',  authorizeOr('quotation-comparison', 'approve', 'owner', 'gm'), rejectQuotation);

module.exports = router;
