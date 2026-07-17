const { validationResult } = require('express-validator');
const Project      = require('../models/Project');
const WorkOrder    = require('../models/WorkOrder');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const ProjectEvent = require('../models/ProjectEvent');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { nextProjectCode } = require('../utils/codeGen');

exports.listProjects = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const projects = await Project.find(filter).sort({ createdAt: -1 });
  success(res, { projects });
});

exports.getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return notFound(res, 'Project not found');
  success(res, { project });
});

exports.createProject = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const code    = await nextProjectCode();
  const project = await Project.create({ ...req.body, code, createdBy: req.user._id });
  created(res, { project }, 'Project created successfully');
});

exports.updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!project) return notFound(res, 'Project not found');
  success(res, { project }, 'Project updated successfully');
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
  success(res, null, 'Project deleted');
});

// GET /api/projects/:id/stats
exports.getProjectStats = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [project, wos, runningBills] = await Promise.all([
    Project.findById(id),
    WorkOrder.find({ projectId: id }),
    RunningBill.find({ projectId: id }),
  ]);

  if (!project) return notFound(res, 'Project not found');

  const woIds    = wos.map(w => w._id);
  const billReqs = woIds.length
    ? await BillRequest.find({ workOrderId: { $in: woIds } })
    : [];

  const awardedContractValue = wos.reduce((s, w) => s + (w.contractValue || 0), 0);

  let workExecutedValue = 0;
  let totalPlannedQty   = 0;
  let totalCompletedQty = 0;
  const categoryMap = {};

  wos.forEach(wo => {
    const cat = wo.category || 'General';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { contractValue: 0, workExecuted: 0, plannedQty: 0, completedQty: 0, woCount: 0, vendorCodes: new Set() };
    }
    categoryMap[cat].contractValue += (wo.contractValue || 0);
    categoryMap[cat].woCount++;
    if (wo.vendorCode) categoryMap[cat].vendorCodes.add(wo.vendorCode);

    (wo.scopeItems || []).forEach(si => {
      const planned   = si.plannedQty   || 0;
      const completed = si.completedQty || 0;
      const rate      = si.rate         || 0;
      const executed  = completed * rate;
      workExecutedValue += executed;
      totalPlannedQty   += planned;
      totalCompletedQty += completed;
      categoryMap[cat].plannedQty   += planned;
      categoryMap[cat].completedQty += completed;
      categoryMap[cat].workExecuted  += executed;
    });
  });

  // Certified value = what's been billed and approved, incl. any retention
  // held — retention is still owed, just released later. Paid value must
  // exclude it (and any advance being recovered), since that money hasn't
  // actually left the building yet — otherwise remaining contract value looks
  // smaller than what's genuinely still owed/available.
  const netCertified = b => {
    const base = b.amount || 0;
    return base + base * ((b.gstPercent || 18) / 100) - base * ((b.tdsPercent || 1) / 100);
  };
  const netPaidOut = b => netCertified(b) - (b.retentionAmount || 0) - (b.advanceRecovery || 0);

  const billedGross    = runningBills.reduce((s, b) => s + (b.amount || 0), 0);
  const certifiedBills = runningBills.filter(b => ['approved', 'paid'].includes(b.status));
  const certifiedNet   = certifiedBills.reduce((s, b) => s + netCertified(b), 0);
  const paidBills      = runningBills.filter(b => b.status === 'paid');
  const paidAmount     = paidBills.reduce((s, b) => s + netPaidOut(b), 0);

  const pendingBillReqs = billReqs.filter(b => b.status === 'pending').length;
  const openBills       = runningBills.filter(b => !['approved', 'paid', 'rejected'].includes(b.status)).length;
  const activeVendors   = new Set(wos.map(w => w.vendorCode).filter(Boolean)).size;
  const progress        = totalPlannedQty > 0
    ? Math.min(100, Math.round((totalCompletedQty / totalPlannedQty) * 100))
    : 0;

  const categoryBreakdown = Object.entries(categoryMap).map(([category, s]) => ({
    category,
    contractValue: s.contractValue,
    woCount:       s.woCount,
    vendorCount:   s.vendorCodes.size,
    progress:      s.plannedQty > 0
      ? Math.min(100, Math.round((s.completedQty / s.plannedQty) * 100))
      : 0,
    workExecuted: s.workExecuted,
  })).sort((a, b) => b.contractValue - a.contractValue);

  success(res, {
    project,
    stats: {
      projectBudget:       project.budget || 0,
      awardedContractValue,
      workExecutedValue,
      billedGross,
      certifiedNet,
      paidAmount,
      remainingContract:   Math.max(0, awardedContractValue - paidAmount),
      costVariance:        (project.budget || 0) > 0 ? (project.budget - awardedContractValue) : null,
      pendingBillReqs,
      openBills,
      activeVendors,
      woCount:  wos.length,
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
