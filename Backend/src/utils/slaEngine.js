const WorkflowTemplate = require('../models/WorkflowTemplate');
const WorkflowInstance  = require('../models/WorkflowInstance');
const MISSnapshot       = require('../models/MISSnapshot');
const SlaConfig         = require('../models/SlaConfig');
const mongoose          = require('mongoose');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const IST_MS = 330 * 60000;

// ── Working time ──────────────────────────────────────────────────────────
// Every SLA clock runs only inside the working time — by default Monday–Saturday, 9am–6pm IST (never Sunday) — whatever a stage's own
// "business hours" flag says. It is edited from Masters → SLA and loaded from the SlaConfig document (kept in memory, refreshed every minute).
const DEFAULT_CONFIG = { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], startHour: 9, endHour: 18 };
let slaConfig = { ...DEFAULT_CONFIG };

function sanitizeConfig(c) {
  const days = DAY_KEYS.filter(d => c && Array.isArray(c.workingDays) && c.workingDays.includes(d));
  let start = c && Number.isInteger(c.startHour) ? c.startHour : DEFAULT_CONFIG.startHour;
  let end = c && Number.isInteger(c.endHour) ? c.endHour : DEFAULT_CONFIG.endHour;
  if (start < 0 || start > 23) start = DEFAULT_CONFIG.startHour;
  if (end <= start || end > 24) end = Math.min(24, Math.max(start + 1, DEFAULT_CONFIG.endHour));
  return { workingDays: days.length ? days : [...DEFAULT_CONFIG.workingDays], startHour: start, endHour: end };
}
const getSlaConfig = () => slaConfig;
const setSlaConfig = (c) => { slaConfig = sanitizeConfig(c); return slaConfig; };
async function loadSlaConfig() {
  try {
    const doc = await SlaConfig.findById('default').lean();
    slaConfig = doc ? sanitizeConfig(doc) : { ...DEFAULT_CONFIG };
  } catch (_err) { /* keep whatever is in memory */ }
}
if (mongoose.connection.readyState === 1) loadSlaConfig(); else mongoose.connection.once('open', loadSlaConfig);
setInterval(loadSlaConfig, 60000).unref();

// Wall-clock helpers: a Date shifted by +5:30 and read with the getUTC* methods is the IST clock, on any server timezone.
const toIst = (d) => new Date(new Date(d).getTime() + IST_MS);
const fromIst = (d) => new Date(d.getTime() - IST_MS);

// Due time = start + slaHours counted only inside the working time (the stage's own flags are ignored on purpose).
function computeDueAt(startedAt, slaHours) {
  const { workingDays: days, startHour, endHour } = slaConfig;
  let remainingMinutes = Math.round(slaHours * 60);
  const c = toIst(startedAt);
  const nextDayStart = () => { c.setUTCDate(c.getUTCDate() + 1); c.setUTCHours(startHour, 0, 0, 0); };

  if (c.getUTCHours() < startHour) c.setUTCHours(startHour, 0, 0, 0);
  else if (c.getUTCHours() >= endHour) nextDayStart();
  while (!days.includes(DAY_KEYS[c.getUTCDay()])) nextDayStart();

  while (remainingMinutes > 0) {
    const minutesLeftToday = (endHour - c.getUTCHours()) * 60 - c.getUTCMinutes();
    if (remainingMinutes <= minutesLeftToday) {
      c.setUTCMinutes(c.getUTCMinutes() + remainingMinutes);
      remainingMinutes = 0;
    } else {
      remainingMinutes -= minutesLeftToday;
      nextDayStart();
      while (!days.includes(DAY_KEYS[c.getUTCDay()])) nextDayStart();
    }
  }
  return fromIst(c);
}

