const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createProjectRules } = require('../validators/project.validator');
const {
  listProjects, getProject, createProject, updateProject, deleteProject,
} = require('../controllers/projectController');

router.use(authenticate);

router.get('/',    listProjects);
router.get('/:id', getProject);
router.post('/',   authorize('owner', 'gm', 'accounts'), createProjectRules, createProject);
router.put('/:id', authorize('owner', 'gm', 'accounts'), updateProject);
router.delete('/:id', authorize('owner'), deleteProject);

module.exports = router;
