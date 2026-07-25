const router = require('express').Router();
const { authenticate, authorize, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createWorkOrderRules } = require('../validators/workOrder.validator');
const {
  listWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, deleteWorkOrder, cancelWorkOrder,
  lockWorkOrder, unlockWorkOrder,
  submitWorkOrder, checkerApprove, approverApprove, finalApprove, sendBack,
  addScopeProgress, editProgressEntry, deleteProgressEntry, invalidateProgressEntry,
  addSubItemProgress, editSubItemProgressEntry, deleteSubItemProgressEntry, invalidateSubItemProgressEntry,
  approveScopeItemVariance, approveSubItemVariance,
} = require('../controllers/workOrderController');

router.use(authenticate);

router.get('/',    listWorkOrders);
router.get('/:id', getWorkOrder);
// 'create'/'edit' are the pre-existing broad grants; 'maker' is the new,
// more specific L1 grant for the 4-level approval chain — either unlocks these.
router.post('/',      authorizeAnyOr('work-orders', ['create', 'maker'], 'owner'), createWorkOrderRules, createWorkOrder);
router.put('/:id',    authorizeAnyOr('work-orders', ['edit', 'maker'],   'owner'), updateWorkOrder);
router.patch('/:id/cancel', authorizeOr('work-orders', 'edit', 'owner', 'gm', 'accounts'), cancelWorkOrder);
// Locking a deal's final rates is an Owner-only action, unlike regular edits.
router.patch('/:id/lock',   authorize('owner'), lockWorkOrder);
router.patch('/:id/unlock', authorize('owner'), unlockWorkOrder);
router.delete('/:id', authorizeOr('work-orders', 'delete', 'owner'), deleteWorkOrder);

// ── 4-level approval workflow ──
router.patch('/:id/submit',          authorizeOr('work-orders', 'maker', 'owner'), submitWorkOrder);
router.patch('/:id/checker-approve', authorizeOr('work-orders', 'checker', 'owner'), checkerApprove);
router.patch('/:id/approver-approve', authorizeOr('work-orders', 'approver', 'owner'), approverApprove);
router.patch('/:id/final-approve',   authorizeOr('work-orders', 'ceo-approve', 'owner'), finalApprove);
router.patch('/:id/send-back',       authorizeAnyOr('work-orders', ['checker', 'approver', 'ceo-approve'], 'owner'), sendBack);
router.post('/:id/scope-items/:itemId/progress',              addScopeProgress);
router.patch('/:id/scope-items/:itemId/progress/:progressId', editProgressEntry);
router.delete('/:id/scope-items/:itemId/progress/:progressId', deleteProgressEntry);
router.patch('/:id/scope-items/:itemId/progress/:progressId/invalidate', invalidateProgressEntry);
router.post('/:id/scope-items/:itemId/sub-items/:subItemId/progress',              addSubItemProgress);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId', editSubItemProgressEntry);
router.delete('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId', deleteSubItemProgressEntry);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId/invalidate', invalidateSubItemProgressEntry);
router.patch('/:id/scope-items/:itemId/approve-variance', authorizeOr('bill-review', 'approve', 'owner', 'gm', 'agm'), approveScopeItemVariance);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/approve-variance', authorizeOr('bill-review', 'approve', 'owner', 'gm', 'agm'), approveSubItemVariance);

module.exports = router;
