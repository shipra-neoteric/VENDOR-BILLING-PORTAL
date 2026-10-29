const { validationResult } = require('express-validator');
const Project      = require('../models/Project');
const WorkOrder    = require('../models/WorkOrder');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const ProjectEvent = require('../models/ProjectEvent');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextProjectCode } = require('../utils/codeGen');
const { logAudit, diffFields } = require('../utils/auditLog');
const { computeProjectRollup } = require('../utils/projectRollup');
const { scopeProgress } = require('../utils/projectStageRules');

// Every GET below strips the real slackWebhookUrl before it ever leaves the
// server — GET /projects and GET /projects/:id have no role restriction (any
// authenticated user, including the lowest-privilege roles, can call them),
// so returning the raw webhook URL there would hand out a live Slack posting
// credential to everyone in the app. `slackWebhookConfigured` is all any
// caller needs to know from the outside.
function sanitizeProject(doc) {
  const { slackWebhookUrl, ...rest } = doc;
  return { ...rest, slackWebhookConfigured: !!slackWebhookUrl };
}

exports.listProjects = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();
  success(res, { projects: projects.map(sanitizeProject) });
});

exports.getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id).lean();
  if (!project) return notFound(res, 'Project not found');
  success(res, { project: sanitizeProject(project) });
});

exports.createProject = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const code    = await nextProjectCode();
  const project = await Project.create({ ...req.body, code, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'projects', user: req.user,
    description: `Created project ${project.name} (${project.code})`,
    entityType: 'Project', entityId: project._id, entityLabel: project.name,
  });

  created(res, { project: sanitizeProject(project.toObject()) }, 'Project created successfully');
});

exports.updateProject = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // The edit form's Slack Webhook field is write-only — it's never pre-filled
  // with the real value, so a blank submission means "left untouched," not
  // "clear it." Only a non-empty string (a new/replacement URL) or the
  // explicit `null` sentinel (the form's "Clear" action) changes what's
  // stored; anything else is dropped from the $set entirely.
  if ('slackWebhookUrl' in body) {
    if (body.slackWebhookUrl === '') delete body.slackWebhookUrl;
    else if (body.slackWebhookUrl === null) body.slackWebhookUrl = '';
  }
  const before = await Project.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Project not found');

  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { $set: body },
    { new: true, runValidators: true }
  ).lean();
  if (!project) return notFound(res, 'Project not found');

  // slackWebhookUrl is a bearer credential (see model) — never diffed/logged.
  const changes = diffFields(before, project, [
    'code', 'name', 'location', 'contractValue', 'budget', 'client',
    'startDate', 'expectedCompletion', 'projectType', 'status',
    'slackChannelId', 'parentId',
  ]);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'projects', user: req.user,
      description: `Updated project ${project.name} (${project.code})`,
      entityType: 'Project', entityId: project._id, entityLabel: project.name,
      changes,
    });
  }

  success(res, { project: sanitizeProject(project) }, 'Project updated successfully');
});

exports.deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return notFound(res, 'Project not found');

  const hasSubProjects = await Project.exists({ parentId: project._id });
  if (hasSubProjects) {
    return conflict(res, `Cannot delete "${project.name}" — delete its sub-projects first.`);
  }

  const hasWorkOrders = await WorkOrder.exists({ projectId: project._id });
  if (hasWorkOrders) {
    return conflict(res, `Cannot delete "${project.name}" — it has work orders assigned to it.`);
  }

  const hasBills = await RunningBill.exists({ projectId: project._id });
  if (hasBills) {
    return conflict(res, `Cannot delete "${project.name}" — it has running bills recorded against it.`);
  }

  const hasBillRequests = await BillRequest.exists({ projectId: project._id });
  if (hasBillRequests) {
    return conflict(res, `Cannot delete "${project.name}" — it has bill requests recorded against it.`);
  }

  await project.deleteOne();

  await logAudit({
    action: 'DELETE', module: 'projects', user: req.user,
    description: `Deleted project ${project.name} (${project.code})`,
    entityType: 'Project', entityId: project._id, entityLabel: project.name,
  });

  success(res, null, 'Project deleted');
});

