const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createContractorRules } = require('../validators/contractor.validator');
const {
  listContractors, getContractor, createContractor, bulkImport, updateContractor,
} = require('../controllers/contractorController');

router.use(authenticate);

router.get('/',      listContractors);
router.get('/:id',   getContractor);
router.post('/',     authorizeOr('contractors', 'create', 'owner', 'gm', 'accounts'), createContractorRules, createContractor);
router.post('/bulk', authorizeOr('contractors', 'create', 'owner', 'gm', 'accounts'), bulkImport);
router.put('/:id',   authorizeOr('contractors', 'edit',   'owner', 'gm', 'accounts'), updateContractor);

module.exports = router;
