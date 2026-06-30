const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  verifyBill, approveBill, rejectBill, payBill,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',    listBills);
router.get('/:id', getBill);
router.post('/', authorize('owner', 'gm', 'accounts', 'engineer', 'contractor'), createBillRules, createBill);
router.put('/:id', authorize('owner', 'gm', 'accounts', 'contractor'), updateBill);
router.patch('/:id/verify',  authorize('owner', 'gm', 'engineer'),  verifyBill);
router.patch('/:id/approve', authorize('owner', 'gm'),               approveBill);
router.patch('/:id/reject',  authorize('owner', 'gm', 'engineer'),  rejectBill);
router.patch('/:id/pay',     authorize('owner', 'gm', 'accounts'),  payBill);

module.exports = router;
