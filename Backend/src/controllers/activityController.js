const Activity          = require('../models/Activity');
const Milestone         = require('../models/Milestone');
const MilestoneActivity = require('../models/MilestoneActivity');
const WorkOrder         = require('../models/WorkOrder');
const RunningBill       = require('../models/RunningBill');
const asyncHandler      = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextBillNo } = require('../utils/codeGen');

exports.listActivities = asyncHandler(async (req, res) => {
  const { stageId, projectId, workOrderId } = req.query;
  const filter = {};
  if (stageId)     filter.stageId     = stageId;
  if (projectId)   filter.projectId   = projectId;
  if (workOrderId) filter.workOrderId = workOrderId;

  const activities = await Activity.find(filter)
    .populate('workOrderId', 'workOrderNo contractValue')
    .sort({ createdAt: 1 });

  success(res, { activities });
});

exports.createActivity = asyncHandler(async (req, res) => {
  const wo = await WorkOrder.findById(req.body.workOrderId);
  if (!wo) return notFound(res, 'Work order not found');

  const activity = await Activity.create({
    ...req.body,
    vendorCode: wo.vendorCode,
    vendorName: wo.vendorName,
    createdBy:  req.user._id,
    updatedBy:  req.user._id,
  });
  created(res, { activity }, 'Activity created');
});

exports.updateActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findByIdAndUpdate(
    req.params.id,
    { $set: { ...req.body, updatedBy: req.user._id } },
    { new: true, runValidators: true }
  );
  if (!activity) return notFound(res, 'Activity not found');
  success(res, { activity });
});

exports.updateProgress = asyncHandler(async (req, res) => {
  const { completedQty, remarks } = req.body;
  if (completedQty === undefined || completedQty < 0) {
    return badRequest(res, 'completedQty must be >= 0');
  }

  const activity = await Activity.findById(req.params.id);
  if (!activity) return notFound(res, 'Activity not found');

  if (Number(completedQty) > activity.plannedQty) {
    return badRequest(res, `completedQty (${completedQty}) cannot exceed plannedQty (${activity.plannedQty})`);
  }

  const pct = activity.plannedQty > 0 ? (Number(completedQty) / activity.plannedQty) * 100 : 0;
  activity.completedQty = Number(completedQty);
  activity.status       = pct >= 100 ? 'completed' : pct > 0 ? 'in-progress' : 'not-started';
  activity.updatedBy    = req.user._id;
  if (remarks !== undefined) activity.remarks = remarks;
  await activity.save();

  // ── Milestone engine ──────────────────────────────────────────
  const linkedMAs = await MilestoneActivity.find({ activityId: activity._id });

  for (const ma of linkedMAs) {
    const milestone = await Milestone.findById(ma.milestoneId);
    if (!milestone || milestone.achieved) continue;

    const allMAs = await MilestoneActivity.find({ milestoneId: milestone._id });
    let allMet = true;
    for (const m of allMAs) {
      const act = await Activity.findById(m.activityId);
      if (!act) { allMet = false; break; }
      const actPct = act.plannedQty > 0 ? (act.completedQty / act.plannedQty) * 100 : 0;
      if (actPct < (m.requiredPercentage || 100)) { allMet = false; break; }
    }

    if (allMet) {
      milestone.achieved      = true;
      milestone.achievedDate  = new Date();
      milestone.paymentStatus = 'eligible';
      await milestone.save();

      // Auto-generate Running Bill
      try {
        const billNo = await nextBillNo();
        const bill   = await RunningBill.create({
          billNo,
          workOrderId: milestone.workOrderId,
          projectId:   milestone.projectId,
          vendorCode:  milestone.vendorCode,
          vendorName:  milestone.vendorName,
          billDate:    new Date(),
          generatedBy: `Milestone: ${milestone.name}`,
          amount:      milestone.paymentAmount,
          lineItems: [{
            description: milestone.name,
            unit:        'Lump Sum',
            plannedQty:  1,
            billedQty:   1,
            rate:        milestone.paymentAmount,
            amount:      milestone.paymentAmount,
          }],
          status:      'submitted',
          submittedAt: new Date(),
          remarks:     `Auto-generated — milestone achieved: ${milestone.name}`,
          createdBy:   req.user._id,
        });
        milestone.billId        = bill._id;
        milestone.paymentStatus = 'bill-generated';
        await milestone.save();
      } catch (billErr) {
        console.error('Auto-bill generation failed:', billErr.message);
      }
    }
  }
  // ── End milestone engine ──────────────────────────────────────

  success(res, { activity }, 'Progress updated');
});

exports.deleteActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findByIdAndDelete(req.params.id);
  if (!activity) return notFound(res, 'Activity not found');
  await MilestoneActivity.deleteMany({ activityId: req.params.id });
  success(res, null, 'Activity deleted');
});
