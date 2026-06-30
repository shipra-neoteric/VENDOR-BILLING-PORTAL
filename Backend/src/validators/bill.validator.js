const { body } = require('express-validator');

const createBillRules = [
  body('billDate').isISO8601().withMessage('Valid bill date is required'),
];

module.exports = { createBillRules };
