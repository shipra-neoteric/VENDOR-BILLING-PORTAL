const { validationResult } = require('express-validator');
const Category     = require('../models/Category');
const WorkOrder    = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');

exports.listCategories = asyncHandler(async (req, res) => {
  const cats = await Category.find().sort({ name: 1 });
  success(res, { categories: cats });
});

exports.createCategory = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const existing = await Category.findOne({
    name: { $regex: `^${req.body.name}$`, $options: 'i' },
  });
  if (existing) return conflict(res, 'A category with this name already exists');

  const cat = await Category.create({ ...req.body, createdBy: req.user._id });
  created(res, { category: cat }, 'Category created successfully');
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!cat) return notFound(res, 'Category not found');
  success(res, { category: cat }, 'Category updated successfully');
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) return notFound(res, 'Category not found');

  const inUse = await WorkOrder.exists({ category: cat.name });
  if (inUse) {
    return conflict(
      res,
      `Cannot delete "${cat.name}" — it is assigned to one or more work orders. Reassign them first.`
    );
  }

  await cat.deleteOne();
  success(res, null, 'Category deleted');
});