// Minutes actually spent inside the working time between two timestamps — how overdue a stage is. Plain calendar time would count
// nights and Sundays, so a stage missed by one hour on Saturday evening would look about a day late by Monday.
function businessMinutesBetween(from, to) {
  const { workingDays: days, startHour, endHour } = slaConfig;
  const start = toIst(from);
  const end = toIst(to);
  if (end <= start) return 0;

  let total = 0;
  const dayCursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const lastDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (dayCursor.getTime() <= lastDay) {
    if (days.includes(DAY_KEYS[dayCursor.getUTCDay()])) {
      const winStart = new Date(dayCursor); winStart.setUTCHours(startHour, 0, 0, 0);
      const winEnd = new Date(dayCursor); winEnd.setUTCHours(endHour, 0, 0, 0);
      const overlapStart = start > winStart ? start : winStart;
      const overlapEnd = end < winEnd ? end : winEnd;
      if (overlapEnd > overlapStart) total += Math.round((overlapEnd - overlapStart) / 60000);
    }
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }
  return total;
}

// Stages temporarily excluded from every breach/overdue calculation below —
// NOT removed from the workflow itself (the stage still exists, still runs,
// still shows in the timeline) — just silenced everywhere SLA breach/overdue
// numbers are computed, since "Payment Released" only completes once TMS
// sends its payment-confirmed callback, and that integration isn't reliably
// firing yet — until it is, every bill sent to TMS piles up huge, real but
// misleading overdue numbers against whoever's assigned that stage. Remove
// an entry here (not the stage/template) once TMS callbacks are trustworthy.
const SLA_EXCLUDED_STAGES = new Set(['Payment Released']);

// The due time a stage is held to now: its start + SLA hours counted in the working time (so old stages that were saved with a
// calendar-time due date are judged by the same rule as new ones).
function effectiveDueAt(stage) {
  if (stage && stage.startedAt && stage.slaHours) return computeDueAt(stage.startedAt, stage.slaHours);
  return stage && stage.dueAt ? new Date(stage.dueAt) : null;
}

// How overdue a stage actually is, in working minutes. Returns 0 if not overdue, or if this stage is temporarily excluded from SLA
// counting (see SLA_EXCLUDED_STAGES).
function overdueMinutesFor(stage, now) {
  if (!stage) return 0;
  if (SLA_EXCLUDED_STAGES.has(stage.name)) return 0;
  const due = effectiveDueAt(stage);
  if (!due) return 0;
  const at = now || new Date();
  if (at <= due) return 0;
  return businessMinutesBetween(due, at);
}

// Re-judges loaded workflow instances (one or a list, lean or hydrated) by the current working-time rule, in memory only (nothing is
// saved): every started stage gets its due time recalculated, and a completed stage's delay is recalculated from its real completion time.
function normalizeInstances(instances) {
  const list = Array.isArray(instances) ? instances : [instances];
  for (const inst of list) {
    if (!inst || !inst.stages) continue;
    for (const st of inst.stages) {
      if (st.status === 'pending' || !st.startedAt || !st.slaHours) continue;
      const due = computeDueAt(st.startedAt, st.slaHours);
      st.dueAt = due;
      if (st.status === 'completed' && st.completedAt) {
        st.delayMinutes = new Date(st.completedAt) > due ? businessMinutesBetween(due, st.completedAt) : 0;
      }
    }
  }
  return instances;
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
    dueAt: computeDueAt(startedAt, templateStage.slaHours),
    status: 'in-progress',
  };
}

