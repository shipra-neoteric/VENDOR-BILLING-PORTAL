const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const DailyProgressReport = require('../models/DailyProgressReport');
const Project = require('../models/Project');
const Contractor = require('../models/Contractor');
const { workEntriesInvalidReason } = require('../utils/validateWorkEntries');
const { notifyDailyProgressReport } = require('../utils/n8nWebhook');
const { flattenReportImages } = require('../utils/dprImages');

const REQUIRED_FIELDS = ['projectId', 'driName', 'date', 'vendorCode', 'shiftType', 'labourCount'];

async function buildReportDoc(body) {
  for (const f of REQUIRED_FIELDS) {
    if (body[f] === undefined || body[f] === null || body[f] === '') return { error: `"${f}" is required` };
  }
  const entriesError = workEntriesInvalidReason(body.workEntries);
  if (entriesError) return { error: entriesError };

  const project = await Project.findById(body.projectId).select('name slackChannelId slackWebhookUrl');
  if (!project) return { error: 'Project not found' };

  const contractor = await Contractor.findOne({ vendorCode: body.vendorCode }).select('companyName');
  if (!contractor) return { error: 'Contractor not found for this vendor code' };

  return {
    doc: {
      projectId: body.projectId,
      projectName: project.name,
      driName: body.driName,
      date: body.date,
      vendorCode: body.vendorCode,
      vendorName: contractor.companyName,
      shiftType: body.shiftType,
      labourCount: Number(body.labourCount),
      workEntries: body.workEntries,
    },
    project,
  };
}

// POST /api/daily-progress-reports — authenticated (DRI dashboard, or anyone logged in)
exports.createReport = asyncHandler(async (req, res) => {
  const { doc, error, project } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyProgressReport.create({
    ...doc,
    driUserId: req.user._id,
    driName: req.body.driName || req.user.name,
    submittedBy: req.user._id,
    isPublicSubmission: false,
  });

  // Fire-and-forget — an n8n/webhook outage should never fail the submission itself.
  notifyDailyProgressReport(report, project).catch(() => {});

  created(res, { report }, 'Daily Progress Report submitted');
});

// POST /api/public/daily-progress-reports — no auth
exports.createPublicReport = asyncHandler(async (req, res) => {
  const { doc, error, project } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyProgressReport.create({
    ...doc,
    submittedBy: null,
    isPublicSubmission: true,
  });

  // Fire-and-forget — an n8n/webhook outage should never fail the submission itself.
  notifyDailyProgressReport(report, project).catch(() => {});

  created(res, { report }, 'Daily Progress Report submitted');
});

// GET /api/public/daily-progress-reports/:id/images/:index — no auth, by design:
// Slack fetches image_url with no custom auth headers at all, so this has to be
// reachable without a token. The report's Mongo ObjectId is the access control
// (unguessable, never listed anywhere) — the same pattern this app already uses
// for its public quotation-comparison links.
exports.getReportImage = asyncHandler(async (req, res) => {
  const report = await DailyProgressReport.findById(req.params.id).select('workEntries');
  if (!report) return notFound(res, 'Report not found');

  const image = flattenReportImages(report)[Number(req.params.index)];
  const match = image && /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(image.url);
  if (!match) return notFound(res, 'Image not found');

  res.set('Content-Type', match[1]);
  // Reports (and their photos) are never edited after submission, so this can
  // never go stale — safe to cache aggressively.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(match[2], 'base64'));
});

// GET /api/daily-progress-reports — site-dri sees only their own; everyone else sees all
exports.listReports = asyncHandler(async (req, res) => {
  const { projectId, vendorCode } = req.query;
  const filter = {};
  if (req.user.role === 'site-dri') filter.driUserId = req.user._id;
  if (projectId)  filter.projectId  = projectId;
  if (vendorCode) filter.vendorCode = vendorCode;

  const reports = await DailyProgressReport.find(filter)
    .populate('submittedBy', 'name email')
    .sort({ date: -1, createdAt: -1 })
    .limit(200)
    .lean();

  success(res, { reports });
});

// GET /api/daily-progress-reports/:id
exports.getReport = asyncHandler(async (req, res) => {
  const report = await DailyProgressReport.findById(req.params.id).populate('submittedBy', 'name email').lean();
  if (!report) return notFound(res, 'Report not found');
  if (req.user.role === 'site-dri' && String(report.driUserId) !== String(req.user._id)) {
    return notFound(res, 'Report not found');
  }
  success(res, { report });
});
