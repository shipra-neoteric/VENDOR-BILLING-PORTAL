const Stage    = require('../models/Stage');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound } = require('../utils/responseFormatter');
const { logAudit, diffFields } = require('../utils/auditLog');

exports.listStages = asyncHandler(async (req, res) => {
  const { projectId, categoryId } = req.query;
  const filter = {};
  if (projectId)  filter.projectId  = projectId;
  if (categoryId) filter.categoryId = categoryId;

  const stages = await Stage.find(filter)
    .populate('categoryId', 'name color')
    .sort({ sequence: 1, createdAt: 1 });

  const stagesWithProgress = await Promise.all(stages.map(async (stage) => {
    const activities = await Activity.find({ stageId: stage._id });
    const progress = activities.length
      ? Math.round(
          activities.reduce((s, a) =>
            s + (a.plannedQty > 0 ? Math.min(100, (a.completedQty / a.plannedQty) * 100) : 0), 0
          ) / activities.length
        )
      : 0;
    return { ...stage.toObject(), progress, activityCount: activities.length };
  }));

  success(res, { stages: stagesWithProgress });
});

exports.createStage = asyncHandler(async (req, res) => {
  const stage = await Stage.create({ ...req.body, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'stages', user: req.user,
    description: `Stage ${stage.name} created`,
    entityType: 'Stage', entityId: stage._id, entityLabel: stage.name,
  });

  created(res, { stage }, 'Stage created');
});

exports.updateStage = asyncHandler(async (req, res) => {
  const before = await Stage.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Stage not found');

  const stage = await Stage.findByIdAndUpdate(
    req.params.id, { $set: req.body }, { new: true, runValidators: true }
  );
  if (!stage) return notFound(res, 'Stage not found');

  const changes = diffFields(before, stage.toObject(), ['name', 'sequence', 'description', 'categoryId']);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'stages', user: req.user,
      description: `Updated stage ${stage.name}`,
      entityType: 'Stage', entityId: stage._id, entityLabel: stage.name,
      changes,
    });
  }

  success(res, { stage }, 'Stage updated');
});

exports.deleteStage = asyncHandler(async (req, res) => {
  const stage = await Stage.findByIdAndDelete(req.params.id);
  if (!stage) return notFound(res, 'Stage not found');
  await Activity.deleteMany({ stageId: req.params.id });

  await logAudit({
    action: 'DELETE', module: 'stages', user: req.user,
    description: `Deleted stage ${stage.name}`,
    entityType: 'Stage', entityId: stage._id, entityLabel: stage.name,
  });

  success(res, null, 'Stage deleted');
});
