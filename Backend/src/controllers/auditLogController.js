const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/responseFormatter');

// GET /api/audit-logs?module=&action=&source=&dateFrom=&dateTo=&search=&page=&limit=
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { module, action, source, dateFrom, dateTo, search } = req.query;
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const filter = {};
  if (module) filter.module = module;
  if (action) filter.action = action;
  // "System" covers webhook/cron/public-form actors, which are written with
  // userId: null (see utils/auditLog.js) since there's no logged-in user to
  // attribute them to.
  if (source === 'user') filter.userId = { $ne: null };
  if (source === 'system') filter.userId = null;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom + 'T00:00:00.000Z');
    if (dateTo)   filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }
  if (search) {
    filter.$or = [
      { description: { $regex: search, $options: 'i' } },
      { userName:    { $regex: search, $options: 'i' } },
      { userEmail:   { $regex: search, $options: 'i' } },
      { entityLabel: { $regex: search, $options: 'i' } },
    ];
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  success(res, { logs, total, page, limit });
});

// GET /api/audit-logs/summary — per-module {module, count, lastActivityAt},
// for the module-flashcard landing page. The frontend owns the canonical list
// of all modules (including ones with zero logs so far) and merges counts in
// by key — this endpoint only reports on modules that actually have data.
exports.listAuditLogSummary = asyncHandler(async (req, res) => {
  const summary = await AuditLog.aggregate([
    { $group: { _id: '$module', count: { $sum: 1 }, lastActivityAt: { $max: '$createdAt' } } },
    { $project: { _id: 0, module: '$_id', count: 1, lastActivityAt: 1 } },
  ]);
  success(res, { summary });
});
