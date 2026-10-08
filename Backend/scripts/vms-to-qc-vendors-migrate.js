// VMS → QC VENDOR MIGRATION — ACTUAL WRITE
//
// QC today has NO master vendor list of its own — its DprForm derives its
// contractor dropdown purely from vendorCode/vendorName pairs already seen
// in the `dpr` collection (see DprForm.tsx's own comment). That means only
// the ~33 of 164 VMS contractors who already have a migrated DPR show up —
// the other ~131 (never submitted a DPR yet) are invisible on QC.
//
// This script adds a real `vendors` collection to QC holding the master
// list, non-sensitive fields only — deliberately EXCLUDES bank account,
// PAN, GST, Aadhaar, and uploaded documents, since QC is a different app
// used by a different, broader set of people (DRIs, QC staff) who have no
// business reason to see vendor financial/KYC data. Only what QC's own
// dropdown actually needs: code, name, work types, status.
//
// SAFE BY DEFAULT:
//   Without --apply: prints exactly what WOULD be inserted/updated. No writes.
//   With --apply: upserts into QC's `vendors` collection, keyed by vendorCode
//   (re-runnable — updates existing rows instead of duplicating).
//
// NEVER touches VMS (read-only there).

const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { VMS_DB_NAME } = require("../src/utils/qcProjectMappings");

const APPLY = process.argv.includes("--apply");

const vmsEnvPath = path.join(__dirname, "..", ".env");
const vmsEnv = dotenv.config({ path: vmsEnvPath });
if (vmsEnv.error) throw new Error(`Could not load VMS .env: ${vmsEnvPath}`);

const VMS_MONGO_URI = process.env.MONGO_URI;
if (!VMS_MONGO_URI) throw new Error("VMS MONGO_URI missing from VMS backend .env");

// Loaded from VMS's OWN .env (QC_MONGODB_URI/QC_MONGODB_DB) — never from
// project-quality/backend/.env, which the QC team edits for their own
// testing (it's been flipped between "project_quality"/"project_quality_dev"
// before, silently redirecting a run of this script into the wrong DB).
const QC_MONGO_URI = process.env.QC_MONGODB_URI;
const QC_DB_NAME = process.env.QC_MONGODB_DB;
if (!QC_MONGO_URI) throw new Error("QC_MONGODB_URI missing from VMS backend .env");
if (!QC_DB_NAME) throw new Error("QC_MONGODB_DB missing from VMS backend .env");

async function run() {
  console.log("");
  console.log("==============================================");
  console.log(" VMS → QC VENDOR MIGRATION — " + (APPLY ? "APPLY (WRITES ENABLED)" : "DRY RUN (NO WRITES)"));
  console.log("==============================================");
  console.log("");

  const vmsClient = new MongoClient(VMS_MONGO_URI);
  const qcClient = new MongoClient(QC_MONGO_URI);

  try {
    await vmsClient.connect();
    console.log("✓ Connected to VMS");
    await qcClient.connect();
    console.log("✓ Connected to QC");
    console.log("");

    const vmsDb = vmsClient.db(VMS_DB_NAME);
    const qcDb = qcClient.db(QC_DB_NAME);

    const contractors = await vmsDb.collection("contractors").find({}).toArray();
    const existing = await qcDb.collection("vendors").find({}, { projection: { vendorCode: 1 } }).toArray();
    const existingCodes = new Set(existing.map((v) => v.vendorCode));

    const records = contractors.map((c) => ({
      vendorCode: c.vendorCode,
      vendorName: c.companyName,
      shortCode: c.shortCode || "",
      workTypes: Array.isArray(c.workTypes) ? c.workTypes : [],
      status: c.status === "inactive" ? "inactive" : "active",
      source: "vms",
    }));

    const toInsert = records.filter((r) => !existingCodes.has(r.vendorCode));
    const toUpdate = records.filter((r) => existingCodes.has(r.vendorCode));

    console.log("----------------------------------------------");
    console.log(`Vendors to insert (new)     : ${toInsert.length}`);
    console.log(`Vendors to update (existing): ${toUpdate.length}`);
    console.log("----------------------------------------------");

    if (!APPLY) {
      console.log("");
      console.log("DRY RUN — no writes made.");
      console.log("Re-run with --apply to actually upsert the above into QC.");
      console.log("");
      return;
    }

    console.log("");
    const bulk = qcDb.collection("vendors").initializeUnorderedBulkOp();
    for (const r of records) {
      bulk.find({ vendorCode: r.vendorCode }).upsert().updateOne({ $set: r });
    }
    if (records.length) {
      const res = await bulk.execute();
      console.log(`✓ Upserted ${res.upsertedCount} new, modified ${res.modifiedCount} existing vendor(s) in QC.`);
    } else {
      console.log("Nothing to upsert.");
    }
    console.log("");
    console.log("✓ VENDOR MIGRATION COMPLETE");
    console.log("");
  } finally {
    await vmsClient.close();
    await qcClient.close();
  }
}

run().catch((error) => {
  console.error("");
  console.error("MIGRATION FAILED");
  console.error(error);
  process.exit(1);
});