// GET /api/projects/:id/stats
exports.getProjectStats = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [project, wos, runningBills] = await Promise.all([
    Project.findById(id).lean(),
    WorkOrder.find({ projectId: id }).select('-documents').lean(),
    RunningBill.find({ projectId: id }).lean(),
  ]);

  if (!project) return notFound(res, 'Project not found');

  const woIds    = wos.map(w => w._id);
  const billReqs = woIds.length
    ? await BillRequest.find({ workOrderId: { $in: woIds } })
    : [];

  // Same rollup the Dashboard / Projects Overview uses (utils/projectRollup.js) so
  // the two screens can't disagree: only approved, non-cancelled work orders count
  // towards contract/executed/progress; billed excludes rejected, unsubmitted and
  // advance bills; outstanding is bills still 'approved', not certified - paid.
  const roll = computeProjectRollup(wos, runningBills);
  const { awardedContractValue, workExecutedValue, billedGross, certifiedNet, paidAmount, progress } = roll;

  const categoryMap = {};
  roll.countedWos.forEach(wo => {
    const cat = wo.category || 'General';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { contractValue: 0, woCount: 0, vendorCodes: new Set(), wos: [] };
    }
    categoryMap[cat].contractValue += (wo.contractValue || 0);
    categoryMap[cat].woCount++;
    categoryMap[cat].wos.push(wo);
    if (wo.vendorCode) categoryMap[cat].vendorCodes.add(wo.vendorCode);
  });

  const pendingBillReqs = billReqs.filter(b => ['pending', 'pending-gm', 'pending-l3', 'pending-l4'].includes(b.status)).length;
  const openBills       = runningBills.filter(b => !['approved', 'paid', 'rejected'].includes(b.status)).length;
  const activeVendors   = new Set(roll.countedWos.map(w => w.vendorCode).filter(Boolean)).size;

  const categoryBreakdown = Object.entries(categoryMap).map(([category, s]) => ({
    category,
    contractValue: s.contractValue,
    woCount:       s.woCount,
    vendorCount:   s.vendorCodes.size,
    progress:      scopeProgress(s.wos).percent,
    workExecuted:  scopeProgress(s.wos).executedValue,
  })).sort((a, b) => b.contractValue - a.contractValue);

  success(res, {
    project: sanitizeProject(project),
    stats: {
      projectBudget:       project.budget || 0,
      awardedContractValue,
      workExecutedValue,
      billedGross,
      certifiedNet,
      paidAmount,
      remainingContract:   roll.remainingContract,
      certifiedUnpaid:     roll.certifiedUnpaid,
      costVariance:        (project.budget || 0) > 0 ? (project.budget - awardedContractValue) : null,
      pendingBillReqs,
      openBills,
      activeVendors,
      woCount:  roll.countedWos.length,
      progress,
      categoryBreakdown,
    },
  });
});

// GET /api/projects/:id/activity
exports.getProjectActivity = asyncHandler(async (req, res) => {
  const { id }                       = req.params;
  const { workOrderId, limit = 100 } = req.query;
  const filter = { projectId: id };
  if (workOrderId) filter.workOrderId = workOrderId;
  const events = await ProjectEvent.find(filter)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
  success(res, { events });
});

// GET /api/projects/activity — cross-project feed, used by the AGM/GM Bill
// Review page's "Recent DRI Progress" nutshell (defaults to progress entries
// only, via `type`) and by the Dashboard's mixed-type "Recent Activities"
// panel (via comma-separated `types`, e.g. `?types=WORK_ORDER_CREATED,
// PAYMENT_RELEASED,BILL_REQUESTED`). Reads straight off the already-recorded
// ProjectEvent rows instead of re-fetching every work order, so it stays
// cheap regardless of how many WOs exist.
exports.getAllProjectsActivity = asyncHandler(async (req, res) => {
  const { type = 'PROGRESS_ADDED', types, limit = 100, projectId } = req.query;
  const filter = types ? { type: { $in: types.split(',') } } : { type };
  if (projectId) filter.projectId = projectId;
  const events = await ProjectEvent.find(filter)
    .populate('projectId', 'name code')
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit) || 100, 300));
  success(res, { events });
});
