const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createConsultantRules } = require('../validators/consultant.validator');
const {
  listConsultants, getConsultant, createConsultant, updateConsultant,
} = require('../controllers/consultantController');

router.use(authenticate);

router.get('/',    listConsultants);
router.get('/:id', getConsultant);
router.post('/',   authorizeOr('consultants', 'create'), createConsultantRules, createConsultant);
router.put('/:id', authorizeOr('consultants', 'edit'), updateConsultant);

module.exports = router;
