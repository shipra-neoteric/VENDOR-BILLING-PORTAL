const { body } = require('express-validator');

const createCategoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('color').notEmpty().withMessage('Color is required'),
];

module.exports = { createCategoryRules };
