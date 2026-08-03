const { validationResult } = require('express-validator');
const Consultant   = require('../models/Consultant');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound } = require('../utils/responseFormatter');
const { nextConsultantCode } = require('../utils/codeGen');

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
  created(res, { consultant }, 'Consultant registered successfully');
});

exports.updateConsultant = asyncHandler(async (req, res) => {
  const consultant = await Consultant.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!consultant) return notFound(res, 'Consultant not found');
  success(res, { consultant }, 'Consultant updated successfully');
});
