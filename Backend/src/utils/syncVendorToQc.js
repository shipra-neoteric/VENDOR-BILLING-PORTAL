const { MongoClient } = require('mongodb');

// Pushes a single contractor's non-sensitive fields into QC's `vendors`
// collection the moment it's created/updated in VMS, so a new VMS vendor
// shows up in QC's DPR contractor dropdown immediately instead of waiting
// for the next manual re-run of scripts/vms-to-qc-vendors-migrate.js.
// Deliberately mirrors that script's own field list — code/name/work types/
// status only, never bank/PAN/GST/Aadhaar/documents (QC has no business
// reason to see vendor financial/KYC data).
//
// Fire-and-forget: a QC-side outage must never block a VMS contractor
// save, so every caller catches/logs rather than awaiting a hard failure.
// Connects fresh per call rather than holding a second pooled connection
// alongside VMS's own Mongoose one — contractor writes are infrequent
// enough that this cost is negligible.
let warnedMissingConfig = false;

async function syncVendorToQc(contractor) {
  const uri = process.env.QC_MONGODB_URI;
  const dbName = process.env.QC_MONGODB_DB;
  if (!uri || !dbName) {
    if (!warnedMissingConfig) {
      console.warn('[syncVendorToQc] QC_MONGODB_URI/QC_MONGODB_DB not set — skipping QC vendor sync');
      warnedMissingConfig = true;
    }
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const record = {
      vendorCode: contractor.vendorCode,
      vendorName: contractor.companyName,
      shortCode: contractor.shortCode || '',
      workTypes: Array.isArray(contractor.workTypes) ? contractor.workTypes : [],
      status: contractor.status === 'inactive' ? 'inactive' : 'active',
      source: 'vms',
    };
    await client.db(dbName).collection('vendors').updateOne(
      { vendorCode: record.vendorCode },
      { $set: record },
      { upsert: true }
    );
  } catch (err) {
    console.error('[syncVendorToQc] failed to sync vendor', contractor.vendorCode, err.message);
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = { syncVendorToQc };
