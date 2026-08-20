const Company      = require('../models/Company');
const WorkOrder    = require('../models/WorkOrder');
const BillRequest  = require('../models/BillRequest');
const RunningBill  = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, conflict } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

exports.listCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find().sort({ name: 1 });
  success(res, { companies });
});

exports.getCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return notFound(res, 'Company not found');
  success(res, { company });
});

exports.createCompany = asyncHandler(async (req, res) => {
  const dupName = await Company.findOne({ name: { $regex: `^${req.body.name}$`, $options: 'i' } });
  if (dupName) return conflict(res, 'A company with this name already exists');

  const dupCode = await Company.findOne({ shortCode: req.body.shortCode?.toUpperCase() });
  if (dupCode) return conflict(res, `Short code "${req.body.shortCode}" is already in use`);

  const company = await Company.create({ ...req.body, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'companies', user: req.user,
    description: `Company ${company.name} (${company.shortCode}) created`,
    entityType: 'Company', entityId: company._id, entityLabel: `${company.name} (${company.shortCode})`,
  });

  created(res, { company }, 'Company created successfully');
});

exports.updateCompany = asyncHandler(async (req, res) => {
  const before = await Company.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Company not found');

  const company = await Company.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!company) return notFound(res, 'Company not found');

  if (before.name !== company.name) {
    const matchingWOs = await WorkOrder.find({ companyId: company._id }).select('_id');
    const woIds = matchingWOs.map(w => w._id);
    if (woIds.length > 0) {
      await Promise.all([
        WorkOrder.updateMany({ companyId: company._id }, { companyName: company.name }),
        BillRequest.updateMany({ workOrderId: { $in: woIds } }, { companyName: company.name }),
        RunningBill.updateMany({ workOrderId: { $in: woIds } }, { companyName: company.name }),
      ]);
    }
  }

  const changes = diffFields(before, company.toObject(), [
    'name', 'shortCode', 'type', 'cin', 'gstNumber', 'panNumber',
    'address', 'city', 'state', 'email', 'phone', 'contactPerson', 'color', 'isActive',
  ]);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'companies', user: req.user,
      description: `Updated company ${company.name} (${company.shortCode})`,
      entityType: 'Company', entityId: company._id, entityLabel: `${company.name} (${company.shortCode})`,
      changes,
    });
  }

  success(res, { company }, 'Company updated successfully');
});

exports.deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return notFound(res, 'Company not found');
  await company.deleteOne();

  await logAudit({
    action: 'DELETE', module: 'companies', user: req.user,
    description: `Deleted company ${company.name} (${company.shortCode})`,
    entityType: 'Company', entityId: company._id, entityLabel: `${company.name} (${company.shortCode})`,
  });

  success(res, null, `Company "${company.name}" deleted`);
});
