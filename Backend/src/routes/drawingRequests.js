const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  createRequest, listRequests, getRequest, updateRequest, deleteRequest,
} = require('../controllers/drawingRequestController');

router.use(authenticate);

// site-dri bypasses unconditionally — raising/tracking a ticket from the
// field is core to that role, same treatment the sidebar itself already
// gives "Drawing Requests" (always shown, never gated behind the permission
// checklist for a DRI). Any other role needs an explicit grant.
router.get('/',    listRequests);
router.get('/:id', getRequest);
router.post('/',   authorizeOr('drawing-requests', 'create', 'owner', 'gm', 'agm', 'site-dri'), createRequest);
router.put('/:id', authorizeOr('drawing-requests', 'edit',   'owner', 'gm', 'agm', 'site-dri'), updateRequest);
router.delete('/:id', authorizeOr('drawing-requests', 'delete', 'owner', 'gm', 'agm'), deleteRequest);

module.exports = router;
