// One-off: finds every photo/document still stored as a base64 data URL
// inline (from before the Cloudinary migration — see Backend/src/utils/
// cloudinary.js) and uploads each one to Cloudinary, replacing the field
// with the resulting secure URL. Same shape either way ({name,url} /
// {fileName,dataUrl}) — just holding a real link instead of the whole file
// afterward, so nothing downstream needs to change.
//
// Usage:
//   node scripts/backfillCloudinary.js           (dry run — prints only)
//   node scripts/backfillCloudinary.js --apply   (uploads + writes)
require('dotenv').config();
const mongoose = require('mongoose');
const { cloudinary } = require('../src/utils/cloudinary');
const DailyProgressReport = require('../src/models/DailyProgressReport');
const WorkOrder = require('../src/models/WorkOrder');
const Contractor = require('../src/models/Contractor');
const Consultant = require('../src/models/Consultant');

const APPLY = process.argv.includes('--apply');

let uploadCount = 0;
let errorCount = 0;

function isBase64(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

// Returns { changed, value } — value is the new Cloudinary URL if changed is
// true (APPLY mode only; dry run reports what WOULD change without calling
// Cloudinary or touching the DB).
async function migrateValue(value, folder) {
  if (!isBase64(value)) return { changed: false, value };
  if (!APPLY) return { changed: true, value };
  try {
    const res = await cloudinary.uploader.upload(value, { folder });
    return { changed: true, value: res.secure_url };
  } catch (err) {
    errorCount++;
    console.error(`  ! upload failed: ${err.message}`);
    return { changed: false, value };
  }
}

async function migrateDPR() {
  const reports = await DailyProgressReport.find({
    $or: [
      { 'workEntries.images.url': { $regex: '^data:' } },
      { 'workEntries.beforeImages.url': { $regex: '^data:' } },
      { 'workEntries.afterImages.url': { $regex: '^data:' } },
    ],
  });
  console.log(`DailyProgressReport: ${reports.length} report(s) with base64 images`);
  for (const report of reports) {
    let changed = false;
    for (const entry of report.workEntries) {
      for (const kind of ['images', 'beforeImages', 'afterImages']) {
        for (const img of entry[kind] || []) {
          if (!isBase64(img.url)) continue;
          console.log(`  - ${report._id} / ${entry.workType} / ${kind} / ${img.name}`);
          const result = await migrateValue(img.url, 'daily-progress-reports');
          if (result.changed) { img.url = result.value; changed = true; uploadCount++; }
        }
      }
    }
    if (APPLY && changed) await report.save();
  }
}

async function migrateWorkOrders() {
  const wos = await WorkOrder.find({
    $or: [
      { 'documents.url': { $regex: '^data:' } },
      { documentUrl: { $regex: '^data:' } },
    ],
  });
  console.log(`WorkOrder: ${wos.length} work order(s) with base64 documents`);
  for (const wo of wos) {
    let changed = false;
    for (const doc of wo.documents || []) {
      if (!isBase64(doc.url)) continue;
      console.log(`  - ${wo.workOrderNo} / ${doc.name}`);
      const result = await migrateValue(doc.url, 'work-orders');
      if (result.changed) { doc.url = result.value; changed = true; uploadCount++; }
    }
    // Legacy single-document fields, from before multi-document support.
    if (isBase64(wo.documentUrl)) {
      console.log(`  - ${wo.workOrderNo} / (legacy) ${wo.documentName}`);
      const result = await migrateValue(wo.documentUrl, 'work-orders');
      if (result.changed) { wo.documentUrl = result.value; changed = true; uploadCount++; }
    }
    if (APPLY && changed) await wo.save();
  }
}

const CONTRACTOR_DOC_KEYS = ['gstCertificate', 'panCard', 'cancelledCheque', 'businessCard', 'aadhaarCard'];
const CONSULTANT_DOC_KEYS = ['gstCertificate', 'panCard', 'cancelledCheque', 'businessCard', 'professionalRegistrationCert'];

async function migrateParty(Model, name, docKeys, folder) {
  const query = { $or: docKeys.map((k) => ({ [`documents.${k}.dataUrl`]: { $regex: '^data:' } })) };
  const parties = await Model.find(query);
  console.log(`${name}: ${parties.length} record(s) with base64 documents`);
  for (const party of parties) {
    let changed = false;
    for (const key of docKeys) {
      const doc = party.documents && party.documents[key];
      if (!doc || !isBase64(doc.dataUrl)) continue;
      console.log(`  - ${party._id} / ${key} / ${doc.fileName}`);
      const result = await migrateValue(doc.dataUrl, folder);
      if (result.changed) { doc.dataUrl = result.value; changed = true; uploadCount++; }
    }
    if (APPLY && changed) await party.save();
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will upload + write)' : 'DRY RUN (no writes)');
  console.log('');

  await migrateDPR();
  await migrateWorkOrders();
  await migrateParty(Contractor, 'Contractor', CONTRACTOR_DOC_KEYS, 'contractors');
  await migrateParty(Consultant, 'Consultant', CONSULTANT_DOC_KEYS, 'consultants');

  console.log('');
  console.log(
    APPLY
      ? `Done — uploaded ${uploadCount} file(s), ${errorCount} error(s).`
      : `Dry run only — would upload ${uploadCount} file(s). Re-run with --apply to write.`
  );

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
