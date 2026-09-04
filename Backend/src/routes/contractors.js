const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const { createContractorRules } = require('../validators/contractor.validator');
const {
  listContractors, getContractor, createContractor, bulkImport, updateContractor, deleteContractor,
} = require('../controllers/contractorController');

router.use(authenticate);

router.get('/',      listContractors);
router.get('/:id',   getContractor);
router.post('/',     authorizeOr('contractors', 'create'), createContractorRules, createContractor);
router.post('/bulk', authorizeOr('contractors', 'create'), bulkImport);
router.put('/:id',   authorizeOr('contractors', 'edit'), updateContractor);
router.delete('/:id', authorizeOr('contractors', 'delete'), deleteContractor);

module.exports = router;
