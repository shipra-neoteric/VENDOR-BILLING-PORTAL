const router = require('express').Router();
const { authenticate, authorizeOr, authorizeAnyOr } = require('../middleware/auth');
const { createBillRules } = require('../validators/bill.validator');
const {
  listBills, getBill, createBill, updateBill,
  verifyBill, l1AgmApprove, l2DirectorApprove, holdBill, releaseHold, sendToTms,
  rejectBill, patchDeductions,
  manualAgmApprove, manualGmApprove, manualL3Approve, manualL4Approve, manualReject,
  getBillingChain, archiveBill, unarchiveBill, archiveBillsBulk, unarchiveBillsBulk,
  submitDraft,
} = require('../controllers/billController');

router.use(authenticate);

router.get('/',                    listBills);
router.get('/chain/:workOrderId',  getBillingChain);
router.get('/:id',                 getBill);
router.post('/',             authorizeOr('billing', 'create'), createBillRules, createBill);
// Submits a "Save as Draft" bill into the manual-approval chain — gated only
// to being authenticated here (same as GET /:id above); the controller
// itself enforces "own creator or Owner", since that's a per-document check
// (who actually created THIS bill), not a role/permission one.
router.patch('/:id/submit-draft', submitDraft);
router.put('/:id',           authorizeOr('accounts-payment', 'edit', 'CEO'), updateBill);
// Verification (merged Maker+Checker) — checks the bill against its WO/
// vendor details, sets TDS. Retention/advance are decided upstream now.
// Pre-Accounts AGM/GM sign-off — only ever applies to a manually-created bill
// (manualApprovalStatus stays 'approved' from birth for a progress-driven
// one) — gated the same way billRequestController's own agm/gm-approve are,
// since these are the exact same real-world reviewers signing off before
// Accounts can act, just for the Billing -> New Bill path.
// CEO bypasses every one of these stage-specific gates (same convention as
// 'owner' elsewhere) — CEO's own permission grant only ever covers a subset
// of accounts-payment actions (view/edit/l2-director-approve/reject), so
// without this explicit bypass he'd be wrongly blocked acting at any other
// stage (verify, L1, hold, send-to-tms, archive, …) on a bill he can
// otherwise see.
router.patch('/:id/manual-agm-approve', authorizeOr('bill-requests', 'agm-approve', 'CEO'), manualAgmApprove);
router.patch('/:id/manual-gm-approve',  authorizeOr('bill-requests', 'gm-approve', 'CEO'), manualGmApprove);
// Only ever reachable once a department's Approval Rule (Users → Departments)
// is configured for 3/4 levels — see billController's own note on this.
router.patch('/:id/manual-l3-approve',  authorizeOr('bill-requests', 'l3-approve', 'CEO'), manualL3Approve);
router.patch('/:id/manual-l4-approve',  authorizeOr('bill-requests', 'l4-approve', 'CEO'), manualL4Approve);
router.patch('/:id/manual-reject',      authorizeAnyOr('bill-requests', ['agm-approve', 'gm-approve', 'l3-approve', 'l4-approve'], 'CEO'), manualReject);
router.patch('/:id/verify',              authorizeOr('accounts-payment', 'verify', 'CEO'), verifyBill);
router.patch('/:id/l1-agm-approve',      authorizeOr('accounts-payment', 'l1-agm-approve', 'CEO'), l1AgmApprove);
router.patch('/:id/l2-director-approve', authorizeOr('accounts-payment', 'l2-director-approve', 'CEO'), l2DirectorApprove);
router.patch('/:id/hold',                authorizeOr('accounts-payment', 'hold', 'CEO'), holdBill);
router.patch('/:id/release-hold',        authorizeOr('accounts-payment', 'release-hold', 'CEO'), releaseHold);
// Serves both the first send and manual retries after a failed attempt.
router.patch('/:id/send-to-tms',         authorizeOr('accounts-payment', 'retry-tms', 'CEO'), sendToTms);
// Reject's target status depends on the bill's current status (see billController.js
// REJECT_TARGET) — the route stays broadly gated since we don't know the status
// before querying the DB; the controller enforces the stage-specific permission.
router.patch('/:id/reject', authorizeAnyOr('accounts-payment', ['verify', 'l1-agm-approve', 'l2-director-approve', 'reject'], 'CEO'), rejectBill);
router.patch('/:id/deductions', authorizeOr('accounts-payment', 'edit', 'CEO'), patchDeductions);
router.patch('/archive-bulk',   authorizeOr('accounts-payment', 'edit', 'CEO'), archiveBillsBulk);
router.patch('/unarchive-bulk', authorizeOr('accounts-payment', 'edit', 'CEO'), unarchiveBillsBulk);
router.patch('/:id/archive',    authorizeOr('accounts-payment', 'edit', 'CEO'), archiveBill);
router.patch('/:id/unarchive',  authorizeOr('accounts-payment', 'edit', 'CEO'), unarchiveBill);

module.exports = router;
