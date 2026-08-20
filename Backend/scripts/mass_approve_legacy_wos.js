require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_DATABASES = ['vbp', 'vbp_dev'];

async function massApproveLegacyWOs() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB Cluster.');

  for (const dbName of TARGET_DATABASES) {
    console.log(`\n==================================================`);
    console.log(`Processing database: "${dbName}"`);
    console.log(`==================================================`);

    const db = mongoose.connection.client.db(dbName);
    const workOrdersCollection = db.collection('workorders');
    const usersCollection = db.collection('users');

    // Find target User ObjectIds
    const adminUser = await usersCollection.findOne({ name: 'Admin' });
    const sagarUser = await usersCollection.findOne({ name: 'Sagar Gupta' });
    const rakeshUser = await usersCollection.findOne({ name: 'Rakesh Bhargava' });

    if (!adminUser || !sagarUser || !rakeshUser) {
      console.error(`Missing required users in "${dbName}": admin=${!!adminUser}, sagar=${!!sagarUser}, rakesh=${!!rakeshUser}`);
      continue;
    }

    const adminId = adminUser._id;
    const sagarId = sagarUser._id;
    const rakeshId = rakeshUser._id;

    console.log(`Resolved User IDs for "${dbName}":`);
    console.log(`  Admin (Maker & Final): ${adminId}`);
    console.log(`  Sagar Gupta (AGM/Checker): ${sagarId}`);
    console.log(`  Rakesh Bhargava (GM/Approver): ${rakeshId}`);

    const allWos = await workOrdersCollection.find({}).toArray();

    let legacyCount = 0;

    for (const wo of allWos) {
      const hasChecker = !!wo.checkerBy;
      const hasApprover = !!wo.approverBy;
      const hasFinal = !!wo.finalApprovedBy;
      const historyCount = Array.isArray(wo.approvalHistory) ? wo.approvalHistory.length : 0;

      // Identify legacy Work Orders (no digital signatures & no workflow history)
      if (!hasChecker && !hasApprover && !hasFinal && historyCount === 0) {
        const updatePayload = {
          approvalStatus: 'approved',
          isLocked: true,
          makerBy: adminId,
          makerAt: null,
          checkerBy: sagarId,
          checkerAt: null,
          checkerRemarks: 'Legacy work order — physically signed',
          approverBy: rakeshId,
          approverAt: null,
          approverRemarks: 'Legacy work order — physically signed',
          finalApprovedBy: adminId,
          finalApprovedAt: null,
          finalRemarks: 'Legacy work order — physically signed',
          approvalHistory: [
            { stage: 'maker', action: 'submitted', by: adminId, at: null, remarks: 'Legacy work order — physically signed' },
            { stage: 'checker', action: 'approved', by: sagarId, at: null, remarks: 'Legacy work order — physically signed' },
            { stage: 'approver', action: 'approved', by: rakeshId, at: null, remarks: 'Legacy work order — physically signed' },
            { stage: 'final', action: 'approved', by: adminId, at: null, remarks: 'Legacy work order — physically signed' },
          ],
        };

        await workOrdersCollection.updateOne(
          { _id: wo._id },
          { $set: updatePayload }
        );

        legacyCount++;
      }
    }

    console.log(`\nSuccessfully mass-approved ${legacyCount} legacy Work Orders in DB "${dbName}".`);
  }

  // Verification step for WO-0001 in 'vbp'
  const dbVbp = mongoose.connection.client.db('vbp');
  const sampleWo = await dbVbp.collection('workorders').findOne({ workOrderNo: 'WO-0001' });
  if (sampleWo) {
    console.log('\n==================================================');
    console.log('Verification of WO-0001 after mass approval:');
    console.log('==================================================');
    console.log('  Work Order No:', sampleWo.workOrderNo);
    console.log('  Approval Status:', sampleWo.approvalStatus);
    console.log('  Is Locked:', sampleWo.isLocked);
    console.log('  Maker By:', sampleWo.makerBy);
    console.log('  Checker By (AGM):', sampleWo.checkerBy);
    console.log('  Approver By (GM):', sampleWo.approverBy);
    console.log('  Final Approved By:', sampleWo.finalApprovedBy);
    console.log('  Approval History Length:', sampleWo.approvalHistory?.length);
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

massApproveLegacyWOs().catch(err => {
  console.error('Error during mass approval:', err);
  mongoose.disconnect();
  process.exit(1);
});
