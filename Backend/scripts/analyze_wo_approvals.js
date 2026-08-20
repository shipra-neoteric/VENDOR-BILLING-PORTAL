require('dotenv').config();
const mongoose = require('mongoose');

async function analyzeWorkOrders() {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri);

  const db = mongoose.connection.client.db('vbp');
  const workOrdersCollection = db.collection('workorders');
  const usersCollection = db.collection('users');

  const users = await usersCollection.find({}).toArray();
  const userMap = {};
  users.forEach(u => { userMap[u._id.toString()] = `${u.name} (${u.role})`; });

  const allWos = await workOrdersCollection.find({}).sort({ workOrderNo: 1 }).toArray();

  console.log(`Total Work Orders in 'vbp' DB: ${allWos.length}\n`);

  const missingApprovals = [];
  const hasPartialApprovals = [];
  const fullyApprovedDigital = [];

  for (const wo of allWos) {
    const hasMaker = !!wo.makerBy;
    const hasChecker = !!wo.checkerBy;
    const hasApprover = !!wo.approverBy;
    const hasFinal = !!wo.finalApprovedBy;
    const historyCount = Array.isArray(wo.approvalHistory) ? wo.approvalHistory.length : 0;

    const info = {
      id: wo._id.toString(),
      workOrderNo: wo.workOrderNo,
      status: wo.status,
      approvalStatus: wo.approvalStatus,
      isLocked: wo.isLocked,
      companyName: wo.companyName,
      projectName: wo.projectName,
      vendorCode: wo.vendorCode,
      vendorName: wo.vendorName,
      createdAt: wo.createdAt,
      makerBy: wo.makerBy ? (userMap[wo.makerBy.toString()] || wo.makerBy.toString()) : null,
      checkerBy: wo.checkerBy ? (userMap[wo.checkerBy.toString()] || wo.checkerBy.toString()) : null,
      approverBy: wo.approverBy ? (userMap[wo.approverBy.toString()] || wo.approverBy.toString()) : null,
      finalApprovedBy: wo.finalApprovedBy ? (userMap[wo.finalApprovedBy.toString()] || wo.finalApprovedBy.toString()) : null,
      historyCount,
    };

    if (!hasChecker && !hasApprover && !hasFinal && historyCount === 0) {
      missingApprovals.push(info);
    } else if (hasChecker && hasApprover && hasFinal) {
      fullyApprovedDigital.push(info);
    } else {
      hasPartialApprovals.push(info);
    }
  }

  console.log(`=== Summary of Work Orders in Production DB ('vbp') ===`);
  console.log(`Total Work Orders: ${allWos.length}`);
  console.log(`1. Work Orders with NO digital approval signatures (missing checker/approver/final & empty history): ${missingApprovals.length}`);
  console.log(`2. Work Orders with PARTIAL approval activity: ${hasPartialApprovals.length}`);
  console.log(`3. Work Orders with FULL digital approval signatures: ${fullyApprovedDigital.length}\n`);

  console.log(`=== Work Orders WITH NO DIGITAL APPROVAL SIGNATURES (${missingApprovals.length}) ===`);
  console.table(missingApprovals.map(w => ({
    WO_No: w.workOrderNo,
    Approval_Status: w.approvalStatus || 'N/A',
    Status: w.status,
    Locked: w.isLocked ? 'Yes' : 'No',
    Company: w.companyName,
    Project: w.projectName,
    Vendor: w.vendorName,
  })));

  await mongoose.disconnect();
}

analyzeWorkOrders().catch(err => {
  console.error('Error during analysis:', err);
  mongoose.disconnect();
});
