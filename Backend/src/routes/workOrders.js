const router = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const { createWorkOrderRules } = require('../validators/workOrder.validator');
const {
  listWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder, cancelWorkOrder,
  lockWorkOrder, unlockWorkOrder,
  addScopeProgress, editProgressEntry, deleteProgressEntry,
  addSubItemProgress, editSubItemProgressEntry, deleteSubItemProgressEntry,
  approveScopeItemVariance, approveSubItemVariance,
} = require('../controllers/workOrderController');

router.use(authenticate);

router.get('/',    listWorkOrders);
router.get('/:id', getWorkOrder);
router.post('/',      authorizeOr('work-orders', 'create', 'owner', 'gm', 'accounts'), createWorkOrderRules, createWorkOrder);
router.put('/:id',    authorizeOr('work-orders', 'edit',   'owner', 'gm', 'accounts'), updateWorkOrder);
router.patch('/:id/cancel', authorizeOr('work-orders', 'edit', 'owner', 'gm', 'accounts'), cancelWorkOrder);
// Locking a deal's final rates is an Owner-only action, unlike regular edits.
router.patch('/:id/lock',   authorize('owner'), lockWorkOrder);
router.patch('/:id/unlock', authorize('owner'), unlockWorkOrder);
router.delete('/:id', authorizeOr('work-orders', 'delete', 'owner'), deleteWorkOrder);
router.post('/:id/scope-items/:itemId/progress',              addScopeProgress);
router.patch('/:id/scope-items/:itemId/progress/:progressId', editProgressEntry);
router.delete('/:id/scope-items/:itemId/progress/:progressId', deleteProgressEntry);
router.post('/:id/scope-items/:itemId/sub-items/:subItemId/progress',              addSubItemProgress);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId', editSubItemProgressEntry);
router.delete('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId', deleteSubItemProgressEntry);
router.patch('/:id/scope-items/:itemId/approve-variance', authorizeOr('bill-review', 'approve', 'owner', 'gm', 'agm'), approveScopeItemVariance);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/approve-variance', authorizeOr('bill-review', 'approve', 'owner', 'gm', 'agm'), approveSubItemVariance);

module.exports = router;
