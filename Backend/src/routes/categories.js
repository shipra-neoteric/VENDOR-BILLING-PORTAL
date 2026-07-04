const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createCategoryRules } = require('../validators/category.validator');
const {
  listCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/categoryController');

router.use(authenticate);

router.get('/',     listCategories);
router.post('/',      authorizeOr('categories', 'create', 'owner', 'gm', 'accounts'), createCategoryRules, createCategory);
router.put('/:id',    authorizeOr('categories', 'edit',   'owner', 'gm', 'accounts'), updateCategory);
router.delete('/:id', authorizeOr('categories', 'delete', 'owner', 'gm'), deleteCategory);

module.exports = router;
