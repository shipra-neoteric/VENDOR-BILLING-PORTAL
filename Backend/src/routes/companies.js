const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
} = require('../controllers/companyController');

router.use(authenticate);

router.get('/',     listCompanies);
router.get('/:id',  getCompany);
router.post('/',      authorizeOr('companies', 'create', 'owner', 'gm'), createCompany);
router.put('/:id',    authorizeOr('companies', 'edit',   'owner', 'gm'), updateCompany);
router.delete('/:id', authorizeOr('companies', 'delete', 'owner'), deleteCompany);

module.exports = router;
