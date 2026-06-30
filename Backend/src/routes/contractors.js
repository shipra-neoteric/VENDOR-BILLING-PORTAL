const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createContractorRules } = require('../validators/contractor.validator');
const {
  listContractors, getContractor, createContractor, bulkImport, updateContractor,
} = require('../controllers/contractorController');

router.use(authenticate);

router.get('/',      listContractors);
router.get('/:id',   getContractor);
router.post('/',     authorize('owner', 'gm', 'accounts'), createContractorRules, createContractor);
router.post('/bulk', authorize('owner', 'gm', 'accounts'), bulkImport);
router.put('/:id',   authorize('owner', 'gm', 'accounts'), updateContractor);

module.exports = router;
