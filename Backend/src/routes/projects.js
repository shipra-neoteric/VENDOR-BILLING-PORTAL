const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createProjectRules } = require('../validators/project.validator');
const {
  listProjects, getProject, createProject, updateProject, deleteProject,
  getProjectStats, getProjectActivity, getAllProjectsActivity,
} = require('../controllers/projectController');

router.use(authenticate);

// listProjects/getProject deliberately stay open to every authenticated user
// (see sanitizeProject's comment in projectController.js) — no permission
// gate added here on purpose.
router.get('/',    listProjects);
// sub-resource routes BEFORE /:id to avoid Express treating 'stats'/'activity' as an id
router.get('/activity',     authorizeOr('bill-review', 'view'), getAllProjectsActivity);
// Financial stats are sensitive enough to gate, unlike the plain project doc
// above — but gated on 'projects' (not 'dashboard'): the Projects page (the
// only caller — Frontend/src/pages/Projects/index.tsx) is reached via the
// sidebar's "Projects" entry, which itself requires the 'projects' module
// (Frontend/src/layouts/Sidebar/Sidebar.tsx), not 'dashboard'. Gating this on
// 'dashboard' instead would 403 any role (e.g. a custom role, or a DRI
// granted 'projects' explicitly) that can see the Projects page today but
// was never granted 'dashboard'.
router.get('/:id/stats',    authorizeOr('projects', 'view'), getProjectStats);
router.get('/:id/activity', getProjectActivity);
router.get('/:id', getProject);
router.post('/',      authorizeOr('projects', 'create'), createProjectRules, createProject);
router.put('/:id',    authorizeOr('projects', 'edit'), updateProject);
router.delete('/:id', authorizeOr('projects', 'delete'), deleteProject);

module.exports = router;
