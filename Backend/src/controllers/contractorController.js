const { validationResult } = require('express-validator');
const Contractor   = require('../models/Contractor');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextVendorCode } = require('../utils/codeGen');

exports.listContractors = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { vendorCode:  { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
      { ownerName:   { $regex: search, $options: 'i' } },
      { mobile:      { $regex: search, $options: 'i' } },
    ];
  }
  // Sort by vendor code (zero-padded, so this is also numeric order) rather than
  // createdAt — imports/edits can leave createdAt out of step with the code sequence,
  // which is what a user actually expects a "vendor list" to be ordered by.
  // `documents` holds base64 data URIs for GST/PAN certs etc. (can run MBs per
  // contractor) and is only ever rendered in the single-contractor view drawer, so it's
  // excluded here to keep the list fast — that drawer fetches the full record itself.
  const contractors = await Contractor.find(filter).select('-documents').sort({ vendorCode: -1 });
  success(res, { contractors });
});

exports.getContractor = asyncHandler(async (req, res) => {
  const contractor =
    (await Contractor.findById(req.params.id).catch(() => null)) ||
    (await Contractor.findOne({ vendorCode: req.params.id }));
  if (!contractor) return notFound(res, 'Contractor not found');
  success(res, { contractor });
});

exports.createContractor = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const vendorCode  = await nextVendorCode();
  const contractor  = await Contractor.create({ ...req.body, vendorCode, createdBy: req.user._id });
  created(res, { contractor }, 'Contractor created successfully');
});

exports.bulkImport = asyncHandler(async (req, res) => {
  const rows = req.body.contractors;
  if (!Array.isArray(rows) || rows.length === 0) {
    return badRequest(res, 'No contractor rows provided');
  }

  const results = { created: [], skipped: [], errors: [] };

  for (const row of rows) {
    try {
      if (!row.companyName) {
        results.errors.push({ row: '?', reason: 'Missing company name' });
        continue;
      }
      if (row.mobile) {
        const existing = await Contractor.findOne({ mobile: row.mobile });
        if (existing) {
          results.skipped.push({
            row:    row.companyName,
            reason: `Mobile ${row.mobile} already registered as ${existing.vendorCode}`,
          });
          continue;
        }
      }
      const vendorCode = await nextVendorCode();
      const contractor = await Contractor.create({
        ...row,
        vendorCode,
        status:    row.status || 'active',
        workTypes: Array.isArray(row.workTypes)
          ? row.workTypes
          : row.workTypes
            ? String(row.workTypes).split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        createdBy: req.user._id,
      });
      results.created.push(contractor);
    } catch (err) {
      results.errors.push({ row: row.companyName || '?', reason: err.message });
    }
  }

  res.status(201).json(results);
});

exports.updateContractor = asyncHandler(async (req, res) => {
  const contractor = await Contractor.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!contractor) return notFound(res, 'Contractor not found');
  success(res, { contractor }, 'Contractor updated successfully');
});
