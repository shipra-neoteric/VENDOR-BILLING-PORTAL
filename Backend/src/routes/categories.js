const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createCategoryRules } = require('../validators/category.validator');
const {
  listCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/categoryController');

router.use(authenticate);

router.get('/',     listCategories);
router.post('/',      authorizeOr('categories', 'create'), createCategoryRules, createCategory);
router.put('/:id',    authorizeOr('categories', 'edit'), updateCategory);
router.delete('/:id', authorizeOr('categories', 'delete'), deleteCategory);

module.exports = router;
