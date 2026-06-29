const router   = require('express').Router();
const { body, validationResult } = require('express-validator');
const Category  = require('../models/Category');
const WorkOrder = require('../models/WorkOrder');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find().sort({ name: 1 });
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/categories
router.post(
  '/',
  authorize('owner', 'gm', 'accounts'),
  [
    body('name').trim().notEmpty().withMessage('Category name is required'),
    body('color').notEmpty().withMessage('Color is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const existing = await Category.findOne({ name: { $regex: `^${req.body.name}$`, $options: 'i' } });
      if (existing) return res.status(409).json({ message: 'A category with this name already exists' });
      const cat = await Category.create({ ...req.body, createdBy: req.user._id });
      res.status(201).json({ category: cat });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// PUT /api/categories/:id
router.put('/:id', authorize('owner', 'gm', 'accounts'), async (req, res) => {
  try {
    const cat = await Category.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    res.json({ category: cat });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authorize('owner', 'gm'), async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Category not found' });
    // Check if any work orders use this category
    const inUse = await WorkOrder.exists({ category: cat.name });
    if (inUse) {
      return res.status(409).json({
        message: `Cannot delete "${cat.name}" — it is assigned to one or more work orders. Reassign them first.`,
      });
    }
    await cat.deleteOne();
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
