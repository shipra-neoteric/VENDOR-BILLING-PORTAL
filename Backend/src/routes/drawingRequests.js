const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  createRequest, listRequests, getRequest, updateRequest, deleteRequest,
  agmReview, gmReview, resubmitRequest,
} = require('../controllers/drawingRequestController');

router.use(authenticate);

// site-dri bypasses unconditionally — raising/tracking a ticket from the
// field is core to that role, same treatment the sidebar itself already
// gives "Drawing Requests" (always shown, never gated behind the permission
// checklist for a DRI). Any other role needs an explicit grant. GET/list is
// intentionally left ungated, matching every other module's routes
// (consultants.js, contractors.js, ...) — only mutations require a grant.
router.get('/',    listRequests);
router.get('/:id', getRequest);
router.post('/',   authorizeOr('drawing-requests', 'create', 'owner', 'gm', 'agm', 'site-dri'), createRequest);
router.put('/:id', authorizeOr('drawing-requests', 'edit',   'owner', 'gm', 'agm', 'site-dri'), updateRequest);
router.delete('/:id', authorizeOr('drawing-requests', 'delete', 'owner', 'gm', 'agm'), deleteRequest);

// Review chain — AGM then GM. Resubmit reuses the 'create' grant: raising a
// revised request is the same capability as raising the original one.
router.patch('/:id/agm-review', authorizeOr('drawing-requests', 'agm-approve', 'owner', 'agm'), agmReview);
router.patch('/:id/gm-review',  authorizeOr('drawing-requests', 'gm-approve',  'owner', 'gm'), gmReview);
router.patch('/:id/resubmit',   authorizeOr('drawing-requests', 'create', 'owner', 'gm', 'agm', 'site-dri'), resubmitRequest);

module.exports = router;
