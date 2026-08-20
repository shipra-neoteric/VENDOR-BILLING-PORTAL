const { validationResult } = require('express-validator');
const Consultant   = require('../models/Consultant');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound } = require('../utils/responseFormatter');
const { nextConsultantCode } = require('../utils/codeGen');
const { logAudit, diffFields } = require('../utils/auditLog');

// Business fields only — `documents` holds KYC data URIs and must never be
// diffed/logged.
const CONSULTANT_DIFF_FIELDS = [
  'consultantCode', 'firmName', 'principalName', 'consultancyType',
  'professionalRegistration', 'licenseNo', 'experience', 'designSoftware',
  'portfolioUrl', 'address', 'mobile', 'alternateMobile', 'email',
  'accountHolderName', 'bankName', 'accountNumber', 'ifscCode', 'branchName',
  'gstNumber', 'panNumber', 'aadhaarNumber', 'status',
];

exports.listConsultants = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { consultantCode: { $regex: search, $options: 'i' } },
      { firmName:       { $regex: search, $options: 'i' } },
      { principalName:  { $regex: search, $options: 'i' } },
      { mobile:         { $regex: search, $options: 'i' } },
    ];
  }
  // documents holds base64 data URIs (can run MBs per consultant) and is only
  // ever rendered in the single-consultant view drawer — excluded here to
  // keep the list fast, same convention as listContractors.
  const consultants = await Consultant.find(filter).select('-documents').sort({ consultantCode: -1 });
  success(res, { consultants });
});

exports.getConsultant = asyncHandler(async (req, res) => {
  const consultant =
    (await Consultant.findById(req.params.id).catch(() => null)) ||
    (await Consultant.findOne({ consultantCode: req.params.id }));
  if (!consultant) return notFound(res, 'Consultant not found');
  success(res, { consultant });
});

exports.createConsultant = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const consultantCode = await nextConsultantCode();
  const consultant = await Consultant.create({ ...req.body, consultantCode, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'consultants', user: req.user,
    description: `Created consultant ${consultant.firmName} (${consultant.consultantCode})`,
    entityType: 'Consultant', entityId: consultant._id, entityLabel: consultant.firmName,
  });

  created(res, { consultant }, 'Consultant registered successfully');
});

exports.updateConsultant = asyncHandler(async (req, res) => {
  const before = await Consultant.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Consultant not found');

  const consultant = await Consultant.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!consultant) return notFound(res, 'Consultant not found');

  const changes = diffFields(before, consultant.toObject(), CONSULTANT_DIFF_FIELDS);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'consultants', user: req.user,
      description: `Updated consultant ${consultant.firmName} (${consultant.consultantCode})`,
      entityType: 'Consultant', entityId: consultant._id, entityLabel: consultant.firmName,
      changes,
    });
  }

  success(res, { consultant }, 'Consultant updated successfully');
});
