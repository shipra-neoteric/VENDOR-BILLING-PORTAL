// Masters → SLA: the working time (days and hours, IST) that every SLA clock runs on. Sunday is off by default.
const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const SlaConfig = require('../models/SlaConfig');
const { getSlaConfig, setSlaConfig, loadSlaConfig } = require('../utils/slaEngine');
const { logAudit } = require('../utils/auditLog');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

exports.getSlaConfig = asyncHandler(async (req, res) => {
  await loadSlaConfig();
  return success(res, { config: getSlaConfig() });
});

exports.updateSlaConfig = asyncHandler(async (req, res) => {
  const { workingDays, startHour, endHour } = req.body || {};
  if (!Array.isArray(workingDays) || workingDays.length === 0 || workingDays.some(d => !DAYS.includes(d))) {
    return badRequest(res, 'Choose at least one working day.');
  }
  const start = Number(startHour), end = Number(endHour);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > 23 || end < 1 || end > 24 || end <= start) {
    return badRequest(res, 'Working hours are invalid: the end hour must be after the start hour (0–24).');
  }
  const before = getSlaConfig();
  const doc = await SlaConfig.findOneAndUpdate(
    { _id: 'default' },
    { $set: { workingDays: DAYS.filter(d => workingDays.includes(d)), startHour: start, endHour: end, updatedBy: req.user?._id || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  const config = setSlaConfig(doc);
  try {
    await logAudit({ action: 'update', module: 'sla-settings', user: req.user, description: 'Updated the SLA working time', entityType: 'SlaConfig', entityLabel: 'SLA working time', changes: { workingDays: { from: before.workingDays, to: config.workingDays }, startHour: { from: before.startHour, to: config.startHour }, endHour: { from: before.endHour, to: config.endHour } }, ip: req.ip });
  } catch (_err) { /* audit must never block the save */ }
  return success(res, { config }, 'SLA working time saved');
});
