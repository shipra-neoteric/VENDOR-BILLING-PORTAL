const Milestone         = require('../models/Milestone');
const MilestoneActivity = require('../models/MilestoneActivity');
const Activity          = require('../models/Activity');
const asyncHandler      = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

exports.listMilestones = asyncHandler(async (req, res) => {
  const { projectId, stageId, categoryId, workOrderId } = req.query;
  const filter = {};
  if (projectId)   filter.projectId   = projectId;
  if (stageId)     filter.stageId     = stageId;
  if (categoryId)  filter.categoryId  = categoryId;
  if (workOrderId) filter.workOrderId = workOrderId;

  const milestones = await Milestone.find(filter)
    .populate('billId', 'billNo status amount')
    .sort({ createdAt: 1 });

  const enriched = await Promise.all(milestones.map(async (m) => {
    const mas = await MilestoneActivity.find({ milestoneId: m._id })
      .populate('activityId', 'name plannedQty completedQty unit status');

    const currentProgress = mas.length
      ? Math.round(
          mas.reduce((s, ma) => {
            const act = ma.activityId;
            if (!act) return s;
            const pct = act.plannedQty > 0
              ? Math.min(100, (act.completedQty / act.plannedQty) * 100) : 0;
            return s + pct;
          }, 0) / mas.length
        )
      : 0;

    return {
      ...m.toObject(),
      activities: mas.map(ma => ({
        ...(ma.activityId?.toObject?.() || {}),
        requiredPercentage: ma.requiredPercentage,
      })),
      currentProgress,
    };
  }));

  success(res, { milestones: enriched });
});

exports.createMilestone = asyncHandler(async (req, res) => {
  const milestone = await Milestone.create({ ...req.body, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'milestones', user: req.user,
    description: `Milestone "${milestone.name}" created`,
    entityType: 'Milestone', entityId: milestone._id, entityLabel: milestone.name,
  });

  created(res, { milestone }, 'Milestone created');
});

exports.updateMilestone = asyncHandler(async (req, res) => {
  const before = await Milestone.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Milestone not found');

  const milestone = await Milestone.findByIdAndUpdate(
    req.params.id, { $set: req.body }, { new: true, runValidators: true }
  );
  if (!milestone) return notFound(res, 'Milestone not found');

  const changes = diffFields(before, milestone.toObject(), Object.keys(req.body));
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'milestones', user: req.user,
      description: `Milestone "${milestone.name}" updated`,
      entityType: 'Milestone', entityId: milestone._id, entityLabel: milestone.name,
      changes,
    });
  }

  success(res, { milestone });
});

exports.deleteMilestone = asyncHandler(async (req, res) => {
  const milestone = await Milestone.findByIdAndDelete(req.params.id);
  if (!milestone) return notFound(res, 'Milestone not found');
  await MilestoneActivity.deleteMany({ milestoneId: req.params.id });

  await logAudit({
    action: 'DELETE', module: 'milestones', user: req.user,
    description: `Milestone "${milestone.name}" deleted`,
    entityType: 'Milestone', entityId: milestone._id, entityLabel: milestone.name,
  });

  success(res, null, 'Milestone deleted');
});

exports.linkActivity = asyncHandler(async (req, res) => {
  const { activityId, requiredPercentage = 100 } = req.body;
  if (!activityId) return badRequest(res, 'activityId is required');

  const activity = await Activity.findById(activityId);
  if (!activity) return notFound(res, 'Activity not found');

  const existing = await MilestoneActivity.findOne({ milestoneId: req.params.id, activityId });
  if (existing) return badRequest(res, 'Activity already linked to this milestone');

  const ma = await MilestoneActivity.create({
    milestoneId: req.params.id,
    activityId,
    requiredPercentage,
  });

  const milestone = await Milestone.findById(req.params.id).select('name');
  await logAudit({
    action: 'CREATE', module: 'milestones', user: req.user,
    description: `Linked activity "${activity.name}" to milestone "${milestone?.name || ''}"`,
    entityType: 'MilestoneActivity', entityId: ma._id, entityLabel: `${milestone?.name || ''} — ${activity.name}`,
  });

  success(res, { milestoneActivity: ma }, 'Activity linked to milestone');
});

exports.unlinkActivity = asyncHandler(async (req, res) => {
  const ma = await MilestoneActivity.findOneAndDelete({
    milestoneId: req.params.id,
    activityId:  req.params.actId,
  });
  if (!ma) return notFound(res, 'Link not found');

  const [milestone, activity] = await Promise.all([
    Milestone.findById(req.params.id).select('name'),
    Activity.findById(req.params.actId).select('name'),
  ]);
  await logAudit({
    action: 'DELETE', module: 'milestones', user: req.user,
    description: `Unlinked activity "${activity?.name || ''}" from milestone "${milestone?.name || ''}"`,
    entityType: 'MilestoneActivity', entityId: ma._id, entityLabel: `${milestone?.name || ''} — ${activity?.name || ''}`,
  });

  success(res, null, 'Activity unlinked from milestone');
});
