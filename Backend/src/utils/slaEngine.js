const WorkflowTemplate = require('../models/WorkflowTemplate');
const WorkflowInstance  = require('../models/WorkflowInstance');
const MISSnapshot       = require('../models/MISSnapshot');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR   = 18;

// Simple, dependency-free business-hours clock: walks forward hour by hour,
// skipping non-working days and hours outside the fixed 9am-6pm window.
function computeDueAt(startedAt, slaHours, businessHoursOnly, workingDays) {
  const start = new Date(startedAt);
  if (!businessHoursOnly) {
    return new Date(start.getTime() + slaHours * 60 * 60 * 1000);
  }

  const days = workingDays && workingDays.length ? workingDays : ['mon', 'tue', 'wed', 'thu', 'fri'];
  let remainingMinutes = slaHours * 60;
  const cursor = new Date(start);

  // Clamp starting point into the business window
  if (cursor.getHours() < BUSINESS_START_HOUR) {
    cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  } else if (cursor.getHours() >= BUSINESS_END_HOUR) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }
  while (!days.includes(DAY_KEYS[cursor.getDay()])) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }

  while (remainingMinutes > 0) {
    const minutesLeftToday = (BUSINESS_END_HOUR - cursor.getHours()) * 60 - cursor.getMinutes();
    if (remainingMinutes <= minutesLeftToday) {
      cursor.setMinutes(cursor.getMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesLeftToday;
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      while (!days.includes(DAY_KEYS[cursor.getDay()])) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }
  return cursor;
}

function buildInstanceStage(templateStage, startedAt) {
  return {
    name:                 templateStage.name,
    order:                templateStage.order,
    assignedRole:         templateStage.assignedRole,
    assignedUserId:       templateStage.assignedUserId || null,
    slaHours:             templateStage.slaHours,
    businessHoursOnly:    templateStage.businessHoursOnly,
    workingDays:          templateStage.workingDays,
    escalateAfterMinutes: templateStage.escalateAfterMinutes,
    escalateToUserId:     templateStage.escalateToUserId || null,
    startedAt,
    dueAt: computeDueAt(startedAt, templateStage.slaHours, templateStage.businessHoursOnly, templateStage.workingDays),
    status: 'in-progress',
  };
}

// Starts a new WorkflowInstance for an entity if an active template exists for its type.
// No-ops (returns null) if no active template is configured — templates are opt-in.
// `meta` (all optional) carries reporting context so the MIS report can group/sum by
// project, contractor, and value without re-joining WorkOrder/BillRequest documents.
async function startInstance(entityType, entityId, entityLabel, actorUserId, meta = {}) {
  const template = await WorkflowTemplate.findOne({ entityType, isActive: true }).sort({ createdAt: 1 });
  if (!template || !template.stages.length) return null;

  const existing = await WorkflowInstance.findOne({ entityType, entityId, status: 'in-progress' });
  if (existing) return existing;

  const now = new Date();
  const orderedStages = [...template.stages].sort((a, b) => a.order - b.order);
  const stages = orderedStages.map((s, i) => i === 0
    ? buildInstanceStage(s, now)
    : { ...buildInstanceStage(s, now), status: 'pending', startedAt: null, dueAt: null });

  const instance = await WorkflowInstance.create({
    templateId:   template._id,
    templateName: template.name,
    entityType, entityId, entityLabel,
    projectId:  meta.projectId || null,
    projectName: meta.projectName || '',
    vendorName:  meta.vendorName || '',
    amount:      meta.amount || 0,
    status: 'in-progress',
    currentStageIndex: 0,
    stages,
    startedAt: now,
    createdBy: actorUserId || null,
  });
  return instance;
}

function completeStageAt(instance, stageIndex, completedByUserId, remarks) {
  const stage = instance.stages[stageIndex];
  const now = new Date();
  stage.completedAt = now;
  stage.completedBy = completedByUserId || null;
  if (remarks) stage.remarks = remarks;
  stage.status = 'completed';
  stage.delayMinutes = stage.dueAt
    ? Math.max(0, Math.round((now - stage.dueAt) / (60 * 1000)))
    : 0;

  const nextStage = instance.stages[stageIndex + 1];
  if (nextStage) {
    nextStage.startedAt = now;
    nextStage.dueAt = computeDueAt(now, nextStage.slaHours, nextStage.businessHoursOnly, nextStage.workingDays);
    nextStage.status = 'in-progress';
    instance.currentStageIndex = stageIndex + 1;
  } else {
    instance.status = 'completed';
    instance.completedAt = now;
  }
}

// Advances whatever running instance exists for an entity by one stage.
// No-ops silently if no in-progress instance exists — safe to call unconditionally.
async function advanceInstance(entityType, entityId, completedByUserId, remarks) {
  const instance = await WorkflowInstance.findOne({ entityType, entityId, status: 'in-progress' });
  if (!instance) return null;

  completeStageAt(instance, instance.currentStageIndex, completedByUserId, remarks);
  await instance.save();
  return instance;
}

// Cancels whatever running instance exists for an entity (e.g. a rejected bill request) —
// distinct from advancing, since the workflow didn't succeed, it dead-ended.
async function cancelInstance(entityType, entityId, reason) {
  const instance = await WorkflowInstance.findOne({ entityType, entityId, status: 'in-progress' });
  if (!instance) return null;

  instance.status = 'cancelled';
  instance.completedAt = new Date();
  const stage = instance.stages[instance.currentStageIndex];
  if (stage && reason) stage.remarks = reason;
  await instance.save();
  return instance;
}

// Completes an arbitrary stage by instance id (the generic "Mark as Complete" endpoint).
async function completeStageById(instanceId, stageId, completedByUserId, remarks) {
  const instance = await WorkflowInstance.findById(instanceId);
  if (!instance) return { error: 'not_found' };
  if (instance.status !== 'in-progress') return { error: 'not_in_progress' };

  const stageIndex = instance.stages.findIndex(s => String(s._id) === String(stageId));
  if (stageIndex === -1) return { error: 'stage_not_found' };
  if (stageIndex !== instance.currentStageIndex) return { error: 'not_current_stage' };

  completeStageAt(instance, stageIndex, completedByUserId, remarks);
  await instance.save();
  return { instance };
}

// Computed, read-time breach check — never persisted while a stage is open.
function isStageBreached(stage) {
  return stage.status === 'in-progress' && stage.dueAt && new Date(stage.dueAt) < new Date();
}

// Captures one MISSnapshot row per calendar day, the first time this is called that
// day (no-ops after that). No cron needed — same "compute on read" approach already
// used for breach detection. This is what accumulates into trend-over-time charts.
async function captureDailySnapshotIfNeeded(kpis) {
  const dateKey = new Date().toISOString().slice(0, 10);
  try {
    await MISSnapshot.create({ date: dateKey, ...kpis });
  } catch (err) {
    if (err.code !== 11000) throw err; // 11000 = already captured today, ignore
  }
}

module.exports = {
  computeDueAt,
  startInstance,
  advanceInstance,
  cancelInstance,
  completeStageById,
  isStageBreached,
  captureDailySnapshotIfNeeded,
};
