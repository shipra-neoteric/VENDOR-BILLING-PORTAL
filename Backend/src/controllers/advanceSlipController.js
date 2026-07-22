const AdvanceSlip   = require('../models/AdvanceSlip');
const asyncHandler  = require('../utils/asyncHandler');
const { success, notFound, badRequest } = require('../utils/responseFormatter');
const { nextCode } = require('../utils/sequence');

const nextSlipNo = () => nextCode('advanceSlipNo', 'ADV-', 4);

// GET /api/advance-slips
exports.listAdvanceSlips = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.projectId)      filter.projectId      = req.query.projectId;
  if (req.query.contractorCode) filter.contractorCode = req.query.contractorCode;
  if (req.query.status)         filter.status         = req.query.status;
  if (req.query.archived === 'true') filter.isArchived = true;
  else                                filter.isArchived = { $ne: true };

  const slips = await AdvanceSlip.find(filter).sort({ createdAt: -1 });
  success(res, { advanceSlips: slips });
});

// GET /api/advance-slips/pending?projectId=X&vendorCode=Y
// Returns outstanding/partial advances for a contractor+project (used at Release Payment)
exports.getPendingAdvances = asyncHandler(async (req, res) => {
  const { projectId, vendorCode } = req.query;
  if (!projectId || !vendorCode) return badRequest(res, 'projectId and vendorCode are required');

  const slips = await AdvanceSlip.find({
    projectId,
    contractorCode: vendorCode,
    status: { $in: ['outstanding', 'partial'] },
    isArchived: { $ne: true },
  }).sort({ date: 1 });

  success(res, { advanceSlips: slips });
});

// POST /api/advance-slips
exports.createAdvanceSlip = asyncHandler(async (req, res) => {
  const { contractorCode, contractorName, projectId, projectName, amount, date, reference, notes } = req.body;
  if (!contractorCode || !projectId || !amount || !date) {
    return badRequest(res, 'contractorCode, projectId, amount and date are required');
  }
  const slipNo = await nextSlipNo();
  const slip = await AdvanceSlip.create({
    slipNo, contractorCode, contractorName, projectId, projectName,
    amount, date, reference, notes, createdBy: req.user._id,
  });
  success(res, { advanceSlip: slip }, `Advance slip ${slipNo} created`);
});

// DELETE /api/advance-slips/:id  (owner only, only if no recoveries yet)
exports.deleteAdvanceSlip = asyncHandler(async (req, res) => {
  const slip = await AdvanceSlip.findById(req.params.id);
  if (!slip) return notFound(res, 'Advance slip not found');
  if (slip.amountRecovered > 0) return badRequest(res, 'Cannot delete a slip with recorded recoveries');
  await slip.deleteOne();
  success(res, {}, 'Advance slip deleted');
});

// ── Archive / Unarchive ────────────────────────────────────────
exports.archiveAdvanceSlip = asyncHandler(async (req, res) => {
  const slip = await AdvanceSlip.findById(req.params.id);
  if (!slip) return notFound(res, 'Advance slip not found');
  slip.isArchived = true;
  slip.archivedAt = new Date();
  await slip.save();
  success(res, { advanceSlip: slip }, 'Advance slip archived');
});

exports.unarchiveAdvanceSlip = asyncHandler(async (req, res) => {
  const slip = await AdvanceSlip.findById(req.params.id);
  if (!slip) return notFound(res, 'Advance slip not found');
  slip.isArchived = false;
  slip.archivedAt = null;
  await slip.save();
  success(res, { advanceSlip: slip }, 'Advance slip unarchived');
});

// PATCH /api/advance-slips/archive-bulk  — body: { ids: string[] }
exports.archiveAdvanceSlipsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one advance slip id');
  await AdvanceSlip.updateMany({ _id: { $in: ids } }, { isArchived: true, archivedAt: new Date() });
  success(res, {}, `${ids.length} advance slip(s) archived`);
});

// PATCH /api/advance-slips/unarchive-bulk  — body: { ids: string[] }
exports.unarchiveAdvanceSlipsBulk = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return badRequest(res, 'Provide at least one advance slip id');
  await AdvanceSlip.updateMany({ _id: { $in: ids } }, { isArchived: false, archivedAt: null });
  success(res, {}, `${ids.length} advance slip(s) unarchived`);
});
