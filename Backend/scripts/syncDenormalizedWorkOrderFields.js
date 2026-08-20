const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const WorkOrder = require('../src/models/WorkOrder');
const Company = require('../src/models/Company');
const BillRequest = require('../src/models/BillRequest');
const RunningBill = require('../src/models/RunningBill');

async function syncAll() {
  await connectDB();
  console.log('Connected to MongoDB. Starting denormalized fields sync...');

  // Step 1: Ensure WorkOrder.companyName matches Company.name for all WorkOrders with companyId
  const workOrders = await WorkOrder.find();
  console.log(`Found ${workOrders.length} Work Orders.`);

  let woUpdatedCount = 0;
  let brUpdatedCount = 0;
  let rbUpdatedCount = 0;

  for (const wo of workOrders) {
    let woModified = false;

    if (wo.companyId) {
      const co = await Company.findById(wo.companyId).select('name');
      if (co && co.name && wo.companyName !== co.name) {
        console.log(`Updating WO ${wo.workOrderNo} companyName: "${wo.companyName}" -> "${co.name}"`);
        wo.companyName = co.name;
        woModified = true;
      }
    }

    if (woModified) {
      await wo.save();
      woUpdatedCount++;
    }

    // Step 2: Sync to linked BillRequest records
    const brResult = await BillRequest.updateMany(
      { workOrderId: wo._id },
      {
        $set: {
          companyName: wo.companyName || '',
          vendorCode: wo.vendorCode,
          vendorName: wo.vendorName,
          category: wo.category || '',
          subCategory: wo.subCategory || '',
          projectId: wo.projectId || null,
          projectName: wo.projectName || '',
          projectLocation: wo.projectLocation || '',
        },
      }
    );
    if (brResult.modifiedCount > 0) {
      console.log(`Updated ${brResult.modifiedCount} BillRequest(s) for WO ${wo.workOrderNo} (company: "${wo.companyName}")`);
      brUpdatedCount += brResult.modifiedCount;
    }

    // Step 3: Sync to linked RunningBill records
    const rbResult = await RunningBill.updateMany(
      { workOrderId: wo._id },
      {
        $set: {
          companyName: wo.companyName || '',
          vendorCode: wo.vendorCode,
          vendorName: wo.vendorName,
          projectId: wo.projectId || null,
          projectName: wo.projectName || '',
          projectLocation: wo.projectLocation || '',
        },
      }
    );
    if (rbResult.modifiedCount > 0) {
      console.log(`Updated ${rbResult.modifiedCount} RunningBill(s) for WO ${wo.workOrderNo} (company: "${wo.companyName}")`);
      rbUpdatedCount += rbResult.modifiedCount;
    }
  }

  console.log('\n--- Sync Complete ---');
  console.log(`WorkOrders updated: ${woUpdatedCount}`);
  console.log(`BillRequests updated: ${brUpdatedCount}`);
  console.log(`RunningBills updated: ${rbUpdatedCount}`);

  // Print state of RA-0299 / WO-0239 specifically
  const sampleBill = await RunningBill.findOne({ billNo: 'RA-0299' });
  if (sampleBill) {
    console.log(`\nVerification of Bill RA-0299:`);
    console.log(`  Bill No: ${sampleBill.billNo}`);
    console.log(`  Work Order No: ${sampleBill.workOrderNo}`);
    console.log(`  Company Name: "${sampleBill.companyName}"`);
  } else {
    console.log('\nBill RA-0299 checked.');
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

syncAll().catch((err) => {
  console.error('Error during sync:', err);
  mongoose.disconnect();
  process.exit(1);
});
