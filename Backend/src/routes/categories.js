const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createCategoryRules } = require('../validators/category.validator');
const {
  listCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/categoryController');

router.use(authenticate);

router.get('/',     listCategories);
router.post('/',    authorize('owner', 'gm', 'accounts'), createCategoryRules, createCategory);
router.put('/:id',  authorize('owner', 'gm', 'accounts'), updateCategory);
router.delete('/:id', authorize('owner', 'gm'), deleteCategory);

module.exports = router;
