const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const targetDatabases = ['vbp', 'vbp_dev'];

async function syncDatabase(dbName) {
  console.log(`\n==================================================`);
  console.log(`Starting sync for database: "${dbName}"`);
  console.log(`==================================================`);

  const db = mongoose.connection.client.db(dbName);
  const workOrdersCollection = db.collection('workorders');
  const companiesCollection = db.collection('companies');
  const billRequestsCollection = db.collection('billrequests');
  const runningBillsCollection = db.collection('runningbills');

  const workOrders = await workOrdersCollection.find({}).toArray();
  console.log(`Found ${workOrders.length} Work Orders in "${dbName}".`);

  let woUpdatedCount = 0;
  let brUpdatedCount = 0;
  let rbUpdatedCount = 0;

  for (const wo of workOrders) {
    let currentCompanyName = wo.companyName || '';

    if (wo.companyId) {
      const co = await companiesCollection.findOne({ _id: wo.companyId });
      if (co && co.name && wo.companyName !== co.name) {
        console.log(`Updating WO ${wo.workOrderNo} companyName in "${dbName}": "${wo.companyName}" -> "${co.name}"`);
        await workOrdersCollection.updateOne({ _id: wo._id }, { $set: { companyName: co.name } });
        currentCompanyName = co.name;
        woUpdatedCount++;
      }
    }

    // Sync to linked BillRequest records
    const brResult = await billRequestsCollection.updateMany(
      { workOrderId: wo._id },
      {
        $set: {
          companyName: currentCompanyName,
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
      console.log(`Updated ${brResult.modifiedCount} BillRequest(s) for WO ${wo.workOrderNo} (company: "${currentCompanyName}") in "${dbName}"`);
      brUpdatedCount += brResult.modifiedCount;
    }

    // Sync to linked RunningBill records
    const rbResult = await runningBillsCollection.updateMany(
      { workOrderId: wo._id },
      {
        $set: {
          companyName: currentCompanyName,
          vendorCode: wo.vendorCode,
          vendorName: wo.vendorName,
          projectId: wo.projectId || null,
          projectName: wo.projectName || '',
          projectLocation: wo.projectLocation || '',
        },
      }
    );
    if (rbResult.modifiedCount > 0) {
      console.log(`Updated ${rbResult.modifiedCount} RunningBill(s) for WO ${wo.workOrderNo} (company: "${currentCompanyName}") in "${dbName}"`);
      rbUpdatedCount += rbResult.modifiedCount;
    }
  }

  console.log(`\n--- Summary for DB "${dbName}" ---`);
  console.log(`WorkOrders updated: ${woUpdatedCount}`);
  console.log(`BillRequests updated: ${brUpdatedCount}`);
  console.log(`RunningBills updated: ${rbUpdatedCount}`);

  // Check RA-0299 specifically
  const sampleBill = await runningBillsCollection.findOne({ billNo: 'RA-0299' });
  if (sampleBill) {
    console.log(`\nVerification of Bill RA-0299 in "${dbName}":`);
    console.log(`  Bill No: ${sampleBill.billNo}`);
    console.log(`  Work Order No: ${sampleBill.workOrderNo}`);
    console.log(`  Company Name: "${sampleBill.companyName}"`);
  }
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is undefined in .env');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB Cluster.');

  for (const dbName of targetDatabases) {
    await syncDatabase(dbName);
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

run().catch((err) => {
  console.error('Error during sync:', err);
  mongoose.disconnect();
  process.exit(1);
});
