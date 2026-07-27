const router = require('express').Router();
const { authenticate, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  makerConfirm, checkerApprove, approverInitiate, holdBill, releaseHold, preparePayment,
  physicalVerify, releasePayment, submitPaymentDetails,
  rejectBill, patchDeductions,
  getBillingChain, archiveBill, unarchiveBill, archiveBillsBulk, unarchiveBillsBulk,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',                    listBills);
router.get('/chain/:workOrderId',  getBillingChain);
router.get('/:id',                 getBill);
router.post('/',             authorizeOr('accounts-payment', 'create',  'owner'), createBillRules, createBill);
router.put('/:id',           authorizeOr('accounts-payment', 'edit',    'owner'), updateBill);
// Stage 1 (L1 maker confirms — checklist required).
router.patch('/:id/maker-confirm',   authorizeOr('accounts-payment', 'maker',   'owner'), makerConfirm);
// Stage 2 (L2 checker verifies WO/bill match, sets hold/advance/TDS).
router.patch('/:id/checker-approve', authorizeOr('accounts-payment', 'checker', 'owner'), checkerApprove);
// Reject's target status depends on the bill's current status (see billController.js
// REJECT_TARGET) — the route stays broadly gated since we don't know the status
// before querying the DB; the controller enforces the stage-specific permission.
router.patch('/:id/reject',          authorizeAnyOr('accounts-payment', ['maker', 'checker', 'approver', 'payment-maker', 'physical-verify', 'release', 'reject'], 'owner'), rejectBill);
// Stage 3 (L3 approver signs off — pure approve-and-forward, no TDS here anymore).
router.patch('/:id/approver-initiate', authorizeOr('accounts-payment', 'approver', 'owner'), approverInitiate);
router.patch('/:id/hold',              authorizeOr('accounts-payment', 'approver', 'owner'), holdBill);
router.patch('/:id/release-hold',      authorizeOr('accounts-payment', 'approver', 'owner'), releaseHold);
// "Payment Maker" stage — mode + readiness checklist, gates physical-verify.
router.patch('/:id/prepare-payment',   authorizeOr('accounts-payment', 'payment-maker', 'owner'), preparePayment);
// Physical checkpoint (printed + WO attachments + wet-signature sign-off) before release —
// its own grantable action, distinct from 'release', so a checklist can staff this
// stage separately from whoever actually marks payment released.
router.patch('/:id/physical-verify',   authorizeOr('accounts-payment', 'physical-verify', 'owner'), physicalVerify);
// Stage 4 (mark as paid — the full payment paperwork lands afterward, see payment-details below).
router.patch('/:id/release',           authorizeOr('accounts-payment', 'release',  'owner'), releasePayment);
// Post-paid paperwork (UTR/mode/bank/amount) — its own grantable action, distinct
// from 'release', so it can be staffed separately (e.g. once the bank statement lands).
router.patch('/:id/payment-details',   authorizeOr('accounts-payment', 'payment-details', 'owner'), submitPaymentDetails);
router.patch('/:id/deductions', authorizeOr('accounts-payment', 'edit', 'owner'), patchDeductions);
router.patch('/archive-bulk',   authorizeOr('accounts-payment', 'edit', 'owner'), archiveBillsBulk);
router.patch('/unarchive-bulk', authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBillsBulk);
router.patch('/:id/archive',    authorizeOr('accounts-payment', 'edit', 'owner'), archiveBill);
router.patch('/:id/unarchive',  authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBill);

module.exports = router;
