const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listDraftWorkOrders, getWorkOrderQuotationContext, listQuotationsForWorkOrder,
  submitQuotation, approveQuotation, rejectQuotation,
} = require('../controllers/contractorQuotationController');

router.use(authenticate);

router.get('/draft-work-orders', authorizeOr('quotation-comparison', 'view'), listDraftWorkOrders);
router.get('/work-order/:workOrderId/context',   authorizeOr('quotation-comparison', 'view'), getWorkOrderQuotationContext);
router.get('/work-order/:workOrderId',           authorizeOr('quotation-comparison', 'view'), listQuotationsForWorkOrder);
router.post('/work-order/:workOrderId',          authorizeOr('quotation-comparison', 'create'), submitQuotation);
router.patch('/:id/approve', authorizeOr('quotation-comparison', 'approve'), approveQuotation);
router.patch('/:id/reject',  authorizeOr('quotation-comparison', 'approve'), rejectQuotation);

module.exports = router;
