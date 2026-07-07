const AdvanceSlip   = require('../models/AdvanceSlip');
const asyncHandler  = require('../middleware/asyncHandler');
const { success, notFound, badRequest } = require('../utils/response');

// Auto-increment slip number: ADV-0001, ADV-0002 ...
async function nextSlipNo() {
  const last = await AdvanceSlip.findOne().sort({ createdAt: -1 }).select('slipNo');
  if (!last?.slipNo) return 'ADV-0001';
  const m = last.slipNo.match(/(\d+)$/);
  return m ? `ADV-${String(Number(m[1]) + 1).padStart(4, '0')}` : 'ADV-0001';
}

// GET /api/advance-slips
exports.listAdvanceSlips = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.projectId)      filter.projectId      = req.query.projectId;
  if (req.query.contractorCode) filter.contractorCode = req.query.contractorCode;
  if (req.query.status)         filter.status         = req.query.status;

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
