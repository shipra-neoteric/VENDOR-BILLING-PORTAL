const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

// ============================================================
// LOAD VMS ENV
// ============================================================

const vmsEnvPath = path.join(
  __dirname,
  "..",
  ".env"
);

const vmsEnv = dotenv.config({
  path: vmsEnvPath
});

if (vmsEnv.error) {
  throw new Error(
    `Could not load VMS .env: ${vmsEnvPath}`
  );
}

const VMS_MONGO_URI = process.env.MONGO_URI;
const VMS_DB_NAME = "vbp";

if (!VMS_MONGO_URI) {
  throw new Error(
    "VMS MONGO_URI missing from VMS backend .env"
  );
}

// ============================================================
// LOAD QC ENV
// ============================================================

const qcEnvPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "project-quality",
  "backend",
  ".env"
);

const qcEnv = dotenv.config({
  path: qcEnvPath,
  override: true
});

if (qcEnv.error) {
  throw new Error(
    `Could not load QC .env: ${qcEnvPath}`
  );
}

const QC_MONGO_URI = process.env.MONGODB_URI;
const QC_DB_NAME = process.env.MONGODB_DB;

if (!QC_MONGO_URI) {
  throw new Error(
    "QC MONGODB_URI missing from project-quality/backend/.env"
  );
}

if (!QC_DB_NAME) {
  throw new Error(
    "QC MONGODB_DB missing from project-quality/backend/.env"
  );
}

// ============================================================
// VERIFIED VMS → QC PROJECT MAPPINGS
// ============================================================

const PROJECT_MAPPINGS = {
  "garden city villa extension": {
    id: "PRJ-027",
    name: "Garden city Villa Extension"
  },

  "hyde park": {
    id: "PRJ-012",
    name: "Hyde park"
  },

  "milestone": {
    id: "PRJ-039",
    name: "Milestone"
  },

  "ng grande": {
    id: "PRJ-040",
    name: "NG Grande"
  },

  "nature park hotel": {
    id: "PRJ-001",
    name: "Nature park Hotel"
  },

  "zen garden": {
    id: "PRJ-013",
    name: "Zen Garden"
  },

  // ----------------------------------------------------------
  // VMS PROJECTS THAT DO NOT CURRENTLY EXIST IN QC
  // ----------------------------------------------------------

  "automated test project prj 8320": {
    id: "PRJ-055",
    name: "Automated Test Project PRJ-8320",
    proposed: true,
    vmsCode: "PRJ-055"
  },

  "automated test project prj 6176": {
    id: "PRJ-057",
    name: "Automated Test Project PRJ-6176",
    proposed: true,
    vmsCode: "PRJ-057"
  },

  "automated test project prj 4096": {
    id: "PRJ-059",
    name: "Automated Test Project PRJ-4096",
    proposed: true,
    vmsCode: "PRJ-059"
  }
};

