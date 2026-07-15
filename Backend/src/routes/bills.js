const router = require('express').Router();
const { authenticate, authorize, authorizeOr } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  verifyBill, approveBill, rejectBill, payBill, patchDeductions,
  getBillingChain, archiveBill, unarchiveBill, archiveBillsBulk, unarchiveBillsBulk,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',                    listBills);
router.get('/chain/:workOrderId',  getBillingChain);
router.get('/:id',                 getBill);
router.post('/',             authorizeOr('billing-payments', 'create',  'owner', 'gm', 'accounts', 'engineer', 'contractor'), createBillRules, createBill);
router.put('/:id',           authorizeOr('billing-payments', 'edit',    'owner', 'gm', 'accounts', 'contractor'), updateBill);
router.patch('/:id/verify',  authorizeOr('approvals',        'approve', 'owner', 'gm', 'engineer'),  verifyBill);
router.patch('/:id/approve', authorizeOr('approvals',        'approve', 'owner', 'gm'),               approveBill);
router.patch('/:id/reject',  authorizeOr('approvals',        'approve', 'owner', 'gm', 'engineer'),  rejectBill);
router.patch('/:id/pay',        authorizeOr('billing-payments', 'approve', 'owner', 'gm', 'accounts'),  payBill);
router.patch('/:id/deductions', authorize('owner', 'admin'),  patchDeductions);
router.patch('/archive-bulk',   authorizeOr('billing-payments', 'edit', 'owner', 'gm', 'accounts'), archiveBillsBulk);
router.patch('/unarchive-bulk', authorizeOr('billing-payments', 'edit', 'owner', 'gm', 'accounts'), unarchiveBillsBulk);
router.patch('/:id/archive',    authorizeOr('billing-payments', 'edit', 'owner', 'gm', 'accounts'), archiveBill);
router.patch('/:id/unarchive',  authorizeOr('billing-payments', 'edit', 'owner', 'gm', 'accounts'), unarchiveBill);

module.exports = router;
