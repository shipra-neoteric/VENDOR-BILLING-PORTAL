// One-off: SlackApproval used to track a single slackChannel/slackMessageTs/
// approverUserId per row (one recipient, one channel). The multi-recipient +
// group-channel redesign replaced those with messages[]/approverUserIds[].
// This converts the existing ~39 rows into the new shape. Uses the raw
// driver (not the Mongoose model) since the model's schema no longer
// declares the old field names, so a normal `.find()` wouldn't see them.
// Safe to re-run — only touches docs still missing `messages`.
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection('slackapprovals');
  const docs = await collection.find({ messages: { $exists: false } }).toArray();

  for (const doc of docs) {
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          messages: (doc.slackChannel && doc.slackMessageTs) ? [{ channel: doc.slackChannel, ts: doc.slackMessageTs }] : [],
          approverUserIds: doc.approverUserId ? [doc.approverUserId] : [],
        },
        $unset: { slackChannel: '', slackMessageTs: '', approverUserId: '' },
      }
    );
    console.log(`Migrated: ${doc._id}`);
  }
  console.log(`Done — ${docs.length} migrated.`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
