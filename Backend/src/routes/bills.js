const router = require('express').Router();
const { authenticate, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  verifyBill, l1AgmApprove, l2DirectorApprove, holdBill, releaseHold, sendToTms,
  rejectBill, patchDeductions,
  getBillingChain, archiveBill, unarchiveBill, archiveBillsBulk, unarchiveBillsBulk,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',                    listBills);
router.get('/chain/:workOrderId',  getBillingChain);
router.get('/:id',                 getBill);
router.post('/',             authorizeOr('billing', 'create',  'owner'), createBillRules, createBill);
router.put('/:id',           authorizeOr('accounts-payment', 'edit',    'owner'), updateBill);
// Verification (merged Maker+Checker) — checks the bill against its WO/
// vendor details, sets TDS. Retention/advance are decided upstream now.
router.patch('/:id/verify',              authorizeOr('accounts-payment', 'verify', 'owner'), verifyBill);
router.patch('/:id/l1-agm-approve',      authorizeOr('accounts-payment', 'l1-agm-approve', 'owner'), l1AgmApprove);
router.patch('/:id/l2-director-approve', authorizeOr('accounts-payment', 'l2-director-approve', 'owner'), l2DirectorApprove);
router.patch('/:id/hold',                authorizeOr('accounts-payment', 'hold', 'owner'), holdBill);
router.patch('/:id/release-hold',        authorizeOr('accounts-payment', 'release-hold', 'owner'), releaseHold);
// Serves both the first send and manual retries after a failed attempt.
router.patch('/:id/send-to-tms',         authorizeOr('accounts-payment', 'retry-tms', 'owner'), sendToTms);
// Reject's target status depends on the bill's current status (see billController.js
// REJECT_TARGET) — the route stays broadly gated since we don't know the status
// before querying the DB; the controller enforces the stage-specific permission.
router.patch('/:id/reject', authorizeAnyOr('accounts-payment', ['verify', 'l1-agm-approve', 'l2-director-approve', 'reject'], 'owner'), rejectBill);
router.patch('/:id/deductions', authorizeOr('accounts-payment', 'edit', 'owner'), patchDeductions);
router.patch('/archive-bulk',   authorizeOr('accounts-payment', 'edit', 'owner'), archiveBillsBulk);
router.patch('/unarchive-bulk', authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBillsBulk);
router.patch('/:id/archive',    authorizeOr('accounts-payment', 'edit', 'owner'), archiveBill);
router.patch('/:id/unarchive',  authorizeOr('accounts-payment', 'edit', 'owner'), unarchiveBill);

module.exports = router;
