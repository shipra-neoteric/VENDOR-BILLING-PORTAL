// One-off: retroactively links AdvanceSlip ADV-0006 (Arjun Singh Mahor,
// VC-0126) to RunningBill RA-0264 — that bill's advanceRecovery (₹10,00,000)
// was entered as a bare number before the AGM-approval flow linked recoveries
// to real slips, so ADV-0006 has sat "outstanding" ever since despite the
// full amount having genuinely been recovered through that bill. Confirmed
// by hand: RA-0264.advanceRecovery (₹10,00,000) exactly equals ADV-0006's
// full balance, with zero prior recoveries on the slip.
//
// Uses the same applyAdvanceRecoveries helper the manual Billing flow and
// AGM-approval flow both use, so the slip ends up in exactly the state it
// would have if the recovery had been linked correctly at the time.
//
// Usage:
//   node scripts/link_adv0006_to_ra0264.js           (dry run — prints only)
//   node scripts/link_adv0006_to_ra0264.js --apply   (writes)
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const AdvanceSlip = require('../src/models/AdvanceSlip');
const { applyAdvanceRecoveries } = require('../src/utils/advanceRecovery');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will write)' : 'DRY RUN (no writes)');

  const bill = await RunningBill.findOne({ billNo: 'RA-0264' });
  if (!bill) throw new Error('RA-0264 not found');
  const slip = await AdvanceSlip.findOne({ slipNo: 'ADV-0006' });
  if (!slip) throw new Error('ADV-0006 not found');

  console.log(`RA-0264: advanceRecovery=${bill.advanceRecovery}`);
  console.log(`ADV-0006: balance=${slip.balance} (amount=${slip.amount}, amountRecovered=${slip.amountRecovered}), status=${slip.status}`);

  if (slip.recoveries.some(r => r.billNo === 'RA-0264')) {
    console.log('\nADV-0006 already has a recovery recorded against RA-0264 — nothing to do.');
    await mongoose.disconnect();
    return;
  }
  if (!bill.advanceRecovery || bill.advanceRecovery <= 0) {
    throw new Error('RA-0264 has no advanceRecovery — refusing to link.');
  }
  if (bill.advanceRecovery > slip.balance) {
    throw new Error(`RA-0264's advanceRecovery (${bill.advanceRecovery}) exceeds ADV-0006's remaining balance (${slip.balance}) — refusing to link blindly.`);
  }

  console.log(`\nPlanned: link ${bill.advanceRecovery} from RA-0264 onto ADV-0006 (releasedBy: ${bill.generatedBy || 'Admin'}).`);

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write this change.');
    await mongoose.disconnect();
    return;
  }

  const applied = await applyAdvanceRecoveries(
    [{ slipId: slip._id, amount: bill.advanceRecovery }],
    { billNo: 'RA-0264', releasedBy: bill.generatedBy || 'Admin' }
  );
  console.log('Applied:', applied);

  const slipAfter = await AdvanceSlip.findById(slip._id);
  console.log('ADV-0006 after:', { amountRecovered: slipAfter.amountRecovered, balance: slipAfter.balance, status: slipAfter.status });

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
