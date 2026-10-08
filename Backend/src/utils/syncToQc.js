const { MongoClient } = require('mongodb');

// Pushes a single, just-created VMS Daily Progress Report or Drawing Request
// straight into QC's `dpr`/`drawingRequests` collections, live — a stopgap
// for the migration period while DRIs are still filing on VMS instead of QC
// directly (see QcMigrationNotice.tsx). Mirrors scripts/vms-to-qc-migrate.js's
// own mapping logic (project resolution by code first then name, DRI name
// resolution, l1-gm/l2-architect status mapping) but scoped to one record
// instead of scanning the whole history — that bulk script stays the
// correct tool for backfilling anything this live path ever misses.
//
// Fire-and-forget: a QC-side outage or an unmapped project/DRI must never
// fail the VMS submission itself — every caller catches/logs and moves on;
// the record just waits for the next manual backfill run instead.
// Idempotent: same DPR-VMS-<id>/DR-VMS-<id> ids as the bulk script, so a
// retry (or the live push racing a later backfill) never double-inserts.

let warnedMissingConfig = false;

function qcConfigOrNull() {
  const uri = process.env.QC_MONGODB_URI;
  const dbName = process.env.QC_MONGODB_DB;
  if (!uri || !dbName) {
    if (!warnedMissingConfig) {
      console.warn('[syncToQc] QC_MONGODB_URI/QC_MONGODB_DB not set — skipping live QC sync');
      warnedMissingConfig = true;
    }
    return null;
  }
  return { uri, dbName };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeProjectName(value) {
  return normalize(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Same verified name->id fallback as scripts/vms-to-qc-migrate.js, for a
// project that's been renamed on QC's side and has no project-code match
// (e.g. newly created QC-only project codes aren't known here yet).
const PROJECT_MAPPINGS = {
  'garden city villa extension': { id: 'PRJ-027', name: 'Garden city Villa Extension' },
  'hyde park': { id: 'PRJ-012', name: 'Hyde park' },
  'milestone': { id: 'PRJ-039', name: 'Milestone' },
  'ng grande': { id: 'PRJ-040', name: 'NG Grande' },
  'nature park hotel': { id: 'PRJ-001', name: 'Nature park Hotel' },
  'zen garden': { id: 'PRJ-013', name: 'Zen Garden' },
};

async function resolveProject(qcDb, projectName, projectCode) {
  const qcProjects = await qcDb.collection('projects').find({}).toArray();
  if (projectCode) {
    const byCode = qcProjects.find((p) => String(p.id || p.code || '').trim() === String(projectCode).trim());
    if (byCode) return { id: String(byCode.id || byCode.code), name: byCode.name || projectName };
  }
  const normalized = normalizeProjectName(projectName);
  const byName = qcProjects.find((p) => normalizeProjectName(p.name || '') === normalized);
  if (byName) return { id: String(byName.id || byName.code), name: byName.name };
  const mapped = PROJECT_MAPPINGS[normalized];
  if (mapped) return mapped;
  return null;
}

async function resolveUser(qcDb, driName) {
  if (!driName) return null;
  const qcUsers = await qcDb.collection('users').find({}).toArray();
  const match = qcUsers.find((u) => normalize(u.name) === normalize(driName));
  return match ? { id: String(match.id || match._id), name: match.name } : null;
}

function makeId(prefix, sourceId) {
  return `${prefix}-VMS-${sourceId}`;
}

async function syncDprToQc(report) {
  const cfg = qcConfigOrNull();
  if (!cfg) return;
  const client = new MongoClient(cfg.uri);
  try {
    await client.connect();
    const qcDb = client.db(cfg.dbName);
    const sourceId = String(report._id);
    const id = makeId('DPR', sourceId);

    const existing = await qcDb.collection('dpr').findOne({ id });
    if (existing) return;

    const project = await resolveProject(qcDb, report.projectName, report.projectCode);
    if (!project) {
      console.warn(`[syncToQc] DPR ${sourceId}: project "${report.projectName}" not mapped on QC yet — skipped, will need a backfill run`);
      return;
    }
    const user = await resolveUser(qcDb, report.driName);

    const workEntries = Array.isArray(report.workEntries)
      ? report.workEntries.map((entry) => ({
          category: entry.workType || entry.category || 'Other',
          generalPhotos: Array.isArray(entry.images) ? entry.images.filter((p) => p && p.url).map((p) => ({ url: p.url, publicId: p.publicId || null })) : [],
          beforePhotos: Array.isArray(entry.beforeImages) ? entry.beforeImages.filter((p) => p && p.url).map((p) => ({ url: p.url, publicId: p.publicId || null })) : [],
          afterPhotos: Array.isArray(entry.afterImages) ? entry.afterImages.filter((p) => p && p.url).map((p) => ({ url: p.url, publicId: p.publicId || null })) : [],
          ...(typeof entry.qty === 'number' ? { qty: entry.qty } : {}),
          ...(entry.unit ? { unit: entry.unit } : {}),
        }))
      : [];

    await qcDb.collection('dpr').insertOne({
      id,
      projectId: project.id,
      projectName: project.name,
      date: report.date ? new Date(report.date).toISOString() : null,
      vendorCode: report.vendorCode || '',
      vendorName: report.vendorName || '',
      shift: report.shiftType === 'Night' ? 'Night' : 'Day',
      labourCount: Number(report.labourCount) || 0,
      workEntries,
      submittedByUserId: user?.id || null,
      submittedByName: user?.name || report.driName || '',
      isPublic: Boolean(report.isPublicSubmission),
    });
  } catch (err) {
    console.error('[syncToQc] failed to sync DPR', report._id, err.message);
  } finally {
    await client.close().catch(() => {});
  }
}

function mapDrawingReviewStatus(status) {
  const validQcStatuses = new Set(['stage-1-screen', 'stage-2-produce', 'stage-3-crosscheck', 'stage-4-final-approve', 'approved', 'returned']);
  if (validQcStatuses.has(status)) return status;
  if (status === 'l1-gm') return 'stage-1-screen';
  if (status === 'l2-architect') return 'stage-2-produce';
  return null;
}

async function syncDrawingRequestToQc(request) {
  const cfg = qcConfigOrNull();
  if (!cfg) return;
  const client = new MongoClient(cfg.uri);
  try {
    await client.connect();
    const qcDb = client.db(cfg.dbName);
    const sourceId = String(request._id);
    const id = makeId('DR', sourceId);

    const existing = await qcDb.collection('drawingRequests').findOne({ id });
    if (existing) return;

    const project = await resolveProject(qcDb, request.projectName, request.projectCode);
    if (!project) {
      console.warn(`[syncToQc] Drawing Request ${sourceId}: project "${request.projectName}" not mapped on QC yet — skipped, will need a backfill run`);
      return;
    }
    const statusValue = mapDrawingReviewStatus(request.reviewStatus) || 'stage-1-screen';

    const files = Array.isArray(request.drawingFiles)
      ? request.drawingFiles.map((f) => ({ name: f.name || f.fileName || 'Drawing', url: f.url || '', publicId: f.publicId || null })).filter((f) => f.url)
      : [];

    await qcDb.collection('drawingRequests').insertOne({
      id,
      ticketNo: request.ticketNo || `DR-VMS-${sourceId}`,
      createdAt: new Date(request.createdAt || Date.now()).getTime(),
      projectId: project.id,
      projectName: project.name,
      description: request.description || '',
      drawingType: request.drawingType || 'Other',
      source: request.source || '',
      requesterName: request.driName || '',
      requestedPriority: request.priority || '',
      reviewStatus: statusValue,
      reviewHistory: [],
      files,
      assignedTo: null,
      committedDate: null,
      priority: request.priority || '',
      trackingStatus: 'pending',
      actualCompletionDate: null,
      planningVerified: false,
      projectAcknowledged: false,
      remarks: '',
      submittedByUserId: null,
      isPublic: Boolean(request.isPublicSubmission),
    });
  } catch (err) {
    console.error('[syncToQc] failed to sync Drawing Request', request._id, err.message);
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = { syncDprToQc, syncDrawingRequestToQc };
