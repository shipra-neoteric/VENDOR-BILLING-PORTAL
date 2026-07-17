const router      = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const Project    = require('../models/Project');
const Contractor = require('../models/Contractor');
const Category   = require('../models/Category');
const Company    = require('../models/Company');
const User       = require('../models/User');
const WorkOrder  = require('../models/WorkOrder');
const { nextWorkOrderNo, nextVendorCode } = require('../utils/codeGen');
const { startInstance } = require('../utils/slaEngine');
const { milestonesExceedContract } = require('../utils/validateMilestones');
const { documentsExceedLimit } = require('../utils/validateDocuments');

// ── Lookup lists (read-only, no auth) ──────────────────────────
router.get('/projects', asyncHandler(async (_req, res) => {
  const projects = await Project.find().select('_id name code projectType location').sort({ name: 1 }).lean();
  success(res, { projects });
}));

router.get('/contractors', asyncHandler(async (_req, res) => {
  const contractors = await Contractor.find()
    .select('vendorCode companyName ownerName mobile')
    .sort({ vendorCode: 1 }).lean();
  success(res, { contractors });
}));

router.get('/categories', asyncHandler(async (_req, res) => {
  // Return all active categories with parentId so the public form can build the sub-category tree
  const categories = await Category.find({ isActive: true })
    .select('_id name color parentId').sort({ name: 1 }).lean();
  success(res, { categories });
}));

router.get('/companies', asyncHandler(async (_req, res) => {
  const companies = await Company.find().select('_id name').sort({ name: 1 }).lean();
  success(res, { companies });
}));

router.get('/dri-users', asyncHandler(async (_req, res) => {
  const users = await User.find({ role: 'dri' }).select('_id name email').sort({ name: 1 }).lean();
  success(res, { users });
}));

// ── Submit new work order (no auth) ────────────────────────────
router.post('/work-orders', asyncHandler(async (req, res) => {
  const { projectId, vendorCode, issueDate, companyId, preparedByName, preparedByContact } = req.body;

  if (!projectId)  return badRequest(res, 'Project is required');
  if (!vendorCode) return badRequest(res, 'Vendor code is required');
  if (!issueDate)  return badRequest(res, 'Issue date is required');
  if (!preparedByName)    return badRequest(res, 'Your name is required');
  if (!preparedByContact) return badRequest(res, 'Your contact is required');

  if (milestonesExceedContract(req.body)) {
    return badRequest(res, "Payment milestones total exceeds the work order's contract value (incl. GST)");
  }

  const docCheck = documentsExceedLimit(req.body.documents);
  if (docCheck.exceeds) return badRequest(res, docCheck.reason);

  const project = await Project.findById(projectId);
  if (!project) return notFound(res, 'Project not found');

  const contractor = await Contractor.findOne({ vendorCode });
  if (!contractor) return notFound(res, 'Contractor not found');

  const workOrderNo = await nextWorkOrderNo();

  let companyName = '';
  if (companyId) {
    const co = await Company.findById(companyId).select('name').lean();
    if (co) companyName = co.name;
  }

  // Spread the full payload (scopeItems, contractValue, scopeOfWork, documentUrl/Name, etc.)
  // so nothing the public form collects is silently dropped, then override computed/trusted fields.
  const workOrder = await WorkOrder.create({
    ...req.body,
    workOrderNo,
    projectName: project.name,
    projectLocation: req.body.projectLocation || '',
    vendorName:  contractor.companyName,
    ownerName:   contractor.ownerName,
    mobile:      contractor.mobile,
    companyId:   companyId || null,
    companyName,
    status:      req.body.status || 'draft',
    gstPercent:  req.body.gstPercent ?? 18,
    assignedDRI: req.body.assignedDRI || [],
  });

  await startInstance('WorkOrder', workOrder._id, workOrder.workOrderNo, null, {
    projectId: workOrder.projectId, projectName: workOrder.projectName,
    vendorName: workOrder.vendorName, amount: workOrder.contractValue,
  });

  created(res, { workOrder }, 'Work order submitted successfully');
}));

// ── Submit new contractor (no auth) ─────────────────────────────
router.post('/contractors', asyncHandler(async (req, res) => {
  const {
    companyName, shortCode, ownerName, address, mobile, alternateMobile, email,
    accountHolderName, bankName, accountNumber, ifscCode, branchName,
    gstNumber, panNumber, workTypes, reference1, reference2, averageTurnover,
    documents,
  } = req.body;

  if (!companyName) return badRequest(res, 'Company / firm name is required');
  if (!ownerName)   return badRequest(res, 'Owner name is required');
  if (!mobile)      return badRequest(res, 'Mobile is required');

  const vendorCode = await nextVendorCode();

  const contractor = await Contractor.create({
    vendorCode, companyName, shortCode, ownerName, address, mobile, alternateMobile, email,
    accountHolderName, bankName, accountNumber, ifscCode, branchName,
    gstNumber, panNumber, workTypes, reference1, reference2, averageTurnover,
    documents,
  });

  created(res, { contractor }, `Contractor registered as ${vendorCode}`);
}));

module.exports = router;