// A BillRequest's own approval chain isn't fixed at 2 levels (AGM+GM) — a
// department's Approval Rule (Users -> Departments) can require 3 or 4. The
// shared WorkflowTemplate only ever has one generic second-level stage
// (named "GM Approval" or "L2 Approval" depending on how it's been renamed
// in SLA Settings — see approvalStages.js's own AGM/GM -> L1/L2 rename), so
// when a department needs more, extra "L3 Approval"/"L4 Approval" stages are
// inserted right after it (before Accounts Verification) — cloning that
// stage's own SLA/business-hours settings, since there's no dedicated
// template stage to source those from otherwise. Without this, a bill
// request's SLA timeline would get stuck showing that stage as the current
// one forever once it actually moved on to L3/L4.
//
// Matches by /\bgm\b|\bl2\b/ (word-boundaried) rather than one exact string
// — this deliberately matches EITHER "GM Approval" or "L2 Approval" (or
// just "GM"/"L2"), so renaming the template's stage name in SLA Settings
// (a normal admin action, not a code change) can't silently break this
// insertion point the way a single hardcoded string comparison would.
// \bgm\b does NOT match "AGM Approval" (no word boundary before the "gm" in
// "AGM") — only a genuine standalone "GM"/"L2" token.
function expandBillRequestStages(templateStages, requiredApprovals) {
  if (!requiredApprovals || requiredApprovals <= 2) return templateStages;
  const gmIndex = templateStages.findIndex(s => /\bgm\b|\bl2\b/i.test(s.name));
  if (gmIndex === -1) return templateStages;
  const gmStage = templateStages[gmIndex];
  const clone = (name) => ({
    name,
    order: gmStage.order,
    assignedRole: gmStage.assignedRole,
    assignedUserId: gmStage.assignedUserId,
    slaHours: gmStage.slaHours,
    businessHoursOnly: gmStage.businessHoursOnly,
    workingDays: gmStage.workingDays,
    escalateAfterMinutes: gmStage.escalateAfterMinutes,
    escalateToUserId: gmStage.escalateToUserId,
  });
  const extra = [];
  if (requiredApprovals >= 3) extra.push(clone('L3 Approval'));
  if (requiredApprovals >= 4) extra.push(clone('L4 Approval'));
  return [
    ...templateStages.slice(0, gmIndex + 1),
    ...extra,
    ...templateStages.slice(gmIndex + 1),
  ].map((s, i) => ({ ...s, order: i }));
}

// Starts a new WorkflowInstance for an entity if an active template exists for its type.
// No-ops (returns null) if no active template is configured — templates are opt-in.
// `meta` (all optional) carries reporting context so the MIS report can group/sum by
// project, contractor, and value without re-joining WorkOrder/BillRequest documents.
// `meta.requiredApprovals` (BillRequest only) drives expandBillRequestStages above.
async function startInstance(entityType, entityId, entityLabel, actorUserId, meta = {}) {
  // Neither query depends on the other's result, so run them concurrently
  // instead of back-to-back — this production DB's per-query round trip
  // runs ~500-600ms (Render-to-Atlas cross-region latency, confirmed
  // directly), so every sequential-but-independent query pair removed here
  // is a real, measurable saving on every approval action that calls this.
  // .lean() on template — template.stages just needs to be plain objects to
  // safely clone/reorder below (expandBillRequestStages), nothing here calls
  // a mongoose document method on it.
  const [template, existing] = await Promise.all([
    WorkflowTemplate.findOne({ entityType, isActive: true }).sort({ createdAt: 1 }).lean(),
    WorkflowInstance.findOne({ entityType, entityId, status: 'in-progress' }),
  ]);
  // Same precedence as before parallelizing these two reads: no active
  // template still means "no workflow tracking", even if an instance
  // happens to already exist (e.g. the template was deactivated after that
  // instance started).
  if (!template || !template.stages.length) return null;
  if (existing) return existing;

  const now = new Date();
  let orderedStages = [...template.stages].sort((a, b) => a.order - b.order);
  if (entityType === 'BillRequest') {
    orderedStages = expandBillRequestStages(orderedStages, meta.requiredApprovals);
  }
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
  stage.delayMinutes = overdueMinutesFor(stage, now);

  const nextStage = instance.stages[stageIndex + 1];
  if (nextStage) {
    nextStage.startedAt = now;
    nextStage.dueAt = computeDueAt(now, nextStage.slaHours);
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
  if (SLA_EXCLUDED_STAGES.has(stage.name)) return false;
  return stage.status === 'in-progress' && overdueMinutesFor(stage) > 0;
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
  businessMinutesBetween,
  overdueMinutesFor,
  effectiveDueAt,
  normalizeInstances,
  getSlaConfig,
  setSlaConfig,
  loadSlaConfig,
  startInstance,
  advanceInstance,
  cancelInstance,
  completeStageById,
  isStageBreached,
  captureDailySnapshotIfNeeded,
};
