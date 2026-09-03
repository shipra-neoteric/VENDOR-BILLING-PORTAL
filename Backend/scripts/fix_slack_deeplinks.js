// One-off: backfill_slack_approvals.js was run locally, which picked up the
// local dev FRONTEND_URL (http://localhost:5173) for the "View & Decide"
// button instead of the real production URL — useless for anyone but the
// machine it ran on. This re-renders every still-pending Slack approval
// message with the correct link, using FRONTEND_URL/MONGO_URI passed in on
// the command line (not the local .env) so nothing production-pointed is
// left sitting in a local file. Safe to re-run.
require('dotenv').config();
const mongoose = require('mongoose');
const SlackApproval = require('../src/models/SlackApproval');
const { refreshApprovalMessage } = require('../src/utils/slackApprovals');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const pending = await SlackApproval.find({ status: 'pending' });
  for (const approval of pending) {
    try {
      await refreshApprovalMessage(approval);
      console.log(`Refreshed: ${approval.title} (${approval._id})`);
    } catch (err) {
      console.error(`Failed: ${approval._id} — ${err.message}`);
    }
  }
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
