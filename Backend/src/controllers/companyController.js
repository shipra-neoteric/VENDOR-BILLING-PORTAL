const Company      = require('../models/Company');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, conflict } = require('../utils/responseFormatter');

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
  created(res, { company }, 'Company created successfully');
});

exports.updateCompany = asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!company) return notFound(res, 'Company not found');
  success(res, { company }, 'Company updated successfully');
});

exports.deleteCompany = asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) return notFound(res, 'Company not found');
  await company.deleteOne();
  success(res, null, `Company "${company.name}" deleted`);
});
