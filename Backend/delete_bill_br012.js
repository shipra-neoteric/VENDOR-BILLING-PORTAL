const mongoose = require('mongoose');

const MONGO_URI = "mongodb://shipra_db_user:ZpTAspgyt5iZKXIA@ac-o7z7nhc-shard-00-00.wc2sqly.mongodb.net:27017,ac-o7z7nhc-shard-00-01.wc2sqly.mongodb.net:27017,ac-o7z7nhc-shard-00-02.wc2sqly.mongodb.net:27017/vbp?ssl=true&replicaSet=atlas-frch5w-shard-0&authSource=admin&retryWrites=true&w=majority";

async function main() {
  await mongoose.connect(MONGO_URI);

  const BillRequest = mongoose.model('BillRequest', new mongoose.Schema({}, { strict: false }), 'billrequests');
  const RunningBill = mongoose.model('RunningBill', new mongoose.Schema({}, { strict: false }), 'runningbills');
  const WorkOrder   = mongoose.model('WorkOrder',   new mongoose.Schema({}, { strict: false }), 'workorders');

  // 1. Delete bill request BR-0012
  const br = await BillRequest.findOneAndDelete({ billRequestNo: 'BR-0012' });
  console.log(br ? `Deleted bill request: BR-0012` : 'BR-0012 not found in billrequests');

  // 2. Delete running bill RA-0012
  const ra = await RunningBill.findOneAndDelete({ billNo: 'RA-0012' });
  console.log(ra ? `Deleted running bill: RA-0012` : 'RA-0012 not found in runningbills');

  // 3. Reset lastBilledQty on WO-0109 scope items back to 0
  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0109' });
  if (wo) {
    let changed = 0;
    for (const item of wo.scopeItems || []) {
      if ((item.lastBilledQty || 0) > 0) {
        console.log(`  Resetting lastBilledQty on "${item.description}": ${item.lastBilledQty} → 0`);
        item.lastBilledQty = 0;
        changed++;
      }
    }
    if (changed > 0) {
      await WorkOrder.updateOne(
        { workOrderNo: 'WO-0109' },
        { $set: { scopeItems: wo.scopeItems } }
      );
      console.log(`Reset ${changed} scope item(s) on WO-0109`);
    } else {
      console.log('No lastBilledQty to reset on WO-0109');
    }
  } else {
    console.log('WO-0109 not found');
  }

  console.log('\nDone. You can now redo the bill request correctly.');
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
