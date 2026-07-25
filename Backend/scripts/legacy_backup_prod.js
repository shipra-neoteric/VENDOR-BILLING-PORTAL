require('dotenv').config();
const mongoose = require('mongoose');

// One-off pre-write safety backup for the legacy billing reconciliation —
// clones every collection from production `vbp` into a separate, untouched
// backup database on the same Atlas cluster. Same technique as
// clone_prod_to_dev.js, just targeting a dated backup name instead of the
// dev copy. Safe to re-run (clears + re-copies), but only meant to run once
// right before legacy_bill_reconciliation.js --write --confirm.
const PROD_DB   = 'vbp';
const BACKUP_DB = 'vbp_backup_20260725';

function withDb(uri, dbName) {
  return uri.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

(async () => {
  const baseUri = process.env.MONGO_URI;
  const prodConn   = await mongoose.createConnection(withDb(baseUri, PROD_DB)).asPromise();
  const backupConn = await mongoose.createConnection(withDb(baseUri, BACKUP_DB)).asPromise();

  const collections = await prodConn.db.listCollections().toArray();
  for (const { name } of collections) {
    const docs = await prodConn.db.collection(name).find({}).toArray();
    await backupConn.db.collection(name).deleteMany({});
    if (docs.length) await backupConn.db.collection(name).insertMany(docs);
    console.log(`${name}: copied ${docs.length} doc(s)`);
  }

  console.log(`\nDone — ${PROD_DB} backed up into ${BACKUP_DB}.`);
  await prodConn.close();
  await backupConn.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
