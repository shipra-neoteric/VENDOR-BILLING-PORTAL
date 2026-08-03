const { body } = require('express-validator');

const createConsultantRules = [
  body('firmName').notEmpty().withMessage('Firm / consultant name is required'),
  body('principalName').notEmpty().withMessage('Principal consultant name is required'),
  body('mobile').notEmpty().withMessage('Mobile is required'),
];

module.exports = { createConsultantRules };
