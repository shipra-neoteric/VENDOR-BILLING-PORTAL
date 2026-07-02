const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createProjectRules } = require('../validators/project.validator');
const {
  listProjects, getProject, createProject, updateProject, deleteProject,
  getProjectStats, getProjectActivity,
} = require('../controllers/projectController');

router.use(authenticate);

router.get('/',    listProjects);
// sub-resource routes BEFORE /:id to avoid Express treating 'stats' as an id
router.get('/:id/stats',    getProjectStats);
router.get('/:id/activity', getProjectActivity);
router.get('/:id', getProject);
router.post('/',   authorize('owner', 'gm', 'accounts'), createProjectRules, createProject);
router.put('/:id', authorize('owner', 'gm', 'accounts'), updateProject);
router.delete('/:id', authorize('owner'), deleteProject);

module.exports = router;
