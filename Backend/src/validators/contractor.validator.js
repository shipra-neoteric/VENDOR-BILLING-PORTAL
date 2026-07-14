const { body } = require('express-validator');

const createContractorRules = [
  body('companyName').notEmpty().withMessage('Company name is required'),
  body('ownerName').notEmpty().withMessage('Owner name is required'),
  body('mobile').notEmpty().withMessage('Mobile is required'),
];

module.exports = { createContractorRules };
