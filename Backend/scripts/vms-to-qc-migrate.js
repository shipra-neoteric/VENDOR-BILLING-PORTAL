// VMS → QC MIGRATION — ACTUAL WRITE
//
// Same transform logic as vms-to-qc-dry-run.js (project-code fallback
// matching, l1-gm/l2-architect status mapping, user resolution) — kept as
// a separate, duplicated copy here rather than requiring that file, since
// the dry-run script executes its own run() at module load time.
//
// SAFE BY DEFAULT:
//   Without --apply: prints exactly what WOULD be inserted. No writes.
//   With --apply: inserts into QC's `dpr`/`drawingRequests` collections.
//
// Idempotent: re-running (even with --apply) skips any source record whose
// QC id (DPR-VMS-<sourceId> / DR-VMS-<sourceId>) already exists in QC —
// safe to re-run after fixing a mapping gap without creating duplicates.
//
// Only migrates "ready" records — skips anything whose project or
// reviewStatus didn't resolve, so nothing malformed lands in QC.
//
// NEVER touches VMS (read-only there) and NEVER updates/deletes an
// existing QC document — insert-only, into brand-new ids.

const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

const APPLY = process.argv.includes("--apply");

// ============================================================
// LOAD VMS ENV
// ============================================================

const vmsEnvPath = path.join(__dirname, "..", ".env");
const vmsEnv = dotenv.config({ path: vmsEnvPath });
if (vmsEnv.error) throw new Error(`Could not load VMS .env: ${vmsEnvPath}`);

const VMS_MONGO_URI = process.env.MONGO_URI;
if (!VMS_MONGO_URI) throw new Error("VMS MONGO_URI missing from VMS backend .env");

// ============================================================
// LOAD QC CONNECTION — from VMS's OWN .env (QC_MONGODB_URI/QC_MONGODB_DB),
// never from project-quality/backend/.env directly. That file is the other
// team's live working copy — they've flipped its MONGODB_DB between
// "project_quality" (real/live) and "project_quality_dev" (their own
// testing) for their own debugging, which once silently redirected a run
// of this exact script into the wrong database. VMS's own copy of these
// two values is this script's stable, VMS-owned source of truth.
// ============================================================

const QC_MONGO_URI = process.env.QC_MONGODB_URI;
const QC_DB_NAME = process.env.QC_MONGODB_DB;
if (!QC_MONGO_URI) throw new Error("QC_MONGODB_URI missing from VMS backend .env");
if (!QC_DB_NAME) throw new Error("QC_MONGODB_DB missing from VMS backend .env");

// ============================================================
// VERIFIED VMS → QC PROJECT MAPPINGS — single shared source, see
// src/utils/qcProjectMappings.js (also used by syncToQc.js's live sync,
// so the two never drift apart again).
// ============================================================

const { PROJECT_MAPPINGS, mapDrawingReviewStatus: sharedMapDrawingReviewStatus, VMS_DB_NAME } = require("../src/utils/qcProjectMappings");

