const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const RecurringSchedule = require('../models/RecurringSchedule');
const User = require('../models/User');
const { advanceByFrequency } = require('../utils/recurringSchedule');
const { logAudit } = require('../utils/auditLog');
const { timingSafeEqualStr } = require('../utils/secretCompare');

const CRON_SECRET_HEADER = 'x-cron-secret';
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

exports.listRecurringSchedules = asyncHandler(async (req, res) => {
  const schedules = await RecurringSchedule.find({}).populate('createdBy', 'name email').sort({ createdAt: -1 }).lean();
  success(res, { schedules });
});

exports.createRecurringSchedule = asyncHandler(async (req, res) => {
  const { entityType, label, templateData, frequency, startDate, endDate } = req.body;
  if (!['WorkOrder', 'Bill'].includes(entityType)) return badRequest(res, 'entityType must be WorkOrder or Bill');
  if (!label?.trim()) return badRequest(res, 'Label is required');
  if (!templateData || typeof templateData !== 'object') return badRequest(res, 'templateData is required');
  if (!FREQUENCIES.includes(frequency)) return badRequest(res, `frequency must be one of ${FREQUENCIES.join(', ')}`);
  if (!startDate) return badRequest(res, 'startDate is required');

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return badRequest(res, 'startDate is not a valid date');
  const end = endDate ? new Date(endDate) : null;
  if (end && Number.isNaN(end.getTime())) return badRequest(res, 'endDate is not a valid date');
  if (end && end <= start) return badRequest(res, 'endDate must be after startDate');

  const schedule = await RecurringSchedule.create({
    entityType, label: label.trim(), templateData, frequency,
    startDate: start, endDate: end, nextRunAt: start,
    createdBy: req.user._id,
  });

  await logAudit({
    action: 'CREATE', module: 'recurring-billing', user: req.user,
    description: `Created recurring ${entityType} schedule "${schedule.label}" (${frequency}, starting ${start.toDateString()})`,
    entityType: 'RecurringSchedule', entityId: schedule._id, entityLabel: schedule.label,
  });

  created(res, { schedule }, `Recurring schedule "${schedule.label}" created`);
});

exports.toggleRecurringSchedule = asyncHandler(async (req, res) => {
  const schedule = await RecurringSchedule.findById(req.params.id);
  if (!schedule) return notFound(res, 'Schedule not found');
  schedule.isActive = !!req.body.isActive;
  await schedule.save();

  await logAudit({
    action: 'UPDATE', module: 'recurring-billing', user: req.user,
    description: `${schedule.isActive ? 'Resumed' : 'Paused'} recurring schedule "${schedule.label}"`,
    entityType: 'RecurringSchedule', entityId: schedule._id, entityLabel: schedule.label,
  });

  success(res, { schedule }, `Schedule ${schedule.isActive ? 'resumed' : 'paused'}`);
});

exports.deleteRecurringSchedule = asyncHandler(async (req, res) => {
  const schedule = await RecurringSchedule.findById(req.params.id);
  if (!schedule) return notFound(res, 'Schedule not found');
  await schedule.deleteOne();

  await logAudit({
    action: 'DELETE', module: 'recurring-billing', user: req.user,
    description: `Deleted recurring schedule "${schedule.label}"`,
    entityType: 'RecurringSchedule', entityId: schedule._id, entityLabel: schedule.label,
  });

  success(res, {}, 'Schedule deleted');
});

// A no-op response shim for the in-process createWorkOrder/submitWorkOrder/
// createBill calls below — mirrors the established pattern elsewhere in this
// codebase for running a real Express handler server-side without an actual
// HTTP round trip, just enough of res for asyncHandler/responseFormatter to
// not blow up, and capturing the body so this function can tell success from
// failure without re-parsing an HTTP response.
function buildResShim() {
  const shim = { statusCode: 200, body: null };
  shim.status = (code) => { shim.statusCode = code; return shim; };
  shim.json = (body) => { shim.body = body; return shim; };
  return shim;
}

