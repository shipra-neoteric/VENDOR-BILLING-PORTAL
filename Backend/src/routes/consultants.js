const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createConsultantRules } = require('../validators/consultant.validator');
const {
  listConsultants, getConsultant, createConsultant, updateConsultant,
} = require('../controllers/consultantController');

router.use(authenticate);

router.get('/',    listConsultants);
router.get('/:id', getConsultant);
router.post('/',   authorizeOr('consultants', 'create', 'owner', 'gm', 'accounts'), createConsultantRules, createConsultant);
router.put('/:id', authorizeOr('consultants', 'edit',   'owner', 'gm', 'accounts'), updateConsultant);

module.exports = router;
