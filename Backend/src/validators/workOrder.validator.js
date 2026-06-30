const { body } = require('express-validator');

const createWorkOrderRules = [
  body('projectId').notEmpty().withMessage('Project is required'),
  body('vendorCode').notEmpty().withMessage('Vendor code is required'),
  body('issueDate').isISO8601().withMessage('Valid issue date is required'),
];

module.exports = { createWorkOrderRules };
