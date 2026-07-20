const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/responseFormatter');

// GET /api/audit-logs?module=&action=&dateFrom=&dateTo=&search=&page=&limit=
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { module, action, dateFrom, dateTo, search } = req.query;
  const page  = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const filter = {};
  if (module) filter.module = module;
  if (action) filter.action = action;
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

// GET /api/audit-logs/modules — distinct module values seen so far, for the filter dropdown
exports.listAuditLogModules = asyncHandler(async (req, res) => {
  const modules = await AuditLog.distinct('module');
  success(res, { modules: modules.sort() });
});
