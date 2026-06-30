const Stage    = require('../models/Stage');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound } = require('../utils/responseFormatter');

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
  created(res, { stage }, 'Stage created');
});

exports.updateStage = asyncHandler(async (req, res) => {
  const stage = await Stage.findByIdAndUpdate(
    req.params.id, { $set: req.body }, { new: true, runValidators: true }
  );
  if (!stage) return notFound(res, 'Stage not found');
  success(res, { stage }, 'Stage updated');
});

exports.deleteStage = asyncHandler(async (req, res) => {
  const stage = await Stage.findByIdAndDelete(req.params.id);
  if (!stage) return notFound(res, 'Stage not found');
  await Activity.deleteMany({ stageId: req.params.id });
  success(res, null, 'Stage deleted');
});
