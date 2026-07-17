const ReportSchedule = require('../models/ReportSchedule');
const asyncHandler    = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// GET /api/report-schedules
exports.listSchedules = asyncHandler(async (req, res) => {
  const schedules = await ReportSchedule.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
  success(res, { schedules });
});

// POST /api/report-schedules
exports.createSchedule = asyncHandler(async (req, res) => {
  const { viewType, projectId, projectName, timeOfDay } = req.body;
  if (!['operational', 'financial'].includes(viewType)) {
    return badRequest(res, 'viewType must be operational or financial');
  }
  if (!TIME_RE.test(timeOfDay)) return badRequest(res, 'timeOfDay must be in HH:mm 24-hour format');

  const schedule = await ReportSchedule.create({
    createdBy: req.user._id,
    viewType,
    projectId: projectId || null,
    projectName: projectName || 'All Projects',
    timeOfDay,
  });
  created(res, { schedule });
});

// DELETE /api/report-schedules/:id
exports.deleteSchedule = asyncHandler(async (req, res) => {
  const schedule = await ReportSchedule.findOne({ _id: req.params.id, createdBy: req.user._id });
  if (!schedule) return notFound(res, 'Schedule not found');
  await schedule.deleteOne();
  success(res, null, 'Schedule deleted');
});

// GET /api/report-schedules/due
// Lazily checked on dashboard load (same "compute on read" approach as the SLA
// snapshot capture) — no cron process. A schedule is "due" once its timeOfDay
// has passed today and it hasn't already been flagged today. Marking it
// notified here is the only "delivery": there's no email/SMTP wired up, so
// surfacing it in-app is what actually happens when a schedule fires.
exports.getDueSchedules = asyncHandler(async (req, res) => {
  const today = todayKey();
  const nowTime = nowHHmm();

  const candidates = await ReportSchedule.find({
    createdBy: req.user._id,
    active: true,
    lastNotifiedDate: { $ne: today },
  });

  const due = candidates.filter(s => s.timeOfDay <= nowTime);
  if (due.length) {
    await ReportSchedule.updateMany(
      { _id: { $in: due.map(s => s._id) } },
      { $set: { lastNotifiedDate: today } }
    );
  }
  success(res, { due });
});
