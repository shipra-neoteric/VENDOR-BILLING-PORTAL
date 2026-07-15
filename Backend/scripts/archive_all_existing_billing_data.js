// One-off: archive every existing RunningBill, BillRequest, and AdvanceSlip as of
// today — the data used to build/test this system is incomplete and could mislead
// decisions. Archived records stay in the DB (nothing deleted, fully reversible via
// "Show Archived" / unarchive) but are hidden from the default views (Billing &
// Payments, Bill Requests, Advance Payments, Dashboard, Ledger) until toggled on.
// New records created from this point forward default to isArchived: false, so they
// show up normally.
require('dotenv').config();
const mongoose = require('mongoose');
const RunningBill = require('../src/models/RunningBill');
const BillRequest = require('../src/models/BillRequest');
const AdvanceSlip = require('../src/models/AdvanceSlip');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const now = new Date();

  const bills = await RunningBill.updateMany(
    { isArchived: { $ne: true } },
    { isArchived: true, archivedAt: now }
  );
  console.log(`RunningBill: archived ${bills.modifiedCount}`);

  const billRequests = await BillRequest.updateMany(
    { isArchived: { $ne: true } },
    { isArchived: true, archivedAt: now }
  );
  console.log(`BillRequest: archived ${billRequests.modifiedCount}`);

  const advanceSlips = await AdvanceSlip.updateMany(
    { isArchived: { $ne: true } },
    { isArchived: true, archivedAt: now }
  );
  console.log(`AdvanceSlip: archived ${advanceSlips.modifiedCount}`);

  console.log('\nDone. Dashboard and Ledger will show empty/zero by default (they read RunningBill via GET /bills, which now excludes all of these). Toggle "Show Archived" / "Include archived bills" on any page to see this data again.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
