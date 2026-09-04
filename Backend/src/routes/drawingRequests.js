const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  createRequest, listRequests, getRequest, updateRequest, deleteRequest,
  l1Review, l2Drawing, l3Review, l4Review, resubmitRequest,
} = require('../controllers/drawingRequestController');

router.use(authenticate);

// site-dri bypasses unconditionally — raising/tracking a ticket from the
// field is core to that role, same treatment the sidebar itself already
// gives "Drawing Requests" (always shown, never gated behind the permission
// checklist for a DRI). Any other role needs an explicit grant. GET/list is
// intentionally left ungated at the route level, matching every other
// module's routes (consultants.js, contractors.js, ...) — only mutations
// require a grant; the DRI-only-sees-their-own scoping happens inside
// listRequests/getRequest instead (role === 'site-dri' filters to submittedBy).
router.get('/',    listRequests);
router.get('/:id', getRequest);
router.post('/',   authorizeOr('drawing-requests', 'create'), createRequest);
router.put('/:id', authorizeOr('drawing-requests', 'edit'), updateRequest);
router.delete('/:id', authorizeOr('drawing-requests', 'delete'), deleteRequest);

// Review chain — L1 (GM screen) / L2 (Architect draws) / L3 (GM cross-check)
// / L4 (GM final approval). Nobody gets these by default except owner — both
// current GMs share role 'gm', so who acts at which stage is decided purely
// by which of l1-review/l2-draw/l3-review/l4-approve is ticked for them in
// User Management, not by role. Resubmit reuses the 'create' grant: raising
// a revised request is the same capability as raising the original one.
router.patch('/:id/l1-review',  authorizeOr('drawing-requests', 'l1-review'), l1Review);
router.patch('/:id/l2-drawing', authorizeOr('drawing-requests', 'l2-draw'), l2Drawing);
router.patch('/:id/l3-review',  authorizeOr('drawing-requests', 'l3-review'), l3Review);
router.patch('/:id/l4-review',  authorizeOr('drawing-requests', 'l4-approve'), l4Review);
router.patch('/:id/resubmit',   authorizeOr('drawing-requests', 'create'), resubmitRequest);

module.exports = router;
