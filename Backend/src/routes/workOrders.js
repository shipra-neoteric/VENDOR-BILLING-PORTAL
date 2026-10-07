const router = require('express').Router();
const { authenticate, authorize, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createWorkOrderRules } = require('../validators/workOrder.validator');
const {
  listWorkOrders, getWorkOrder, getWorkOrdersBulkDetail, getWorkOrderRetentionHeld, createWorkOrder, updateWorkOrder, deleteWorkOrder, cancelWorkOrder,
  lockWorkOrder, unlockWorkOrder,
  submitWorkOrder, checkerApprove, approverApprove, finalApprove, sendBack,
  addScopeProgress, editProgressEntry, deleteProgressEntry, invalidateProgressEntry,
  addSubItemProgress, editSubItemProgressEntry, deleteSubItemProgressEntry, invalidateSubItemProgressEntry,
  approveScopeItemVariance, approveSubItemVariance,
} = require('../controllers/workOrderController');

router.use(authenticate);

router.get('/',            listWorkOrders);
// Must come before '/:id' — otherwise Express would match "bulk-detail" as
// an :id value and this route would never be reached.
router.get('/bulk-detail', getWorkOrdersBulkDetail);
router.get('/:id',         getWorkOrder);
router.get('/:id/retention-held', getWorkOrderRetentionHeld);
// 'create'/'edit' are the pre-existing broad grants; 'maker' is the new,
// more specific L1 grant for the 4-level approval chain — either unlocks these.
router.post('/',      authorizeAnyOr('work-orders', ['create', 'maker']), createWorkOrderRules, createWorkOrder);
router.put('/:id',    authorizeAnyOr('work-orders', ['edit', 'maker']), updateWorkOrder);
router.patch('/:id/cancel', authorizeOr('work-orders', 'edit'), cancelWorkOrder);
// Locking a deal's final rates is an Owner-only action, unlike regular edits.
router.patch('/:id/lock',   authorize('owner'), lockWorkOrder);
router.patch('/:id/unlock', authorize('owner'), unlockWorkOrder);
router.delete('/:id', authorizeOr('work-orders', 'delete'), deleteWorkOrder);

// ── 4-level approval workflow ──
router.patch('/:id/submit',          authorizeOr('work-orders', 'maker'), submitWorkOrder);
// CEO bypasses every stage's own permission gate here (same convention as
// 'owner' elsewhere) — CEO's own permission grant only ever covers
// 'ceo-approve' (the final stage), so without this explicit bypass he'd be
// wrongly blocked acting at an earlier stage (checker/approver) on a work
// order that hasn't reached 'pending-final' yet.
router.patch('/:id/checker-approve', authorizeOr('work-orders', 'checker', 'CEO'), checkerApprove);
router.patch('/:id/approver-approve', authorizeOr('work-orders', 'approver', 'CEO'), approverApprove);
router.patch('/:id/final-approve',   authorizeOr('work-orders', 'ceo-approve', 'CEO'), finalApprove);
router.patch('/:id/send-back',       authorizeAnyOr('work-orders', ['checker', 'approver', 'ceo-approve'], 'CEO'), sendBack);
// site-dri is hardcoded here (unlike most other modules) because logging
// progress is that role's actual job — none of today's real DRI accounts have
// 'work-progress' ticked in their checklist, so gating this on the checklist
// alone would lock out every DRI. Anyone else needs the explicit grant.
router.post('/:id/scope-items/:itemId/progress',
  authorizeOr('work-progress', 'create'), addScopeProgress);
router.patch('/:id/scope-items/:itemId/progress/:progressId',
  authorizeOr('work-progress', 'edit'), editProgressEntry);
router.delete('/:id/scope-items/:itemId/progress/:progressId',
  authorizeOr('work-progress', 'delete'), deleteProgressEntry);
router.patch('/:id/scope-items/:itemId/progress/:progressId/invalidate',
  authorizeOr('work-progress', 'edit'), invalidateProgressEntry);
router.post('/:id/scope-items/:itemId/sub-items/:subItemId/progress',
  authorizeOr('work-progress', 'create'), addSubItemProgress);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId',
  authorizeOr('work-progress', 'edit'), editSubItemProgressEntry);
router.delete('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId',
  authorizeOr('work-progress', 'delete'), deleteSubItemProgressEntry);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/progress/:progressId/invalidate',
  authorizeOr('work-progress', 'edit'), invalidateSubItemProgressEntry);
router.patch('/:id/scope-items/:itemId/approve-variance', authorizeOr('bill-review', 'approve'), approveScopeItemVariance);
router.patch('/:id/scope-items/:itemId/sub-items/:subItemId/approve-variance', authorizeOr('bill-review', 'approve'), approveSubItemVariance);

module.exports = router;
