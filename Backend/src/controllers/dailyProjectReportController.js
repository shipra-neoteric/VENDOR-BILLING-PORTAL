const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const DailyProjectReport = require('../models/DailyProjectReport');
const Project = require('../models/Project');

const REQUIRED_FIELDS = [
  'projectId', 'driName', 'date', 'tomorrowsPlan', 'workDelayed', 'labourShort',
  'materialShort', 'materialReceivedOnTime', 'drawingPending', 'challengeBlocking', 'escalationRequired',
];

async function buildReportDoc(body) {
  for (const f of REQUIRED_FIELDS) {
    if (!body[f]) return { error: `"${f}" is required` };
  }
  const project = await Project.findById(body.projectId).select('name');
  if (!project) return { error: 'Project not found' };

  return {
    doc: {
      projectId: body.projectId,
      projectName: project.name,
      driName: body.driName,
      date: body.date,
      tomorrowsPlan: body.tomorrowsPlan,
      workDelayed: body.workDelayed,
      labourShort: body.labourShort,
      additionalLabourNeeded: body.additionalLabourNeeded || '',
      labourShortageImpact: body.labourShortageImpact || '',
      materialShort: body.materialShort,
      materialRunOutDays: body.materialRunOutDays || '',
      materialReceivedOnTime: body.materialReceivedOnTime,
      materialShortageImpact: body.materialShortageImpact || '',
      drawingPending: body.drawingPending,
      drawingReference: body.drawingReference || '',
      drawingPendingDays: body.drawingPendingDays || '',
      drawingBlockedActivity: body.drawingBlockedActivity || '',
      challengeBlocking: body.challengeBlocking,
      challengeDescription: body.challengeDescription || '',
      escalationRequired: body.escalationRequired,
      escalationAction: body.escalationAction || '',
    },
  };
}

// POST /api/daily-reports — authenticated (DRI dashboard, or anyone logged in)
exports.createReport = asyncHandler(async (req, res) => {
  const { doc, error } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyProjectReport.create({
    ...doc,
    driUserId: req.user._id,
    driName: req.body.driName || req.user.name,
    submittedBy: req.user._id,
    isPublicSubmission: false,
  });

  created(res, { report }, 'Daily Project Report submitted');
});

// POST /api/public/daily-reports — no auth
exports.createPublicReport = asyncHandler(async (req, res) => {
  const { doc, error } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyProjectReport.create({
    ...doc,
    submittedBy: null,
    isPublicSubmission: true,
  });

  created(res, { report }, 'Daily Project Report submitted');
});

// GET /api/daily-reports — site-dri sees only their own; everyone else sees all
exports.listReports = asyncHandler(async (req, res) => {
  const { projectId, escalationOnly } = req.query;
  const filter = {};
  if (req.user.role === 'site-dri') filter.driUserId = req.user._id;
  if (projectId) filter.projectId = projectId;
  if (escalationOnly === 'true') filter.escalationRequired = { $regex: '^Yes', $options: 'i' };

  const reports = await DailyProjectReport.find(filter)
    .populate('submittedBy', 'name email')
    .sort({ date: -1, createdAt: -1 })
    .limit(200)
    .lean();

  success(res, { reports });
});

// GET /api/daily-reports/:id
exports.getReport = asyncHandler(async (req, res) => {
  const report = await DailyProjectReport.findById(req.params.id).populate('submittedBy', 'name email').lean();
  if (!report) return notFound(res, 'Report not found');
  if (req.user.role === 'site-dri' && String(report.driUserId) !== String(req.user._id)) {
    return notFound(res, 'Report not found');
  }
  success(res, { report });
});
