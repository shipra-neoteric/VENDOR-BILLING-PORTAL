// Corrective script — reverts bills that `clear_stuck_tms_bills.js` wrongly
// force-marked 'paid' without the required L2 Director approval ever having
// happened. Does NOT delete or edit the old 'tms-callback'/'paid'
// approvalHistory entry that script added — that stays in place as the
// historical record of the mistake. This only ADDS a new, clearly-labelled
// correction entry and resets the bill's status/payment fields back to
// where they genuinely were (l1-approved, awaiting L2 Director sign-off),
// so each bill reappears in the normal "Pending L2 Approval" queue for a
// real approval to happen.
//
// Run with --apply to write; without it, prints what WOULD change (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');

const APPLY = process.argv.includes('--apply');

const BILL_NOS = [
  'RA-0280','RA-0283','RA-0284','RA-0285','RA-0286','RA-0289','RA-0290','RA-0291',
  'RA-0292','RA-0293','RA-0294','RA-0295','RA-0296','RA-0297','RA-0298','RA-0299',
  'RA-0302','RA-0304','RA-0305','RA-0306','RA-0307','RA-0308','RA-0310','RA-0312',
  'RA-0313','RA-0315','RA-0316','RA-0320','RA-0323','RA-0324','RA-0325','RA-0326',
  'RA-0327','RA-0329','RA-0330','RA-0331','RA-0332','RA-0333',
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  let reverted = 0, skippedNotPaid = 0, skippedHadL2 = 0, skippedNotFound = 0;

  for (const billNo of BILL_NOS) {
    const bill = await RunningBill.findOne({ billNo });
    if (!bill) { skippedNotFound++; console.log(`${billNo}: NOT FOUND — skipped`); continue; }

    // Re-check live, don't trust the snapshot this list was built from — a
    // bill already corrected (or genuinely L2-approved) by someone else in
    // the meantime must not be touched again.
    if (bill.status !== 'paid') { skippedNotPaid++; console.log(`${billNo}: status is now '${bill.status}', not 'paid' — already handled, skipped`); continue; }
    if (bill.l2ApprovedBy) { skippedHadL2++; console.log(`${billNo}: already has a real L2 approval on record — skipped`); continue; }

    console.log(`${APPLY ? 'REVERTING' : '[dry-run] would revert'}: ${billNo} (₹${(bill.amount || 0).toLocaleString('en-IN')}) — paid -> l1-approved`);
    reverted++;

    if (!APPLY) continue;

    bill.status = 'l1-approved';
    bill.paidAmount = undefined;
    bill.paymentDate = undefined;
    bill.tmsCallbackReceivedAt = undefined;
    bill.tmsSentAt = undefined;
    bill.approvalHistory.push({
      stage: 'correction',
      action: 'reverted-to-l1',
      by: null,
      remarks: 'Status corrected — this bill was incorrectly marked paid by scripts/clear_stuck_tms_bills.js without the required L2 Director approval ever happening. Reverted to l1-approved so it genuinely goes through L2 approval.',
      at: new Date(),
    });
    await bill.save();
  }

  console.log(`\n${APPLY ? 'Reverted' : 'Would revert'}: ${reverted}. Already not paid: ${skippedNotPaid}. Already had real L2: ${skippedHadL2}. Not found: ${skippedNotFound}.`);
  if (!APPLY) console.log('Re-run with --apply to write these changes.');

  await mongoose.disconnect();
})();
