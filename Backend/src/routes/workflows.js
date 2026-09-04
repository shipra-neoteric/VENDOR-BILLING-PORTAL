const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listInstances, getInstance, completeStage, getMISReport,
} = require('../controllers/workflowController');

router.use(authenticate);

router.get('/templates',     authorizeOr('sla-settings', 'view'), listTemplates);
router.post('/templates',    authorizeOr('sla-settings', 'create'), createTemplate);
router.put('/templates/:id', authorizeOr('sla-settings', 'edit'), updateTemplate);
router.delete('/templates/:id', authorizeOr('sla-settings', 'delete'), deleteTemplate);

router.get('/instances',     authorizeOr('sla-dashboard', 'view'), listInstances);
router.get('/instances/:id', authorizeOr('sla-dashboard', 'view'), getInstance);
router.patch('/instances/:id/complete-stage', completeStage); // stage-assignment check happens in the controller

router.get('/mis-report', authorizeOr('sla-dashboard', 'view'), getMISReport);

module.exports = router;
