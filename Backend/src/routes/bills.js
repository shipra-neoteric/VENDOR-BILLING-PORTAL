const router = require('express').Router();
const { authenticate, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  makerConfirm, checkerApprove, approverInitiate, physicalVerify, releasePayment,
  rejectBill, patchDeductions,
  getBillingChain, archiveBill, unarchiveBill, archiveBillsBulk, unarchiveBillsBulk,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',                    listBills);
router.get('/chain/:workOrderId',  getBillingChain);
router.get('/:id',                 getBill);
router.post('/',             authorizeOr('accounts-payment', 'create',  'owner'), createBillRules, createBill);
router.put('/:id',           authorizeOr('accounts-payment', 'edit',    'owner'), updateBill);
// Stage 1 (L1 maker confirms).
router.patch('/:id/maker-confirm',   authorizeOr('accounts-payment', 'maker',   'owner'), makerConfirm);
// Stage 2 (L2 checker verifies WO/bill match, sets hold/advance).
router.patch('/:id/checker-approve', authorizeOr('accounts-payment', 'checker', 'owner'), checkerApprove);
router.patch('/:id/reject',          authorizeAnyOr('accounts-payment', ['maker', 'checker', 'approver', 'release', 'reject'], 'owner'), rejectBill);
// Stage 3 (L3 approver signs off — TDS entry, payment initiated).
router.patch('/:id/approver-initiate', authorizeOr('accounts-payment', 'approver', 'owner'), approverInitiate);
// Physical checkpoint (printed + WO attachments + wet-signature sign-off) before release.
router.patch('/:id/physical-verify',   authorizeOr('accounts-payment', 'release',  'owner'), physicalVerify);
// Stage 4 (final release).
router.patch('/:id/release',           authorizeOr('accounts-payment', 'release',  'owner'), releasePayment);
router.patch('/:id/deductions', authorizeOr('accounts-payment', 'edit', 'owner'), patchDeductions);
router.patch('/archive-bulk',   authorizeOr('accounts-payment', 'edit', 'owner'), archiveBillsBulk);
router.patch('/unarchive-bulk', authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBillsBulk);
router.patch('/:id/archive',    authorizeOr('accounts-payment', 'edit', 'owner'), archiveBill);
router.patch('/:id/unarchive',  authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBill);

module.exports = router;
