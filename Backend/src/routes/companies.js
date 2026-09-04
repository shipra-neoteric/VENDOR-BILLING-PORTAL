const router = require('express').Router();
const { authenticate, authorizeOr } = require('../middleware/auth');
const {
  listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
} = require('../controllers/companyController');

router.use(authenticate);

router.get('/',     listCompanies);
router.get('/:id',  getCompany);
router.post('/',      authorizeOr('companies', 'create'), createCompany);
router.put('/:id',    authorizeOr('companies', 'edit'), updateCompany);
router.delete('/:id', authorizeOr('companies', 'delete'), deleteCompany);

module.exports = router;
