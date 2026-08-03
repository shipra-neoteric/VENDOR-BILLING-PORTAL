// One-off data correction for the Hold/Retention-calculated-on-GST-inclusive-
// amount bug (fixed in code as of commit cd9de06). Recomputes retentionAmount
// = round(amount * retentionPercent / 100) for RunningBills that haven't been
// sent to TMS / paid yet — those are the only ones safe to touch, since real
// money may already be in motion against the old (wrong) figure for anything
// past that point.
//
// Usage:
//   node scripts/fix_retention_amount_base.js            # dry run (default)
//   node scripts/fix_retention_amount_base.js --apply     # actually writes
//   node scripts/fix_retention_amount_base.js --db=vbp --apply
require('dotenv').config();
const mongoose = require('mongoose');

const args    = process.argv.slice(2);
const apply   = args.includes('--apply');
const dbArg   = args.find(a => a.startsWith('--db='));
const dbName  = dbArg ? dbArg.split('=')[1] : 'vbp_dev';

const SAFE_STATUSES = ['draft', 'verify-done', 'l1-approved', 'approved', 'hold'];

async function main() {
  const baseUri = process.env.MONGO_URI;
  if (!baseUri) throw new Error('MONGO_URI not set');
  const uri = baseUri.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);

  await mongoose.connect(uri);
  console.log(`Connected to database: ${mongoose.connection.name}`);
  console.log(`Mode: ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}\n`);

  const RunningBill = require('../src/models/RunningBill');

  const bills = await RunningBill.find({
    status: { $in: SAFE_STATUSES },
    retentionPercent: { $gt: 0 },
  }).select('billNo status amount retentionPercent retentionAmount');

  let changed = 0;
  for (const bill of bills) {
    const correct = Math.round((bill.amount || 0) * bill.retentionPercent / 100);
    if (correct === bill.retentionAmount) continue;

    changed++;
    console.log(
      `${bill.billNo} (${bill.status}): retentionAmount ${bill.retentionAmount} -> ${correct} ` +
      `(amount=${bill.amount}, retentionPercent=${bill.retentionPercent}%)`
    );

    if (apply) {
      bill.retentionAmount = correct;
      await bill.save();
    }
  }

  console.log(`\n${changed} bill(s) ${apply ? 'corrected' : 'would be corrected'} out of ${bills.length} checked.`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
