const { MongoClient } = require('mongodb');

// Single, lazily-created, reused connection to QC's Atlas cluster, shared by
// every VMS->QC live-sync call (syncVendorToQc, syncDprToQc,
// syncDrawingRequestToQc). Each sync call used to open and close its own
// fresh MongoClient (a full TLS handshake every time) — cheap at low
// volume but real, needless overhead on every contractor save and DPR/
// Drawing Request submit once those happen throughout a busy day. Reusing
// one pooled client is the same pattern VMS's own Mongoose connection
// already uses for its primary DB.
let clientPromise = null;

function getQcDb() {
  const uri = process.env.QC_MONGODB_URI;
  const dbName = process.env.QC_MONGODB_DB;
  if (!uri || !dbName) return null;

  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5 });
    clientPromise = client.connect().catch((err) => {
      // Let the next call retry instead of permanently caching a failed connect.
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise.then((client) => client.db(dbName));
}

module.exports = { getQcDb };
