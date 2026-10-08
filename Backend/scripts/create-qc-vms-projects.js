const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

// ============================================================
// VMS → QC PROJECT CREATION
// ============================================================
//
// SAFE BY DEFAULT.
//
// Without --apply:
//   READ ONLY / DRY RUN
//
// With --apply:
//   Creates ONLY the 3 explicitly approved missing projects.
//
// It will NEVER:
//   - update an existing project
//   - delete anything
//   - overwrite anything
//   - create any project other than the 3 listed below
//
// ============================================================


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

if (!VMS_MONGO_URI) {
  throw new Error(
    "VMS MONGO_URI is missing from backend/.env"
  );
}

const VMS_DB_NAME = "vbp_dev";


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
    "QC MONGODB_URI is missing from project-quality/backend/.env"
  );
}

if (!QC_DB_NAME) {
  throw new Error(
    "QC MONGODB_DB is missing from project-quality/backend/.env"
  );
}


// ============================================================
// EXACT PROJECTS ALLOWED TO BE CREATED
// ============================================================
//
// These are the three VMS projects confirmed by the dry run.
//
// VMS:
//   PRJ-055 → Automated Test Project PRJ-8320
//   PRJ-057 → Automated Test Project PRJ-6176
//   PRJ-059 → Automated Test Project PRJ-4096
//
// IMPORTANT:
// Do not add another project here without deliberately changing
// the migration scope.
// ============================================================

const APPROVED_PROJECTS = [
  {
    vmsCode: "PRJ-055",
    vmsName: "Automated Test Project PRJ-8320",
    qcId: "PRJ-055"
  },
  {
    vmsCode: "PRJ-057",
    vmsName: "Automated Test Project PRJ-6176",
    qcId: "PRJ-057"
  },
  {
    vmsCode: "PRJ-059",
    vmsName: "Automated Test Project PRJ-4096",
    qcId: "PRJ-059"
  }
];


// ============================================================
// HELPERS
// ============================================================

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getProjectCode(project) {
  return String(
    project.code ||
    project.projectCode ||
    project.projectId ||
    ""
  ).trim();
}

function getProjectName(project) {
  return String(
    project.name ||
    project.projectName ||
    ""
  ).trim();
}

