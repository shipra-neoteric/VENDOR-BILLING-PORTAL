// One-off migration for the Accounts Payment redesign — moves every
// RunningBill sitting in an old-flow status onto the new
// draft -> verify-done -> l1-approved -> approved -> sent-to-tms -> paid
// enum, per the confirmed decision to re-verify everything below the old
// 'payment-initiated' stage rather than grandfather old sign-offs:
//
//   draft                                              -> draft (no-op)
//   submitted                                          -> draft
//   verified (legacy)                                  -> draft
//   approved (old L2 checker done)                     -> draft
//   payment-initiated (any sub-flag combination)       -> approved
//   hold / rejected / paid                             -> unchanged
//
// Run against vbp_dev first, spot-check counts, then run against vbp.
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');

const RESET_TO_DRAFT = ['submitted', 'verified', 'approved'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to', mongoose.connection.name);

  const counts = {};
  for (const status of ['draft', 'submitted', 'verified', 'approved', 'payment-initiated', 'hold', 'rejected', 'paid']) {
    counts[status] = await RunningBill.countDocuments({ status });
  }
  console.log('\nBefore migration:', counts);

  const toDraft = await RunningBill.updateMany(
    { status: { $in: RESET_TO_DRAFT } },
    { $set: { status: 'draft' } }
  );
  console.log(`\nReset to 'draft' (was submitted/verified/approved): ${toDraft.modifiedCount}`);

  const toApproved = await RunningBill.updateMany(
    { status: 'payment-initiated' },
    { $set: { status: 'approved' } }
  );
  console.log(`Moved to 'approved' (was payment-initiated, ready to send to TMS): ${toApproved.modifiedCount}`);

  const after = {};
  for (const status of ['draft', 'verify-done', 'l1-approved', 'approved', 'sent-to-tms', 'hold', 'rejected', 'paid']) {
    after[status] = await RunningBill.countDocuments({ status });
  }
  console.log('\nAfter migration:', after);

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