// ============================================================
// HELPERS
// ============================================================

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeProjectName(value) {
  return normalize(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function makeId(prefix, sourceId) {
  return `${prefix}-VMS-${sourceId}`;
}

function resolveProject(projectName, qcProjectMap, vmsProjectId, vmsProjectById) {
  if (vmsProjectId && vmsProjectById) {
    const vmsProject = vmsProjectById.get(String(vmsProjectId));
    const code = vmsProject?.code ? String(vmsProject.code).trim() : "";
    if (code) {
      const byCode = qcProjectMap.byId.get(code);
      if (byCode) return { ...byCode, source: "existing-qc-by-code" };
    }
  }
  const normalized = normalizeProjectName(projectName);
  const existing = qcProjectMap.byName.get(normalized);
  if (existing) return { ...existing, source: "existing-qc" };
  const mapped = PROJECT_MAPPINGS[normalized];
  if (mapped) {
    return {
      id: mapped.id,
      name: mapped.name,
      proposed: Boolean(mapped.proposed),
      source: mapped.proposed ? "proposed-qc-project" : "verified-mapping",
    };
  }
  return null;
}

function resolveUser(driName, submittedBy, userMap) {
  if (driName) {
    const byName = userMap.byName.get(normalize(driName));
    if (byName) return byName;
  }
  if (submittedBy) {
    const byLegacyId = userMap.byLegacyId.get(String(submittedBy));
    if (byLegacyId) return byLegacyId;
  }
  return null;
}

function transformPhoto(photo) {
  if (!photo || !photo.url) return null;
  return { url: photo.url, publicId: photo.publicId || null };
}

function transformDpr(source, qcProjectMap, warnings, vmsProjectById, userMap) {
  const sourceId = String(source._id);
  const project = resolveProject(source.projectName, qcProjectMap, source.projectId, vmsProjectById);
  if (!project) warnings.push(`DPR ${sourceId}: project "${source.projectName}" is not mapped`);

  const user = resolveUser(source.driName, source.submittedBy, userMap);
  if (source.driName && !user) {
    warnings.push(`DPR ${sourceId}: driName "${source.driName}" could not be mapped to a QC user`);
  }

  const workEntries = Array.isArray(source.workEntries)
    ? source.workEntries.map((entry) => ({
        category: entry.workType || entry.category || "Other",
        generalPhotos: Array.isArray(entry.images) ? entry.images.map(transformPhoto).filter(Boolean) : [],
        beforePhotos: Array.isArray(entry.beforeImages) ? entry.beforeImages.map(transformPhoto).filter(Boolean) : [],
        afterPhotos: Array.isArray(entry.afterImages) ? entry.afterImages.map(transformPhoto).filter(Boolean) : [],
        ...(typeof entry.qty === "number" ? { qty: entry.qty } : {}),
        ...(entry.unit ? { unit: entry.unit } : {}),
      }))
    : [];

  return {
    sourceId,
    qcProjectId: project?.id || null,
    record: {
      id: makeId("DPR", sourceId),
      projectId: project?.id || "",
      projectName: project?.name || source.projectName || "",
      date: isoDate(source.date),
      vendorCode: source.vendorCode || "",
      vendorName: source.vendorName || "",
      shift: source.shiftType === "Night" ? "Night" : "Day",
      labourCount: Number(source.labourCount) || 0,
      workEntries,
      submittedByUserId: user?.id || null,
      submittedByName: user?.name || source.driName || "",
      isPublic: Boolean(source.isPublicSubmission),
    },
  };
}

// Thin wrapper over the shared mapper (src/utils/qcProjectMappings.js) —
// this script additionally wants a warning pushed and an "UNMAPPED" marker
// for its own dry-run report, which the shared function (used directly by
// syncToQc.js's live path) doesn't need.
function mapDrawingReviewStatusForReport(status, sourceId, warnings) {
  const mapped = sharedMapDrawingReviewStatus(status);
  if (mapped) return { value: mapped, mapping: mapped === status ? "already-qc-status" : `VMS ${status} → QC ${mapped}` };
  warnings.push(`Drawing Request ${sourceId}: reviewStatus "${status}" has no mapping`);
  return { value: "UNMAPPED", mapping: null };
}

function transformDrawingRequest(source, qcProjectMap, userMap, warnings, vmsProjectById) {
  const sourceId = String(source._id);
  const project = resolveProject(source.projectName, qcProjectMap, source.projectId, vmsProjectById);
  if (!project) warnings.push(`Drawing Request ${sourceId}: project "${source.projectName}" is not mapped`);

  const user = resolveUser(source.driName, source.submittedBy, userMap);
  if (source.submittedBy && !user) {
    warnings.push(`Drawing Request ${sourceId}: submittedBy "${source.submittedBy}" could not be mapped`);
  }

  const status = mapDrawingReviewStatusForReport(source.reviewStatus, sourceId, warnings);

  const files = Array.isArray(source.drawingFiles)
    ? source.drawingFiles
        .map((file) => ({ name: file.name || file.fileName || "Drawing", url: file.url || "", publicId: file.publicId || null }))
        .filter((file) => file.url)
    : [];

  return {
    sourceId,
    qcProjectId: project?.id || null,
    reviewStatusValue: status.value,
    record: {
      id: makeId("DR", sourceId),
      ticketNo: source.ticketNo || `DR-VMS-${sourceId}`,
      createdAt: new Date(source.createdAt || Date.now()).getTime(),
      projectId: project?.id || "",
      projectName: project?.name || source.projectName || "",
      description: source.description || "",
      drawingType: source.drawingType || "Other",
      source: source.source || "",
      requesterName: source.driName || "",
      requestedPriority: source.priority || "",
      reviewStatus: status.value,
      reviewHistory: Array.isArray(source.reviewHistory) ? source.reviewHistory : [],
      files,
      assignedTo: source.assignedTo || null,
      committedDate: source.committedDate || null,
      priority: source.priority || "",
      trackingStatus: source.status || source.trackingStatus || "pending",
      actualCompletionDate: source.actualCompletionDate || null,
      planningVerified: Boolean(source.planningVerified),
      projectAcknowledged: Boolean(source.projectAcknowledged),
      remarks: source.remarks || "",
      submittedByUserId: user?.id || null,
      isPublic: Boolean(source.isPublicSubmission),
    },
  };
}

// ============================================================
// MAIN
// ============================================================

async function run() {
  console.log("");
  console.log("==============================================");
  console.log(" VMS → QC MIGRATION — " + (APPLY ? "APPLY (WRITES ENABLED)" : "DRY RUN (NO WRITES)"));
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

    const [vmsDprs, vmsDrawings, vmsProjects] = await Promise.all([
      vmsDb.collection("dailyprogressreports").find({}).toArray(),
      vmsDb.collection("drawingrequests").find({}).toArray(),
      vmsDb.collection("projects").find({}).toArray(),
    ]);

    const [qcProjects, qcUsers, qcExistingDprs, qcExistingDrawings] = await Promise.all([
      qcDb.collection("projects").find({}).toArray(),
      qcDb.collection("users").find({}).toArray(),
      qcDb.collection("dpr").find({}, { projection: { id: 1 } }).toArray(),
      qcDb.collection("drawingRequests").find({}, { projection: { id: 1 } }).toArray(),
    ]);

    const qcProjectMap = { byId: new Map(), byName: new Map() };
    for (const project of qcProjects) {
      const id = String(project.id || project.code || project._id || "");
      const name = project.name || "";
      if (id) qcProjectMap.byId.set(id, { id, name, raw: project });
      if (name) qcProjectMap.byName.set(normalizeProjectName(name), { id, name, raw: project });
    }

    const userMap = { byName: new Map(), byLegacyId: new Map() };
    for (const user of qcUsers) {
      const id = String(user.id || user._id || "");
      const name = user.name || "";
      const mappedUser = { id, name, raw: user };
      if (name) userMap.byName.set(normalize(name), mappedUser);
      if (user.legacyId) userMap.byLegacyId.set(String(user.legacyId), mappedUser);
    }

    const vmsProjectById = new Map();
    for (const project of vmsProjects) {
      vmsProjectById.set(String(project._id), { code: project.code || "", name: project.name || "" });
    }

    const existingDprIds = new Set(qcExistingDprs.map((d) => d.id));
    const existingDrawingIds = new Set(qcExistingDrawings.map((d) => d.id));

    const warnings = [];
    const dprResults = vmsDprs.map((dpr) => transformDpr(dpr, qcProjectMap, warnings, vmsProjectById, userMap));
    const drawingResults = vmsDrawings.map((d) => transformDrawingRequest(d, qcProjectMap, userMap, warnings, vmsProjectById));

    const dprToInsert = dprResults
      .filter((item) => item.qcProjectId && !existingDprIds.has(item.record.id))
      .map((item) => item.record);
    const dprSkippedUnmapped = dprResults.filter((item) => !item.qcProjectId).length;
    const dprSkippedExisting = dprResults.filter((item) => item.qcProjectId && existingDprIds.has(item.record.id)).length;

    const drawingToInsert = drawingResults
      .filter((item) => item.qcProjectId && item.reviewStatusValue !== "UNMAPPED" && !existingDrawingIds.has(item.record.id))
      .map((item) => item.record);
    const drawingSkippedUnmapped = drawingResults.filter((item) => !item.qcProjectId || item.reviewStatusValue === "UNMAPPED").length;
    const drawingSkippedExisting = drawingResults.filter(
      (item) => item.qcProjectId && item.reviewStatusValue !== "UNMAPPED" && existingDrawingIds.has(item.record.id)
    ).length;

    console.log("----------------------------------------------");
    console.log(`DPR to insert            : ${dprToInsert.length}`);
    console.log(`DPR skipped (unmapped)    : ${dprSkippedUnmapped}`);
    console.log(`DPR skipped (already in QC): ${dprSkippedExisting}`);
    console.log(`Drawing to insert         : ${drawingToInsert.length}`);
    console.log(`Drawing skipped (unmapped): ${drawingSkippedUnmapped}`);
    console.log(`Drawing skipped (already in QC): ${drawingSkippedExisting}`);
    console.log(`Warnings                  : ${warnings.length}`);
    console.log("----------------------------------------------");

    if (warnings.length) {
      console.log("");
      console.log("WARNINGS:");
      for (const w of warnings) console.log(`  - ${w}`);
    }

    if (!APPLY) {
      console.log("");
      console.log("DRY RUN — no writes made.");
      console.log("Re-run with --apply to actually insert the above into QC.");
      console.log("");
      return;
    }

    console.log("");
    if (dprToInsert.length === 0 && drawingToInsert.length === 0) {
      console.log("Nothing to insert — all records already migrated.");
    } else {
      if (dprToInsert.length) {
        const res = await qcDb.collection("dpr").insertMany(dprToInsert, { ordered: false });
        console.log(`✓ Inserted ${res.insertedCount} DPR record(s) into QC.`);
      }
      if (drawingToInsert.length) {
        const res = await qcDb.collection("drawingRequests").insertMany(drawingToInsert, { ordered: false });
        console.log(`✓ Inserted ${res.insertedCount} Drawing Request record(s) into QC.`);
      }
    }
    console.log("");
    console.log("✓ MIGRATION COMPLETE");
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
