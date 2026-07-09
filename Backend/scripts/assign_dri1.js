// One-time script: assign dri1@neotericgrp.in to all existing work orders
// and print her ObjectId for frontend default wiring.
require('dotenv').config();
const mongoose = require('mongoose');
const User      = require('../src/models/User');
const WorkOrder = require('../src/models/WorkOrder');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const dri = await User.findOne({ email: 'dri1@neotericgrp.in' });
  if (!dri) { console.error('DRI user not found'); process.exit(1); }
  console.log(`DRI found: ${dri.name} (${dri._id})`);

  const result = await WorkOrder.updateMany(
    { assignedDRI: { $ne: dri._id } },
    { $addToSet: { assignedDRI: dri._id } }
  );
  console.log(`Updated ${result.modifiedCount} work orders (${result.matchedCount} matched)`);
  console.log(`\nDRI ObjectId: ${dri._id}`);
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
