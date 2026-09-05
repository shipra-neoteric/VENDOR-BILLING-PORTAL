const router = require('express').Router();
const { authenticate, authorizeOr, can } = require('../middleware/auth');
const {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listInstances, getInstance, completeStage, getMISReport,
} = require('../controllers/workflowController');

router.use(authenticate);

router.get('/templates',     authorizeOr('sla-settings', 'view'), listTemplates);
router.post('/templates',    authorizeOr('sla-settings', 'create'), createTemplate);
router.put('/templates/:id', authorizeOr('sla-settings', 'edit'), updateTemplate);
router.delete('/templates/:id', authorizeOr('sla-settings', 'delete'), deleteTemplate);

// Full sla-dashboard access, OR — when the request is scoped to one specific
// entity via entityType+entityId (the SLA timeline shown inside a Work
// Order/Bill Request's own detail drawer) — whoever can already view that
// entity's own module, so a maker/checker/AGM doesn't need the separate
// SLA-dashboard grant just to see that one item's own SLA timeline.
const ENTITY_VIEW_MODULE = { WorkOrder: 'work-orders', BillRequest: 'bill-requests' };
function authorizeInstanceView(req, res, next) {
  if (can(req.user, 'sla-dashboard', 'view')) return next();
  const { entityType, entityId } = req.query;
  const module = entityType && entityId && ENTITY_VIEW_MODULE[entityType];
  if (module && can(req.user, module, 'view')) return next();
  return res.status(403).json({ message: `Role '${req.user.role}' does not have access to this action` });
}

router.get('/instances',     authorizeInstanceView, listInstances);
router.get('/instances/:id', authorizeOr('sla-dashboard', 'view'), getInstance);
router.patch('/instances/:id/complete-stage', completeStage); // stage-assignment check happens in the controller

router.get('/mis-report', authorizeOr('sla-dashboard', 'view'), getMISReport);

module.exports = router;
