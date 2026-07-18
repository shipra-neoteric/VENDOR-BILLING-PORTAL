const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listInstances, getInstance, completeStage, getMISReport,
} = require('../controllers/workflowController');

router.use(authenticate);

router.get('/templates',     authorizeOr('sla-settings', 'view', 'owner', 'gm'), listTemplates);
router.post('/templates',    authorizeOr('sla-settings', 'create', 'owner', 'gm'), createTemplate);
router.put('/templates/:id', authorizeOr('sla-settings', 'edit', 'owner', 'gm'), updateTemplate);
router.delete('/templates/:id', authorizeOr('sla-settings', 'delete', 'owner', 'gm'), deleteTemplate);

router.get('/instances',     authorizeOr('sla-dashboard', 'view', 'owner', 'gm', 'agm', 'accounts', 'site-dri'), listInstances);
router.get('/instances/:id', authorizeOr('sla-dashboard', 'view', 'owner', 'gm', 'agm', 'accounts', 'site-dri'), getInstance);
router.patch('/instances/:id/complete-stage', completeStage); // stage-assignment check happens in the controller

router.get('/mis-report', authorizeOr('sla-dashboard', 'view', 'owner', 'gm', 'agm', 'accounts', 'site-dri'), getMISReport);

module.exports = router;
