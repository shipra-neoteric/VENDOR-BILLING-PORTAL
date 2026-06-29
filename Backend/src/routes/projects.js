const router  = require('express').Router();
const { body, validationResult } = require('express-validator');
const Project  = require('../models/Project');
const { authenticate, authorize } = require('../middleware/auth');
const { nextProjectCode } = require('../utils/codeGen');

// All routes require authentication
router.use(authenticate);

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const projects = await Project.find(filter).sort({ createdAt: -1 });
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/projects
router.post(
  '/',
  authorize('owner', 'gm', 'accounts'),
  [
    body('name').notEmpty().withMessage('Project name is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const code = await nextProjectCode();
      const project = await Project.create({
        ...req.body,
        code,
        createdBy: req.user._id,
      });
      res.status(201).json({ project });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/projects/:id
router.put('/:id', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', authorize('owner'), async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
