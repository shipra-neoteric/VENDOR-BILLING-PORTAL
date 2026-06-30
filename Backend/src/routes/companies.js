const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  listCompanies, getCompany, createCompany, updateCompany, deleteCompany,
} = require('../controllers/companyController');

router.use(authenticate);

router.get('/',     listCompanies);
router.get('/:id',  getCompany);
router.post('/',    authorize('owner', 'gm'), createCompany);
router.put('/:id',  authorize('owner', 'gm'), updateCompany);
router.delete('/:id', authorize('owner'), deleteCompany);

module.exports = router;