async function runOneSchedule(schedule) {
  const actor = await User.findById(schedule.createdBy);
  if (!actor) throw new Error('The user who created this schedule no longer exists');

  // asyncHandler routes a thrown error to Express's `next`, not back to the
  // caller — passed a capturing stand-in here (instead of a silent no-op) so
  // a genuine bug inside the handler surfaces as a real error message below
  // instead of the generic "did not return a ___" fallback.
  let caughtErr = null;
  const captureNext = (err) => { caughtErr = err; };

  if (schedule.entityType === 'WorkOrder') {
    const { createWorkOrder, submitWorkOrder } = require('./workOrderController');
    const createRes = buildResShim();
    // issueDate and scopeOfWork are both validator-required
    // (workOrder.validator.js) but a schedule's templateData is captured once
    // at setup time, long before any individual run happens — issueDate must
    // be "today" at each actual creation, not whatever date the schedule was
    // configured on. scopeOfWork falls back to the schedule's own
    // description if the template didn't carry a distinct one.
    await createWorkOrder({
      body: { scopeOfWork: schedule.templateData.description || schedule.label, ...schedule.templateData, issueDate: new Date() },
      user: actor,
    }, createRes, captureNext);
    if (caughtErr) throw caughtErr;
    if (createRes.statusCode >= 400) throw new Error(createRes.body?.message || 'Failed to create work order');
    const workOrder = createRes.body?.data?.workOrder;
    if (!workOrder) throw new Error('createWorkOrder did not return a work order');

    const submitRes = buildResShim();
    await submitWorkOrder({ params: { id: workOrder._id }, body: {}, user: actor }, submitRes, captureNext);
    if (caughtErr) throw caughtErr;
    if (submitRes.statusCode >= 400) throw new Error(submitRes.body?.message || 'Failed to submit work order');

    return { entityId: workOrder._id, entityLabel: workOrder.workOrderNo };
  }

  // Bill — a fixed-amount manual bill (Billing -> New Bill's own createBill),
  // never saveAsDraft, so it enters the approval chain immediately like a
  // human-made one would.
  const { createBill } = require('./billController');
  const createRes = buildResShim();
  // billDate is validator-required (bill.validator.js) and must be "today"
  // at each actual run, same reasoning as issueDate above for WorkOrder.
  await createBill({ body: { ...schedule.templateData, billDate: new Date(), saveAsDraft: false }, user: actor }, createRes, captureNext);
  if (caughtErr) throw caughtErr;
  if (createRes.statusCode >= 400) throw new Error(createRes.body?.message || 'Failed to create bill');
  const bill = createRes.body?.data?.bill;
  if (!bill) throw new Error('createBill did not return a bill');

  return { entityId: bill._id, entityLabel: bill.billNo };
}

// GET /api/recurring/run-due — hit once a day by an external cron (same
// shared-secret pattern as the scheduled backup email in backupController.js)
// — finds every active schedule whose nextRunAt has passed and replays its
// saved template through the real create(+submit) handlers. Responds
// immediately once the secret check passes and runs the actual batch in the
// background, same reasoning as the backup endpoint: the external cron only
// needs to know the job started, not wait for every schedule to finish.
exports.runDueSchedules = asyncHandler(async (req, res) => {
  if (!timingSafeEqualStr(req.get(CRON_SECRET_HEADER), process.env.BACKUP_CRON_SECRET)) {
    return badRequest(res, 'Missing or incorrect cron secret');
  }

  success(res, {}, 'Recurring schedules run started');

  (async () => {
    const now = new Date();
    const due = await RecurringSchedule.find({
      isActive: true,
      nextRunAt: { $lte: now },
      $or: [{ endDate: null }, { endDate: { $gte: now } }],
    });

    for (const schedule of due) {
      try {
        const { entityId, entityLabel } = await runOneSchedule(schedule);
        schedule.runHistory.push({ ranAt: now, success: true, entityId, entityLabel });
        schedule.lastRunAt = now;
        schedule.nextRunAt = advanceByFrequency(schedule.nextRunAt, schedule.frequency, schedule.startDate);
        await schedule.save();
      } catch (err) {
        console.error(`[recurring] schedule "${schedule.label}" (${schedule._id}) failed:`, err);
        schedule.runHistory.push({ ranAt: now, success: false, error: err.message });
        // Still advance nextRunAt past a failed attempt — otherwise one bad
        // run (e.g. a vendor since deactivated) retries forever on every
        // future cron tick instead of surfacing once and waiting for the
        // next real due date, same as a human would just try again later.
        schedule.lastRunAt = now;
        schedule.nextRunAt = advanceByFrequency(schedule.nextRunAt, schedule.frequency, schedule.startDate);
        await schedule.save().catch((saveErr) => console.error('[recurring] failed to save failure state:', saveErr));
      }
    }
  })().catch((err) => console.error('[recurring] batch run failed:', err));
});
