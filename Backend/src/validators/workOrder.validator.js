const { body } = require('express-validator');

const createWorkOrderRules = [
  body('projectId').notEmpty().withMessage('Project is required'),
  // Optional — "No vendor yet" (WorkItems/index.tsx) creates a WO with no
  // vendor at all, filled in later via Quotation Comparison's approveQuotation.
  body('issueDate').isISO8601().withMessage('Valid issue date is required'),
  body('scopeOfWork').trim().notEmpty().withMessage('Overall Description / Scope of Work is required'),
];

module.exports = { createWorkOrderRules };
