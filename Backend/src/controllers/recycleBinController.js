const mongoose = require('mongoose');
const DeletedRecord = require('../models/DeletedRecord');
const asyncHandler = require('../utils/asyncHandler');
const { success, notFound, badRequest, fail } = require('../utils/responseFormatter');
const { RECYCLABLE, restoreDeleted } = require('../utils/recycleBin');
const { logAudit } = require('../utils/auditLog');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/recycle-bin?type=&q=&includeRestored=true&limit=
// Lists deleted records WITHOUT their (large) snapshots.
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.type) {
    if (!Object.hasOwn(RECYCLABLE, req.query.type)) return badRequest(res, 'Unknown record type');
    filter.entityType = req.query.type;
  }
  if (req.query.includeRestored !== 'true') filter.restoredAt = null;
  if (req.query.q) filter.label = { $regex: escapeRegex(String(req.query.q).trim().slice(0, 100)), $options: 'i' };
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);

  const [rows, total] = await Promise.all([
    DeletedRecord.find(filter).select('-snapshot').sort({ deletedAt: -1 }).limit(limit).lean(),
    DeletedRecord.countDocuments(filter),
  ]);
  const types = Object.entries(RECYCLABLE).map(([key, c]) => ({ key, title: c.title }));
  success(res, { rows: rows.map((r) => ({ ...r, typeTitle: RECYCLABLE[r.entityType]?.title || r.entityType })), total, types });
});

// GET /api/recycle-bin/:id — one entry including the full snapshot (for the preview).
exports.getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid id');
  const row = await DeletedRecord.findById(req.params.id).lean();
  if (!row) return notFound(res, 'Recycle Bin entry not found');
  success(res, { row: { ...row, typeTitle: RECYCLABLE[row.entityType]?.title || row.entityType } });
});

// POST /api/recycle-bin/:id/restore
exports.restore = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid id');
  let result;
  try {
    result = await restoreDeleted(req.params.id, req.user);
  } catch (e) {
    // e.g. the stored copy no longer satisfies a unique index — report it, don't crash.
    return fail(res, `Restore failed: ${e.message}`, 409);
  }
  if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error });
  await logAudit({
    action: 'CREATE', module: 'recycle-bin', user: req.user,
    description: `Restored ${result.title} ${result.label} from the Recycle Bin`,
    entityType: result.entityType, entityId: result.entityId, entityLabel: result.label,
  });
  success(res, { restored: { entityType: result.entityType, entityId: result.entityId, label: result.label } }, `${result.title} ${result.label} restored`);
});
