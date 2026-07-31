const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const DailyLabourReport = require('../models/DailyLabourReport');
const Project = require('../models/Project');
const Contractor = require('../models/Contractor');

const REQUIRED_FIELDS = ['vendorCode', 'projectId', 'date', 'workType', 'shiftType', 'labourCount'];

async function buildReportDoc(body) {
  for (const f of REQUIRED_FIELDS) {
    if (body[f] === undefined || body[f] === null || body[f] === '') return { error: `"${f}" is required` };
  }
  const project = await Project.findById(body.projectId).select('name');
  if (!project) return { error: 'Project not found' };

  const contractor = await Contractor.findOne({ vendorCode: body.vendorCode }).select('companyName');
  if (!contractor) return { error: 'Contractor not found for this vendor code' };

  return {
    doc: {
      vendorCode: body.vendorCode,
      vendorName: contractor.companyName,
      projectId: body.projectId,
      projectName: project.name,
      date: body.date,
      workType: body.workType,
      shiftType: body.shiftType,
      labourCount: Number(body.labourCount),
    },
  };
}

// POST /api/daily-labour-reports — authenticated
exports.createReport = asyncHandler(async (req, res) => {
  const { doc, error } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyLabourReport.create({
    ...doc,
    submittedBy: req.user._id,
    isPublicSubmission: false,
  });

  created(res, { report }, 'Daily Labour Report submitted');
});

// POST /api/public/daily-labour-reports — no auth
exports.createPublicReport = asyncHandler(async (req, res) => {
  const { doc, error } = await buildReportDoc(req.body);
  if (error) return badRequest(res, error);

  const report = await DailyLabourReport.create({
    ...doc,
    submittedBy: null,
    isPublicSubmission: true,
  });

  created(res, { report }, 'Daily Labour Report submitted');
});

// GET /api/daily-labour-reports — site-dri sees only their own; everyone else sees all
exports.listReports = asyncHandler(async (req, res) => {
  const { projectId, vendorCode } = req.query;
  const filter = {};
  if (req.user.role === 'site-dri') filter.submittedBy = req.user._id;
  if (projectId)  filter.projectId  = projectId;
  if (vendorCode) filter.vendorCode = vendorCode;

  const reports = await DailyLabourReport.find(filter)
    .populate('submittedBy', 'name email')
    .sort({ date: -1, createdAt: -1 })
    .limit(200)
    .lean();

  success(res, { reports });
});

// GET /api/daily-labour-reports/:id
exports.getReport = asyncHandler(async (req, res) => {
  const report = await DailyLabourReport.findById(req.params.id).populate('submittedBy', 'name email').lean();
  if (!report) return notFound(res, 'Report not found');
  if (req.user.role === 'site-dri' && String(report.submittedBy?._id || report.submittedBy) !== String(req.user._id)) {
    return notFound(res, 'Report not found');
  }
  success(res, { report });
});
