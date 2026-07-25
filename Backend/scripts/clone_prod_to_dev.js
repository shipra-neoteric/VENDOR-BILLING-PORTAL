require('dotenv').config();
const mongoose = require('mongoose');

// Clones every collection from the production database into a separate
// `vbp_dev` database on the same Atlas cluster, so local testing has real,
// realistic data to work with without ever touching production. Safe to
// re-run any time to refresh the dev copy — each collection is cleared and
// re-copied from scratch. Does NOT copy indexes; Mongoose rebuilds those
// automatically from the schemas the first time the app connects to vbp_dev
// (autoIndex is on, confirmed — nothing disables it in this codebase).
const PROD_DB = 'vbp';
const DEV_DB  = 'vbp_dev';

function withDb(uri, dbName) {
  return uri.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

(async () => {
  const baseUri = process.env.MONGO_URI;
  const prodConn = await mongoose.createConnection(withDb(baseUri, PROD_DB)).asPromise();
  const devConn  = await mongoose.createConnection(withDb(baseUri, DEV_DB)).asPromise();

  const collections = await prodConn.db.listCollections().toArray();
  for (const { name } of collections) {
    const docs = await prodConn.db.collection(name).find({}).toArray();
    await devConn.db.collection(name).deleteMany({});
    if (docs.length) await devConn.db.collection(name).insertMany(docs);
    console.log(`${name}: copied ${docs.length} doc(s)`);
  }

  console.log(`\nDone — ${PROD_DB} cloned into ${DEV_DB}.`);
  await prodConn.close();
  await devConn.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
