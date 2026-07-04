const router = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const { createWorkOrderRules } = require('../validators/workOrder.validator');
const {
  listWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder,
  addScopeProgress, editProgressEntry, deleteProgressEntry,
} = require('../controllers/workOrderController');

router.use(authenticate);

router.get('/',    listWorkOrders);
router.get('/:id', getWorkOrder);
router.post('/',      authorizeOr('work-orders', 'create', 'owner', 'gm', 'accounts'), createWorkOrderRules, createWorkOrder);
router.put('/:id',    authorizeOr('work-orders', 'edit',   'owner', 'gm', 'accounts'), updateWorkOrder);
router.delete('/:id', authorizeOr('work-orders', 'delete', 'owner'), deleteWorkOrder);
router.post('/:id/scope-items/:itemId/progress',              addScopeProgress);
router.patch('/:id/scope-items/:itemId/progress/:progressId', editProgressEntry);
router.delete('/:id/scope-items/:itemId/progress/:progressId', deleteProgressEntry);

module.exports = router;
