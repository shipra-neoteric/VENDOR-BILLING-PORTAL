const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createProjectRules } = require('../validators/project.validator');
const {
  listProjects, getProject, createProject, updateProject, deleteProject,
  getProjectStats, getProjectActivity, getAllProjectsActivity,
} = require('../controllers/projectController');

router.use(authenticate);

router.get('/',    listProjects);
// sub-resource routes BEFORE /:id to avoid Express treating 'stats'/'activity' as an id
router.get('/activity',     authorizeOr('bill-review', 'view', 'owner', 'gm', 'agm'), getAllProjectsActivity);
router.get('/:id/stats',    getProjectStats);
router.get('/:id/activity', getProjectActivity);
router.get('/:id', getProject);
router.post('/',      authorizeOr('projects', 'create', 'owner', 'gm', 'accounts'), createProjectRules, createProject);
router.put('/:id',    authorizeOr('projects', 'edit',   'owner', 'gm', 'accounts'), updateProject);
router.delete('/:id', authorizeOr('projects', 'delete', 'owner'), deleteProject);

module.exports = router;