function getProjectId(project) {
  return String(
    project.id ||
    project.projectId ||
    project.code ||
    project._id ||
    ""
  ).trim();
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


// ============================================================
// FIND VMS PROJECT
// ============================================================

function findVmsProject(
  vmsProjects,
  expected
) {
  const exactCode =
    vmsProjects.find(
      (project) =>
        getProjectCode(project) ===
        expected.vmsCode
    );

  if (exactCode) {
    return exactCode;
  }

  const exactName =
    vmsProjects.find(
      (project) =>
        normalize(
          getProjectName(project)
        ) ===
        normalize(expected.vmsName)
    );

  return exactName || null;
}


// ============================================================
// BUILD QC PROJECT
// ============================================================
//
// We intentionally keep this object conservative.
//
// The migration only needs the verified project identity/details.
// Existing QC project records are not modified.
//
// ============================================================

function buildQcProject(
  vmsProject,
  expected
) {
  const vmsCode =
    getProjectCode(vmsProject);

  const vmsName =
    getProjectName(vmsProject);

  const vmsId =
    getProjectId(vmsProject);

  // Start with only the fields that are useful and safe
  // for the QC project master.
  //
  // Unknown VMS-only fields are NOT blindly copied.

  const qcProject = {
    id: expected.qcId,

    name:
      vmsName ||
      expected.vmsName,

    code:
      vmsCode ||
      expected.vmsCode,

    status:
      vmsProject.status ||
      "active",

    location:
      vmsProject.location ||
      "",

    projectType:
      vmsProject.projectType ||
      "",

    contractValue:
      Number(
        vmsProject.contractValue
      ) || 0,

    budget:
      Number(
        vmsProject.budget
      ) || 0,

    startDate:
      vmsProject.startDate ||
      null,

    expectedCompletionDate:
      vmsProject.expectedCompletionDate ||
      vmsProject.endDate ||
      null,

    // Migration traceability.
    // This does not affect the QC project ID.
    migrationSource:
      "VMS",

    migrationSourceId:
      vmsId,

    migrationSourceCode:
      vmsCode
  };

  return qcProject;
}


// ============================================================
// MAIN
// ============================================================

async function run() {
  const APPLY =
    process.argv.includes(
      "--apply"
    );

  console.log("");
  console.log(
    "================================================"
  );
  console.log(
    " VMS → QC PROJECT CREATION"
  );
  console.log(
    "================================================"
  );
  console.log("");

  if (APPLY) {
    console.log(
      "MODE: APPLY — DATABASE WRITES ENABLED"
    );
  } else {
    console.log(
      "MODE: DRY RUN — NO DATABASE WRITES"
    );
  }

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
    // ========================================================
    // CONNECT
    // ========================================================

    await vmsClient.connect();

    console.log(
      "✓ Connected to VMS"
    );

    await qcClient.connect();

    console.log(
      "✓ Connected to QC"
    );

    console.log("");

    const vmsDb =
      vmsClient.db(
        VMS_DB_NAME
      );

    const qcDb =
      qcClient.db(
        QC_DB_NAME
      );

    const vmsProjectsCollection =
      vmsDb.collection(
        "projects"
      );

    const qcProjectsCollection =
      qcDb.collection(
        "projects"
      );

    // ========================================================
    // READ PROJECTS
    // ========================================================

    const vmsProjects =
      await vmsProjectsCollection
        .find({})
        .toArray();

    const qcProjects =
      await qcProjectsCollection
        .find({})
        .toArray();

    console.log(
      `VMS Projects : ${vmsProjects.length}`
    );

    console.log(
      `QC Projects  : ${qcProjects.length}`
    );

    console.log("");

    // ========================================================
    // BUILD QC INDEXES
    // ========================================================

    const qcById =
      new Map();

    const qcByCode =
      new Map();

    const qcByName =
      new Map();

    for (
      const project of qcProjects
    ) {
      const id =
        String(
          project.id ||
          ""
        ).trim();

      const code =
        getProjectCode(project);

      const name =
        getProjectName(project);

      if (id) {
        qcById.set(
          id,
          project
        );
      }

      if (code) {
        qcByCode.set(
          normalize(code),
          project
        );
      }

      if (name) {
        qcByName.set(
          normalize(name),
          project
        );
      }
    }

    // ========================================================
    // VERIFY ALL 3 VMS PROJECTS EXIST
    // ========================================================

    const sourceProjects = [];

    for (
      const expected of APPROVED_PROJECTS
    ) {
      const source =
        findVmsProject(
          vmsProjects,
          expected
        );

      if (!source) {
        throw new Error(
          `STOP: VMS project not found: ${expected.vmsCode} | ${expected.vmsName}`
        );
      }

      sourceProjects.push({
        expected,
        source
      });
    }

    console.log(
      "✓ All 3 approved VMS projects found"
    );

    console.log("");

    // ========================================================
    // BUILD CANDIDATES
    // ========================================================

    const candidates = [];

    for (
      const {
        expected,
        source
      } of sourceProjects
    ) {
      const qcByExpectedId =
        qcById.get(
          expected.qcId
        );

      const qcByExpectedCode =
        qcByCode.get(
          normalize(
            expected.qcId
          )
        );

      const qcByExpectedName =
        qcByName.get(
          normalize(
            expected.vmsName
          )
        );

      const existing =
        qcByExpectedId ||
        qcByExpectedCode ||
        qcByExpectedName ||
        null;

      const qcProject =
        buildQcProject(
          source,
          expected
        );

      candidates.push({
        expected,
        source,
        existing,
        qcProject
      });
    }

    // ========================================================
    // SAFETY CHECK
    // ========================================================

    const alreadyExisting =
      candidates.filter(
        (item) =>
          item.existing
      );

    if (
      alreadyExisting.length
    ) {
      console.log(
        "EXISTING / CONFLICTING PROJECTS:"
      );

      for (
        const item of alreadyExisting
      ) {
        console.log(
          `  - ${item.expected.qcId} | ${item.expected.vmsName}`
        );

        console.log(
          `    Existing QC id   : ${item.existing.id || "(none)"}`
        );

        console.log(
          `    Existing QC name : ${item.existing.name || "(none)"}`
        );
      }

      console.log("");

      throw new Error(
        "STOP: One or more target projects already exist in QC. Nothing was changed."
      );
    }

    // ========================================================
    // SHOW EXACT CREATE LIST
    // ========================================================

    console.log(
      "PROJECTS TO CREATE:"
    );

    console.log("");

    for (
      const item of candidates
    ) {
      const p =
        item.qcProject;

      console.log(
        `  ${p.id} | ${p.name}`
      );

      console.log(
        `    code       : ${p.code}`
      );

      console.log(
        `    status     : ${p.status}`
      );

      console.log(
        `    location   : ${p.location || "(blank)"}`
      );

      console.log(
        `    type       : ${p.projectType || "(blank)"}`
      );

      console.log(
        `    contract   : ${p.contractValue}`
      );

      console.log(
        `    budget     : ${p.budget}`
      );

      console.log(
        `    startDate  : ${p.startDate || "(blank)"}`
      );

      console.log(
        `    completion : ${p.expectedCompletionDate || "(blank)"}`
      );

      console.log("");
    }

    // ========================================================
    // DRY RUN STOP
    // ========================================================

    if (!APPLY) {
      console.log(
        "================================================"
      );

      console.log(
        "DRY RUN COMPLETE"
      );

      console.log(
        "NO DATABASE DATA WAS CHANGED"
      );

      console.log(
        "================================================"
      );

      console.log("");

      console.log(
        "If the above 3 projects are correct, run:"
      );

      console.log("");

      console.log(
        "node scripts\\create-qc-vms-projects.js --apply"
      );

      console.log("");

      return;
    }

    // ========================================================
    // FINAL SAFETY RECHECK
    // ========================================================
    //
    // Re-read QC immediately before writes.
    // This protects against someone creating one of these projects
    // between the first check and --apply.
    // ========================================================

    const qcProjectsBeforeWrite =
      await qcProjectsCollection
        .find({})
        .toArray();

    const existingIds =
      new Set(
        qcProjectsBeforeWrite
          .map(
            (p) =>
              String(
                p.id || ""
              ).trim()
          )
          .filter(Boolean)
      );

    const existingNames =
      new Set(
        qcProjectsBeforeWrite
          .map(
            (p) =>
              normalize(
                getProjectName(p)
              )
          )
          .filter(Boolean)
      );

    for (
      const item of candidates
    ) {
      const id =
        item.qcProject.id;

      const name =
        normalize(
          item.qcProject.name
        );

      if (
        existingIds.has(id) ||
        existingNames.has(name)
      ) {
        throw new Error(
          `STOP: Target appeared in QC before write: ${id} | ${item.qcProject.name}. Nothing was changed by this script.`
        );
      }
    }

    // ========================================================
    // WRITE — ONLY 3 INSERTS
    // ========================================================

    console.log(
      "Writing exactly 3 new QC projects..."
    );

    console.log("");

    const insertResult =
      await qcProjectsCollection.insertMany(
        candidates.map(
          (item) =>
            clone(
              item.qcProject
            )
        ),
        {
          ordered: true
        }
      );

    console.log(
      `✓ Inserted: ${insertResult.insertedCount}/3`
    );

    // ========================================================
    // VERIFY INSERTS
    // ========================================================

    const created =
      await qcProjectsCollection
        .find({
          id: {
            $in:
              APPROVED_PROJECTS.map(
                (p) =>
                  p.qcId
              )
          }
        })
        .toArray();

    console.log("");

    console.log(
      `QC project verification: ${created.length}/3`
    );

    for (
      const expected of APPROVED_PROJECTS
    ) {
      const found =
        created.find(
          (p) =>
            p.id ===
            expected.qcId
        );

      if (!found) {
        throw new Error(
          `POST-WRITE VERIFICATION FAILED: ${expected.qcId}`
        );
      }

      console.log(
        `  ✓ ${found.id} | ${found.name}`
      );
    }

    console.log("");

    console.log(
      "================================================"
    );

    console.log(
      "PROJECT CREATION COMPLETE"
    );

    console.log(
      "================================================"
    );

    console.log("");

    console.log(
      "Created exactly 3 QC projects."
    );

    console.log(
      "No existing QC project was updated."
    );

    console.log(
      "No QC project was deleted."
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
      "PROJECT CREATION FAILED / STOPPED"
    );
    console.error("");
    console.error(
      error.message
    );
    console.error("");

    process.exit(1);
  }
);