// ============================================================
// NORMALIZATION
// ============================================================

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeProjectName(value) {
  return normalize(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function makeId(prefix, sourceId) {
  return `${prefix}-VMS-${sourceId}`;
}

function unique(values) {
  return [...new Set(values)];
}

// ============================================================
// PROJECT RESOLUTION
// ============================================================

function resolveProject(
  projectName,
  qcProjectMap,
  vmsProjectId,
  vmsProjectById
) {
  // Authoritative check first: the VMS project's own `code` (e.g. PRJ-011)
  // is stable even when a DPR/Drawing's snapshotted projectName text isn't —
  // some older documents kept a renamed project's old display name (e.g.
  // "Regal Garden Villa - West Gate" vs the project's current "West Gate"),
  // which a pure name match would wrongly report as unmapped even though
  // it's the exact same project, already in QC under its code/id.
  if (vmsProjectId && vmsProjectById) {
    const vmsProject = vmsProjectById.get(String(vmsProjectId));
    const code = vmsProject?.code ? String(vmsProject.code).trim() : "";
    if (code) {
      const byCode = qcProjectMap.byId.get(code);
      if (byCode) {
        return {
          ...byCode,
          source: "existing-qc-by-code"
        };
      }
    }
  }

  const normalized =
    normalizeProjectName(projectName);

  // First check actual QC projects
  const existing =
    qcProjectMap.byName.get(normalized);

  if (existing) {
    return {
      ...existing,
      source: "existing-qc"
    };
  }

  // Then check verified/proposed mapping
  const mapped =
    PROJECT_MAPPINGS[normalized];

  if (mapped) {
    return {
      id: mapped.id,
      name: mapped.name,
      proposed: Boolean(mapped.proposed),
      vmsCode: mapped.vmsCode || null,
      source: mapped.proposed
        ? "proposed-qc-project"
        : "verified-mapping"
    };
  }

  return null;
}

// ============================================================
// USER RESOLUTION
// ============================================================

function resolveUser(
  driName,
  submittedBy,
  userMap
) {
  if (driName) {
    const byName =
      userMap.byName.get(
        normalize(driName)
      );

    if (byName) {
      return byName;
    }
  }

  if (submittedBy) {
    const byLegacyId =
      userMap.byLegacyId.get(
        String(submittedBy)
      );

    if (byLegacyId) {
      return byLegacyId;
    }
  }

  return null;
}

// ============================================================
// PHOTO TRANSFORMATION
// ============================================================

function transformPhoto(photo) {
  if (!photo || !photo.url) {
    return null;
  }

  return {
    url: photo.url,
    publicId: photo.publicId || null
  };
}

// ============================================================
// DPR TRANSFORMATION
// ============================================================

function transformDpr(
  source,
  qcProjectMap,
  warnings,
  vmsProjectById,
  userMap
) {
  const sourceId =
    String(source._id);

  const project =
    resolveProject(
      source.projectName,
      qcProjectMap,
      source.projectId,
      vmsProjectById
    );

  if (!project) {
    warnings.push(
      `DPR ${sourceId}: project "${source.projectName}" is not mapped`
    );
  }

  // QC's DailyProgressReport type requires submittedByUserId/submittedByName
  // (frontend/src/types/index.ts) — the dry-run's own record never set
  // these, so this was always going to silently land as a blank submitter.
  const user =
    resolveUser(
      source.driName,
      source.submittedBy,
      userMap
    );

  if (source.driName && !user) {
    warnings.push(
      `DPR ${sourceId}: driName "${source.driName}" could not be mapped to a QC user`
    );
  }

  const workEntries =
    Array.isArray(source.workEntries)
      ? source.workEntries.map(
          (entry) => ({
            category:
              entry.workType ||
              entry.category ||
              "Other",

            generalPhotos:
              Array.isArray(entry.images)
                ? entry.images
                    .map(transformPhoto)
                    .filter(Boolean)
                : [],

            beforePhotos:
              Array.isArray(entry.beforeImages)
                ? entry.beforeImages
                    .map(transformPhoto)
                    .filter(Boolean)
                : [],

            afterPhotos:
              Array.isArray(entry.afterImages)
                ? entry.afterImages
                    .map(transformPhoto)
                    .filter(Boolean)
                : [],

            ...(typeof entry.qty === "number"
              ? { qty: entry.qty }
              : {}),

            ...(entry.unit
              ? { unit: entry.unit }
              : {})
          })
        )
      : [];

  return {
    sourceId,

    sourceProjectId:
      String(source.projectId || ""),

    sourceProjectName:
      source.projectName || "",

    qcProjectId:
      project?.id || null,

    qcProjectName:
      project?.name || null,

    projectMappingSource:
      project?.source || null,

    record: {
      id: makeId(
        "DPR",
        sourceId
      ),

      projectId:
        project?.id || "",

      projectName:
        project?.name ||
        source.projectName ||
        "",

      date:
        isoDate(source.date),

      vendorCode:
        source.vendorCode || "",

      vendorName:
        source.vendorName || "",

      shift:
        source.shiftType === "Night"
          ? "Night"
          : "Day",

      labourCount:
        Number(source.labourCount) || 0,

      workEntries,

      submittedByUserId:
        user?.id || null,

      submittedByName:
        user?.name ||
        source.driName ||
        "",

      isPublic:
        Boolean(
          source.isPublicSubmission
        )
    }
  };
}

// ============================================================
// DRAWING REQUEST STATUS MAPPING
// ============================================================

function mapDrawingReviewStatus(
  status,
  sourceId,
  warnings
) {
  // Already-valid QC statuses
  const validQcStatuses = new Set([
    "stage-1-screen",
    "stage-2-produce",
    "stage-3-crosscheck",
    "stage-4-final-approve",
    "approved",
    "returned"
  ]);

  if (validQcStatuses.has(status)) {
    return {
      value: status,
      mapping: "already-qc-status"
    };
  }

  // Verified migration mapping
  if (status === "l1-gm") {
    return {
      value: "stage-1-screen",
      mapping: "VMS l1-gm → QC stage-1-screen"
    };
  }

  // l1-gm (GM) already maps to QC's first stage — l2-architect is VMS's
  // next review level up from that, so it lines up with QC's next stage
  // (stage-2-produce), not any later one.
  if (status === "l2-architect") {
    return {
      value: "stage-2-produce",
      mapping: "VMS l2-architect → QC stage-2-produce"
    };
  }

  warnings.push(
    `Drawing Request ${sourceId}: reviewStatus "${status}" has no mapping`
  );

  return {
    value: "UNMAPPED",
    mapping: null
  };
}

// ============================================================
// DRAWING REQUEST TRANSFORMATION
// ============================================================

function transformDrawingRequest(
  source,
  qcProjectMap,
  userMap,
  warnings,
  vmsProjectById
) {
  const sourceId =
    String(source._id);

  const project =
    resolveProject(
      source.projectName,
      qcProjectMap,
      source.projectId,
      vmsProjectById
    );

  if (!project) {
    warnings.push(
      `Drawing Request ${sourceId}: project "${source.projectName}" is not mapped`
    );
  }

  const user =
    resolveUser(
      source.driName,
      source.submittedBy,
      userMap
    );

  if (
    source.submittedBy &&
    !user
  ) {
    warnings.push(
      `Drawing Request ${sourceId}: submittedBy "${source.submittedBy}" could not be mapped`
    );
  }

  const status =
    mapDrawingReviewStatus(
      source.reviewStatus,
      sourceId,
      warnings
    );

  const files =
    Array.isArray(
      source.drawingFiles
    )
      ? source.drawingFiles
          .map((file) => ({
            name:
              file.name ||
              file.fileName ||
              "Drawing",

            url:
              file.url || "",

            publicId:
              file.publicId || null
          }))
          .filter(
            (file) => file.url
          )
      : [];

  return {
    sourceId,

    sourceProjectId:
      String(source.projectId || ""),

    sourceProjectName:
      source.projectName || "",

    sourceDriName:
      source.driName || "",

    sourceSubmittedBy:
      String(source.submittedBy || ""),

    sourceReviewStatus:
      source.reviewStatus || "",

    qcProjectId:
      project?.id || null,

    qcProjectName:
      project?.name || null,

    projectMappingSource:
      project?.source || null,

    qcUserId:
      user?.id || null,

    qcUserName:
      user?.name || null,

    reviewStatusMapping:
      status.mapping,

    record: {
      id: makeId(
        "DR",
        sourceId
      ),

      ticketNo:
        source.ticketNo ||
        `DR-VMS-${sourceId}`,

      createdAt:
        new Date(
          source.createdAt ||
          Date.now()
        ).getTime(),

      projectId:
        project?.id || "",

      projectName:
        project?.name ||
        source.projectName ||
        "",

      description:
        source.description || "",

      drawingType:
        source.drawingType ||
        "Other",

      source:
        source.source || "",

      requesterName:
        source.driName || "",

      requestedPriority:
        source.priority || "",

      reviewStatus:
        status.value,

      reviewHistory:
        Array.isArray(
          source.reviewHistory
        )
          ? source.reviewHistory
          : [],

      files,

      assignedTo:
        source.assignedTo || null,

      committedDate:
        source.committedDate || null,

      priority:
        source.priority || "",

      trackingStatus:
        source.status ||
        source.trackingStatus ||
        "pending",

      actualCompletionDate:
        source.actualCompletionDate ||
        null,

      planningVerified:
        Boolean(
          source.planningVerified
        ),

      projectAcknowledged:
        Boolean(
          source.projectAcknowledged
        ),

      remarks:
        source.remarks || "",

      submittedByUserId:
        user?.id || null,

      isPublic:
        Boolean(
          source.isPublicSubmission
        )
    }
  };
}

// ============================================================
// MAIN
// ============================================================

async function run() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    " VMS → QC MIGRATION DRY RUN v2"
  );
  console.log(
    "=============================================="
  );
  console.log("");
  console.log(
    "READ ONLY — NO DATABASE WRITES"
  );
  console.log("");

  const vmsClient =
    new MongoClient(
      VMS_MONGO_URI
    );

  const qcClient =
    new MongoClient(
      QC_MONGO_URI
    );

  try {
    await vmsClient.connect();
    console.log(
      "✓ Connected to VMS"
    );

    await qcClient.connect();
    console.log(
      "✓ Connected to QC"
    );

    const vmsDb =
      vmsClient.db(
        VMS_DB_NAME
      );

    const qcDb =
      qcClient.db(
        QC_DB_NAME
      );

    console.log("");

    // ========================================================
    // READ VMS
    // ========================================================

    const [
      vmsDprs,
      vmsDrawings,
      vmsProjects
    ] = await Promise.all([
      vmsDb
        .collection(
          "dailyprogressreports"
        )
        .find({})
        .toArray(),

      vmsDb
        .collection(
          "drawingrequests"
        )
        .find({})
        .toArray(),

      vmsDb
        .collection(
          "projects"
        )
        .find({})
        .toArray()
    ]);

    // ========================================================
    // READ QC
    // ========================================================

    const [
      qcProjects,
      qcUsers
    ] = await Promise.all([
      qcDb
        .collection(
          "projects"
        )
        .find({})
        .toArray(),

      qcDb
        .collection(
          "users"
        )
        .find({})
        .toArray()
    ]);

    console.log(
      `VMS DPRs             : ${vmsDprs.length}`
    );

    console.log(
      `VMS Drawing Requests : ${vmsDrawings.length}`
    );

    console.log(
      `VMS Projects         : ${vmsProjects.length}`
    );

    console.log(
      `QC Projects          : ${qcProjects.length}`
    );

    console.log(
      `QC Users             : ${qcUsers.length}`
    );

    console.log("");

    // ========================================================
    // QC PROJECT MAP
    // ========================================================

    const qcProjectMap = {
      byId: new Map(),
      byName: new Map()
    };

    for (
      const project of qcProjects
    ) {
      const id =
        String(
          project.id ||
          project.code ||
          project._id ||
          ""
        );

      const name =
        project.name || "";

      if (id) {
        qcProjectMap.byId.set(
          id,
          {
            id,
            name,
            raw: project
          }
        );
      }

      if (name) {
        qcProjectMap.byName.set(
          normalizeProjectName(name),
          {
            id,
            name,
            raw: project
          }
        );
      }
    }

    // ========================================================
    // QC USER MAP
    // ========================================================

    const userMap = {
      byName: new Map(),
      byLegacyId: new Map()
    };

    for (
      const user of qcUsers
    ) {
      const id =
        String(
          user.id ||
          user._id ||
          ""
        );

      const name =
        user.name || "";

      const mappedUser = {
        id,
        name,
        raw: user
      };

      if (name) {
        userMap.byName.set(
          normalize(name),
          mappedUser
        );
      }

      if (user.legacyId) {
        userMap.byLegacyId.set(
          String(user.legacyId),
          mappedUser
        );
      }
    }

    // ========================================================
    // TRANSFORM
    // ========================================================

    const warnings = [];

    // VMS project _id → its own `code` (e.g. PRJ-011) — the authoritative
    // cross-reference resolveProject uses before falling back to matching
    // the DPR/Drawing's own (sometimes stale) projectName text.
    const vmsProjectById = new Map();
    for (const project of vmsProjects) {
      vmsProjectById.set(String(project._id), {
        code: project.code || "",
        name: project.name || "",
      });
    }

    const dprResults =
      vmsDprs.map(
        (dpr) =>
          transformDpr(
            dpr,
            qcProjectMap,
            warnings,
            vmsProjectById,
            userMap
          )
      );

    const drawingResults =
      vmsDrawings.map(
        (drawing) =>
          transformDrawingRequest(
            drawing,
            qcProjectMap,
            userMap,
            warnings,
            vmsProjectById
          )
      );

    // ========================================================
    // SUMMARY
    // ========================================================

    const dprReady =
      dprResults.filter(
        (item) =>
          item.qcProjectId
      );

    const dprUnmapped =
      dprResults.filter(
        (item) =>
          !item.qcProjectId
      );

    const drawingReady =
      drawingResults.filter(
        (item) =>
          item.qcProjectId &&
          item.record.reviewStatus !==
            "UNMAPPED"
      );

    const drawingUnmapped =
      drawingResults.filter(
        (item) =>
          !item.qcProjectId
      );

    const statusUnmapped =
      drawingResults.filter(
        (item) =>
          item.record.reviewStatus ===
          "UNMAPPED"
      );

    // ========================================================
    // PROPOSED PROJECTS
    // ========================================================

    // Static PROJECT_MAPPINGS flags (proposed: true) never checked live QC
    // data — this always listed these 3 as "proposed" even after they were
    // actually created in QC, since nothing here re-queried qcProjectMap.
    // Filtering by qcProjectMap.byId/byName makes this reflect QC's real,
    // current state instead of the hardcoded mapping table.
    const proposedProjects =
      Object.entries(
        PROJECT_MAPPINGS
      )
        .filter(
          ([, mapping]) =>
            mapping.proposed &&
            !qcProjectMap.byId.has(mapping.id) &&
            !qcProjectMap.byName.has(normalizeProjectName(mapping.name))
        )
        .map(
          ([sourceName, mapping]) => ({
            sourceProjectName:
              mapping.name,

            qcProjectId:
              mapping.id,

            qcProjectName:
              mapping.name,

            vmsCode:
              mapping.vmsCode,

            sourceName
          })
        );

    // ========================================================
    // REPORT
    // ========================================================

    const report = {
      dryRun: true,

      version: 2,

      generatedAt:
        new Date().toISOString(),

      source: {
        database:
          VMS_DB_NAME,

        dprCount:
          vmsDprs.length,

        drawingRequestCount:
          vmsDrawings.length,

        projectCount:
          vmsProjects.length
      },

      target: {
        database:
          QC_DB_NAME,

        existingProjectCount:
          qcProjects.length,

        userCount:
          qcUsers.length,

        dprCollection:
          "dpr",

        drawingRequestCollection:
          "drawingRequests"
      },

      summary: {
        dprSource:
          vmsDprs.length,

        dprReady:
          dprReady.length,

        dprUnmapped:
          dprUnmapped.length,

        drawingRequestSource:
          vmsDrawings.length,

        drawingRequestReady:
          drawingReady.length,

        drawingRequestUnmapped:
          drawingUnmapped.length,

        drawingStatusUnmapped:
          statusUnmapped.length,

        proposedProjects:
          proposedProjects.length,

        warnings:
          warnings.length
      },

      proposedProjects,

      dpr:
        dprResults,

      drawingRequests:
        drawingResults,

      warnings
    };

    // ========================================================
    // SAVE REPORT
    // ========================================================

    const reportDir =
      path.join(
        __dirname,
        "..",
        "reports"
      );

    fs.mkdirSync(
      reportDir,
      {
        recursive: true
      }
    );

    const reportPath =
      path.join(
        reportDir,
        "vms-to-qc-dry-run-v2.json"
      );

    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        report,
        null,
        2
      ),
      "utf8"
    );

    // ========================================================
    // CONSOLE SUMMARY
    // ========================================================

    console.log(
      "----------------------------------------------"
    );

    console.log(
      `DPR ready              : ${dprReady.length}/${vmsDprs.length}`
    );

    console.log(
      `DPR project unmatched  : ${dprUnmapped.length}`
    );

    console.log(
      `Drawing ready          : ${drawingReady.length}/${vmsDrawings.length}`
    );

    console.log(
      `Drawing project unmatched : ${drawingUnmapped.length}`
    );

    console.log(
      `Drawing status unmapped   : ${statusUnmapped.length}`
    );

    console.log(
      `Proposed QC projects     : ${proposedProjects.length}`
    );

    console.log(
      `Warnings                 : ${warnings.length}`
    );

    console.log(
      "----------------------------------------------"
    );

    if (
      proposedProjects.length
    ) {
      console.log("");
      console.log(
        "PROPOSED QC PROJECTS:"
      );

      for (
        const project of proposedProjects
      ) {
        console.log(
          `  - ${project.qcProjectId} | ${project.qcProjectName}`
        );
      }
    }

    if (
      drawingResults.length
    ) {
      console.log("");
      console.log(
        "DRAWING REQUEST STATUS MAPPINGS:"
      );

      for (
        const item of drawingResults
      ) {
        console.log(
          `  - ${item.sourceId} | ${item.sourceReviewStatus} → ${item.record.reviewStatus}`
        );
      }
    }

    if (
      dprUnmapped.length
    ) {
      console.log("");
      console.log(
        "UNMAPPED DPR PROJECTS:"
      );

      for (
        const item of dprUnmapped
      ) {
        console.log(
          `  - ${item.sourceProjectName}`
        );
      }
    }

    if (
      drawingUnmapped.length
    ) {
      console.log("");
      console.log(
        "UNMAPPED DRAWING PROJECTS:"
      );

      for (
        const item of drawingUnmapped
      ) {
        console.log(
          `  - ${item.sourceProjectName}`
        );
      }
    }

    if (
      statusUnmapped.length
    ) {
      console.log("");
      console.log(
        "UNMAPPED DRAWING STATUSES:"
      );

      for (
        const item of statusUnmapped
      ) {
        console.log(
          `  - ${item.sourceId} | ${item.sourceReviewStatus}`
        );
      }
    }

    console.log("");
    console.log(
      `Report: ${reportPath}`
    );

    console.log("");
    console.log(
      "✓ DRY RUN COMPLETE"
    );

    console.log(
      "✓ NO MONGODB DATA WAS CHANGED"
    );

    console.log("");
  } finally {
    await vmsClient.close();
    await qcClient.close();
  }
}

// ============================================================
// RUN
// ============================================================

run().catch(
  (error) => {
    console.error("");
    console.error(
      "DRY RUN FAILED"
    );
    console.error(error);
    process.exit(1);
  }
);