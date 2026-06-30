const { body } = require('express-validator');

const createProjectRules = [
  body('name').notEmpty().withMessage('Project name is required'),
];

module.exports = { createProjectRules };
