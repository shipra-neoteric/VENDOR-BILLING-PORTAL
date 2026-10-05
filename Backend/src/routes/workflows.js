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

// Full sla-dashboard access, OR — when the request is scoped to a single
// entityType (the SLA timeline inside a Work Order/Bill Request's own detail
// drawer passes entityId too; MyTasksDashboard's "awaiting your sign-off"
// card queries by entityType + status only, no single entityId) — whoever
// can already view that entity's own module, so a maker/checker/AGM doesn't
// need the separate SLA-dashboard grant just to see their own pending items
// or one item's own SLA timeline.
const ENTITY_VIEW_MODULE = { WorkOrder: 'work-orders', BillRequest: 'bill-requests' };
function authorizeInstanceView(req, res, next) {
  if (can(req.user, 'sla-dashboard', 'view')) return next();
  const { entityType } = req.query;
  const module = entityType && ENTITY_VIEW_MODULE[entityType];
  if (module && can(req.user, module, 'view')) return next();
  return res.status(403).json({ message: `Role '${req.user.role}' does not have access to this action` });
}

router.get('/instances',     authorizeInstanceView, listInstances);
router.get('/instances/:id', authorizeOr('sla-dashboard', 'view'), getInstance);
router.patch('/instances/:id/complete-stage', completeStage); // stage-assignment check happens in the controller

router.get('/mis-report', authorizeOr('sla-dashboard', 'view'), getMISReport);

module.exports = router;
