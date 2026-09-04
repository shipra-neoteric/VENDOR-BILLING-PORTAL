const WorkflowTemplate = require('../models/WorkflowTemplate');
const WorkflowInstance  = require('../models/WorkflowInstance');
const MISSnapshot       = require('../models/MISSnapshot');
const WorkOrder         = require('../models/WorkOrder');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest, conflict, forbidden } = require('../utils/responseFormatter');
const { completeStageById, isStageBreached, captureDailySnapshotIfNeeded, overdueMinutesFor } = require('../utils/slaEngine');
const { logAudit, diffFields } = require('../utils/auditLog');

// ── Templates ────────────────────────────────────────────────────

exports.listTemplates = asyncHandler(async (req, res) => {
  const templates = await WorkflowTemplate.find().sort({ createdAt: -1 });
  success(res, { templates });
});

exports.createTemplate = asyncHandler(async (req, res) => {
  const { name, description, entityType, isActive, stages } = req.body;
  if (!name) return badRequest(res, 'Name is required');
  if (!['WorkOrder', 'BillRequest', 'Custom'].includes(entityType)) {
    return badRequest(res, 'entityType must be WorkOrder, BillRequest, or Custom');
  }
  if (!Array.isArray(stages) || stages.length === 0) {
    return badRequest(res, 'At least one stage is required');
  }

  const template = await WorkflowTemplate.create({
    name, description, entityType,
    isActive: isActive !== false,
    stages: stages.map((s, i) => ({ ...s, order: i })),
    createdBy: req.user._id,
  });

  await logAudit({
    action: 'CREATE', module: 'workflows', user: req.user,
    description: `Workflow template "${template.name}" created`,
    entityType: 'WorkflowTemplate', entityId: template._id, entityLabel: template.name,
  });

  created(res, { template }, 'Workflow template created');
});

exports.updateTemplate = asyncHandler(async (req, res) => {
  const { name, description, entityType, isActive, stages } = req.body;
  const template = await WorkflowTemplate.findById(req.params.id);
  if (!template) return notFound(res, 'Template not found');
  const before = template.toObject();

  if (name !== undefined) template.name = name;
  if (description !== undefined) template.description = description;
  if (entityType !== undefined) template.entityType = entityType;
  if (isActive !== undefined) template.isActive = isActive;
  if (Array.isArray(stages)) template.stages = stages.map((s, i) => ({ ...s, order: i }));

  await template.save();

  const changes = diffFields(before, template.toObject(), ['name', 'description', 'entityType', 'isActive']);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'workflows', user: req.user,
      description: `Workflow template "${template.name}" updated`,
      entityType: 'WorkflowTemplate', entityId: template._id, entityLabel: template.name,
      changes,
    });
  }

  success(res, { template }, 'Workflow template updated');
});

exports.deleteTemplate = asyncHandler(async (req, res) => {
  const template = await WorkflowTemplate.findById(req.params.id);
  if (!template) return notFound(res, 'Template not found');

  const inUse = await WorkflowInstance.exists({ templateId: template._id });
  if (inUse) return conflict(res, `Cannot delete "${template.name}" — it has running or past workflow instances.`);

  await template.deleteOne();

  await logAudit({
    action: 'DELETE', module: 'workflows', user: req.user,
    description: `Workflow template "${template.name}" deleted`,
    entityType: 'WorkflowTemplate', entityId: template._id, entityLabel: template.name,
  });

  success(res, null, 'Workflow template deleted');
});

// ── Instances ────────────────────────────────────────────────────

function decorateInstance(instanceDoc) {
  const instance = instanceDoc.toObject ? instanceDoc.toObject() : instanceDoc;
  instance.stages = instance.stages.map(stage => ({
    ...stage,
    breached: isStageBreached(stage),
  }));
  instance.isBreached = instance.stages.some(s => s.breached);
  return instance;
}

exports.listInstances = asyncHandler(async (req, res) => {
  const { entityType, entityId, status, breachedOnly } = req.query;
  const filter = {};
  if (entityType) filter.entityType = entityType;
  if (entityId)   filter.entityId   = entityId;
  if (status) filter.status = status;

  const instances = await WorkflowInstance.find(filter)
    .populate('stages.assignedUserId', 'name email role')
    .populate('stages.completedBy', 'name email role')
    .sort({ createdAt: -1 })
    .limit(500);

  let decorated = instances.map(decorateInstance);
  if (breachedOnly === 'true') decorated = decorated.filter(i => i.isBreached);

  success(res, { instances: decorated });
});

exports.getInstance = asyncHandler(async (req, res) => {
  const instance = await WorkflowInstance.findById(req.params.id)
    .populate('stages.assignedUserId', 'name email role')
    .populate('stages.completedBy', 'name email role');
  if (!instance) return notFound(res, 'Workflow instance not found');
  success(res, { instance: decorateInstance(instance) });
});

// PATCH /api/workflows/instances/:id/complete-stage  — the "Mark as Complete" action
exports.completeStage = asyncHandler(async (req, res) => {
  const instance = await WorkflowInstance.findById(req.params.id);
  if (!instance) return notFound(res, 'Workflow instance not found');
  if (instance.status !== 'in-progress') return badRequest(res, 'This workflow is not in progress');

  const stage = instance.stages[instance.currentStageIndex];
  if (!stage) return badRequest(res, 'No active stage found');

  const role = req.user.role;
  const isAssignedUser = stage.assignedUserId && String(stage.assignedUserId) === String(req.user._id);
  const isAssignedRole = stage.assignedRole === 'any' || stage.assignedRole === role;
  if (!isAssignedUser && !isAssignedRole) {
    return forbidden(res, `Only ${stage.assignedRole === 'any' ? 'the assigned person' : stage.assignedRole} can complete this stage`);
  }

  const { stageId, remarks } = req.body;
  const targetStageId = stageId || String(stage._id);
  const result = await completeStageById(instance._id, targetStageId, req.user._id, remarks);
  if (result.error === 'not_found') return notFound(res, 'Workflow instance not found');
  if (result.error === 'not_in_progress') return badRequest(res, 'This workflow is not in progress');
  if (result.error === 'stage_not_found') return notFound(res, 'Stage not found');
  if (result.error === 'not_current_stage') return badRequest(res, 'Only the current active stage can be completed');

  await logAudit({
    action: 'UPDATE', module: 'workflows', user: req.user,
    description: `Completed stage "${stage.name}" on ${result.instance.entityLabel || result.instance._id}`,
    entityType: 'WorkflowInstance', entityId: result.instance._id, entityLabel: result.instance.entityLabel || '',
  });

  // This generic "sign-off chain" is a second, independent approval track from
  // the Work Order's own draft->pending-checker->pending-approver->pending-final
  // ->approved chain (workOrderController's submit/checker/approver/finalApprove).
  // Completing it here used to leave approvalStatus stuck on 'draft' even though
  // this chain showed "COMPLETED" — billing (which only checks approvalStatus)
  // would then wrongly reject the work order as unapproved. Sync it here so the
  // two tracks can't drift apart.
  if (result.instance.entityType === 'WorkOrder' && result.instance.status === 'completed') {
    const workOrder = await WorkOrder.findById(result.instance.entityId);
    if (workOrder && workOrder.approvalStatus !== 'approved') {
      workOrder.approvalStatus = 'approved';
      workOrder.finalApprovedBy = req.user._id;
      workOrder.finalApprovedAt = new Date();
      workOrder.isLocked = true;
      workOrder.lockedBy = req.user._id;
      workOrder.lockedAt = new Date();
      workOrder.approvalHistory.push({
        stage: 'final', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role,
        remarks: 'Auto-synced: completed via the sign-off chain workflow',
      });
      await workOrder.save();
    }
  }

  success(res, { instance: decorateInstance(result.instance) }, 'Stage marked complete');
});

// ── MIS Report ───────────────────────────────────────────────────
// Aggregates every stage across every instance into an operational, decision-support
// report: an executive health score, critical alerts, a pipeline funnel, bottleneck
// and per-stage compliance breakdowns, project/financial/department rollups, a
// per-assignee table, aging buckets, and a drill-down list of ongoing instances.

function assigneeKey(stage) {
  if (stage.completedBy) return { key: String(stage.completedBy._id || stage.completedBy), label: stage.completedBy.name || 'Unknown' };
  if (stage.assignedUserId) return { key: String(stage.assignedUserId._id || stage.assignedUserId), label: stage.assignedUserId.name || 'Unknown' };
  return { key: `role:${stage.assignedRole}`, label: `${stage.assignedRole} (role)` };
}

const DEPARTMENTS = {
  'site-dri': 'Site / Engineering',
  gm: 'Management', agm: 'Management', owner: 'Management',
  accounts: 'Finance / Accounts',
};
function stageDepartment(stage) {
  const role = stage.completedBy?.role || stage.assignedUserId?.role || stage.assignedRole;
  return DEPARTMENTS[role] || 'Other';
}

const AGING_BUCKETS = [
  { label: '0-2 days', maxDays: 2 },
  { label: '3-5 days', maxDays: 5 },
  { label: '6-10 days', maxDays: 10 },
  { label: '11-15 days', maxDays: 15 },
  { label: '15+ days', maxDays: Infinity },
];

exports.getMISReport = asyncHandler(async (req, res) => {
  const { entityType, days } = req.query;
  const filter = {};
  if (entityType) filter.entityType = entityType;

  const instances = await WorkflowInstance.find(filter)
    .populate('stages.assignedUserId', 'name role')
    .populate('stages.completedBy', 'name role')
    .sort({ createdAt: -1 });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = days ? new Date(now.getTime() - Number(days) * 24 * 60 * 60 * 1000) : null;

  // ── KPIs ──
  let totalSla = instances.length, slaCompleted = 0, slaBreach = 0, ongoing = 0, onTimeCompleted = 0, completedToday = 0, critical48h = 0;
  const processingDurations = []; // hours, completed instances only
  const breachDelaysAll = []; // minutes, every breached stage (completed-late + currently-overdue)

  // ── Accumulators ──
  const byAssignee = new Map(); // key -> { label, totalSla, slaComplete, slaBreach, breachDelays: [] }
  const byStage = new Map(); // `${entityType}:${stageName}` -> { entityType, stageName, total, durationsHrs: [], withinSla, breachedCount }
  const byDept = new Map(); // deptName -> { totalSla, slaComplete, slaBreach }
  const byProject = new Map(); // projectId -> { projectName, total, onTime, pending, delayed, blockedAmount }
  const byContractor = new Map(); // vendorName -> { totalSla, slaBreach, breachDelays: [], pendingAmount, projectIds: Set }
  const bottlenecks = new Map(); // `${entityType}:${stageName}` -> pendingCount (currently sitting there)
  const financialByStage = new Map(); // stageName -> amount currently waiting there
  const pipelineGroups = new Map(); // templateId -> { templateName, entityType, stageNames: [], perStage: [{reached,completed,durationsHrs,withinSla,breached}] }
  const heatmap = new Map(); // `${projectId}|${dept}` -> { projectName, dept, total, breach }
  const activityEvents = []; // { time, text, type }
  const agingCounts = AGING_BUCKETS.map(() => 0);
  const drilldown = [];
  let pendingAmount = 0, breachedAmount = 0;

  for (const inst of instances) {
    // ── Pipeline funnel skeleton (one entry per template) ── built first so
    // the in-progress branch below can record the instance's *current* stage
    // against it — this is the only reliable source for "how many are
    // genuinely stuck here right now": a stage flag left at 'in-progress' on
    // an instance that's since been completed/cancelled must never count.
    const tKey = String(inst.templateId);
    if (!pipelineGroups.has(tKey)) {
      pipelineGroups.set(tKey, {
        templateName: inst.templateName, entityType: inst.entityType,
        perStage: inst.stages.map(s => ({ name: s.name, reached: 0, completed: 0, durationsHrs: [], withinSla: 0, breached: 0, pendingNow: 0 })),
      });
    }
    const pg = pipelineGroups.get(tKey);

    if (inst.status === 'completed') {
      slaCompleted++;
      const anyLate = inst.stages.some(s => s.delayMinutes > 0);
      if (!anyLate) onTimeCompleted++;
      if (inst.completedAt && inst.startedAt) {
        processingDurations.push((new Date(inst.completedAt) - new Date(inst.startedAt)) / 3600000);
      }
      if (inst.completedAt && new Date(inst.completedAt) >= todayStart) completedToday++;

      if (inst.projectId) {
        const pKey = String(inst.projectId);
        if (!byProject.has(pKey)) byProject.set(pKey, { projectName: inst.projectName, total: 0, onTime: 0, pending: 0, delayed: 0, blockedAmount: 0 });
        const p = byProject.get(pKey);
        p.total++; if (!anyLate) p.onTime++;
      }
    } else if (inst.status === 'in-progress') {
      ongoing++;
      const stage = inst.stages[inst.currentStageIndex];
      const stageBreached = stage && stage.dueAt && new Date(stage.dueAt) < now;
      pendingAmount += inst.amount || 0;

      if (stageBreached) {
        slaBreach++;
        const overdueMin = overdueMinutesFor(stage, now);
        breachDelaysAll.push(overdueMin);
        if (overdueMin >= 48 * 60) critical48h++;
        breachedAmount += inst.amount || 0;
        const daysOverdue = overdueMin / 1440;
        const bucketIdx = AGING_BUCKETS.findIndex(b => daysOverdue <= b.maxDays);
        agingCounts[bucketIdx >= 0 ? bucketIdx : AGING_BUCKETS.length - 1]++;
      }

      if (stage) {
        const bKey = `${inst.entityType}:${stage.name}`;
        bottlenecks.set(bKey, (bottlenecks.get(bKey) || 0) + 1);
        financialByStage.set(stage.name, (financialByStage.get(stage.name) || 0) + (inst.amount || 0));
        if (pg.perStage[inst.currentStageIndex]) pg.perStage[inst.currentStageIndex].pendingNow++;

        if (stageBreached) {
          activityEvents.push({
            time: stage.dueAt,
            text: `SLA Breached: ${inst.entityLabel} — ${stage.name}`,
            type: 'breach',
          });
        }
      }

      if (inst.projectId) {
        const pKey = String(inst.projectId);
        if (!byProject.has(pKey)) byProject.set(pKey, { projectName: inst.projectName, total: 0, onTime: 0, pending: 0, delayed: 0, blockedAmount: 0 });
        const p = byProject.get(pKey);
        p.total++; // ongoing counts toward denominator, but not "onTime" until it finishes
        p.pending++;
        if (stageBreached) { p.delayed++; p.blockedAmount += inst.amount || 0; }
      }

      if (inst.vendorName) {
        if (!byContractor.has(inst.vendorName)) byContractor.set(inst.vendorName, { totalSla: 0, slaBreach: 0, breachDelays: [], pendingAmount: 0, projectIds: new Set() });
        const c = byContractor.get(inst.vendorName);
        c.totalSla++;
        c.pendingAmount += inst.amount || 0;
        if (inst.projectId) c.projectIds.add(String(inst.projectId));
        if (stageBreached) { c.slaBreach++; c.breachDelays.push(overdueMinutesFor(stage, now)); }
      }

      drilldown.push({
        instanceId: inst._id,
        entityType: inst.entityType,
        entityId: inst.entityId,
        entityLabel: inst.entityLabel,
        currentStageIndex: inst.currentStageIndex,
        currentStage: stage ? stage.name : '—',
        assignedTo: stage ? (stage.assignedUserId?.name || `${stage.assignedRole} (role)`) : '—',
        dueAt: stage ? stage.dueAt : null,
        breached: !!stageBreached,
        overdueMinutes: stageBreached ? overdueMinutesFor(stage, now) : 0,
      });
    }

    for (let i = 0; i < inst.stages.length; i++) {
      const stage = inst.stages[i];
      if (stage.status === 'pending') continue; // not started yet
      if (since && stage.startedAt && new Date(stage.startedAt) < since) continue;

      const stageBreachedNow = stage.status === 'in-progress' && stage.dueAt && new Date(stage.dueAt) < now;

      // Pipeline funnel
      if (pg.perStage[i]) {
        pg.perStage[i].reached++;
        if (stage.status === 'completed') {
          pg.perStage[i].completed++;
          if (stage.startedAt && stage.completedAt) pg.perStage[i].durationsHrs.push((new Date(stage.completedAt) - new Date(stage.startedAt)) / 3600000);
          if (stage.delayMinutes > 0) pg.perStage[i].breached++; else pg.perStage[i].withinSla++;
        } else if (stageBreachedNow) {
          pg.perStage[i].breached++;
        }
      }

      // Per-assignee
      const { key, label } = assigneeKey(stage);
      if (!byAssignee.has(key)) byAssignee.set(key, { label, totalSla: 0, slaComplete: 0, slaBreach: 0, breachDelays: [] });
      const a = byAssignee.get(key);
      a.totalSla++;
      if (stage.status === 'completed') {
        a.slaComplete++;
        if (stage.delayMinutes > 0) { a.slaBreach++; a.breachDelays.push(stage.delayMinutes); }
      } else if (stageBreachedNow) {
        a.slaBreach++; a.breachDelays.push(overdueMinutesFor(stage, now));
      }

      // Per-stage
      const stageKey = `${inst.entityType}:${stage.name}`;
      if (!byStage.has(stageKey)) byStage.set(stageKey, { entityType: inst.entityType, stageName: stage.name, total: 0, durationsHrs: [], withinSla: 0, breachedCount: 0 });
      const s = byStage.get(stageKey);
      s.total++;
      if (stage.status === 'completed') {
        if (stage.startedAt && stage.completedAt) s.durationsHrs.push((new Date(stage.completedAt) - new Date(stage.startedAt)) / 3600000);
        if (stage.delayMinutes > 0) s.breachedCount++; else s.withinSla++;
      } else if (stageBreachedNow) {
        s.breachedCount++;
      }

      // Per-department
      const dept = stageDepartment(stage);
      if (!byDept.has(dept)) byDept.set(dept, { totalSla: 0, slaComplete: 0, slaBreach: 0 });
      const d = byDept.get(dept);
      d.totalSla++;
      if (stage.status === 'completed') {
        d.slaComplete++;
        if (stage.delayMinutes > 0) d.slaBreach++;
      } else if (stageBreachedNow) {
        d.slaBreach++;
      }

      // Project × Department heatmap
      if (inst.projectId) {
        const hKey = `${inst.projectId}|${dept}`;
        if (!heatmap.has(hKey)) heatmap.set(hKey, { projectId: String(inst.projectId), projectName: inst.projectName, dept, total: 0, breach: 0 });
        const h = heatmap.get(hKey);
        h.total++;
        if ((stage.status === 'completed' && stage.delayMinutes > 0) || stageBreachedNow) h.breach++;
      }

      // Recent activity feed (completed stages only — breach events logged where detected above)
      if (stage.status === 'completed' && stage.completedAt) {
        activityEvents.push({
          time: stage.completedAt,
          text: `${stage.completedBy?.name || `${stage.assignedRole} (role)`} completed ${stage.name} on ${inst.entityLabel}`,
          type: stage.delayMinutes > 0 ? 'late' : 'completed',
        });
      }
    }
  }

  const avg = arr => arr.length ? Math.round(arr.reduce((sum, v) => sum + v, 0) / arr.length) : 0;

  const netSla = totalSla ? Math.round((onTimeCompleted / totalSla) * 100) : 100;
  const health = {
    score: netSla,
    status: netSla >= 90 ? 'good' : netSla >= 70 ? 'warning' : 'critical',
    target: 95,
    openWorkflows: ongoing,
    overdue: slaBreach,
    critical: critical48h,
    completedToday,
  };

  // ── Critical alerts (top few, most actionable first) ──
  const alerts = [];
  const bottlenecksArr = [...bottlenecks.entries()].map(([k, count]) => {
    const [et, stageName] = k.split(':');
    return { entityType: et, stageName, pendingCount: count };
  }).sort((a, b) => b.pendingCount - a.pendingCount);

  if (bottlenecksArr[0]?.pendingCount >= 3) {
    alerts.push(`${bottlenecksArr[0].stageName} pending for ${bottlenecksArr[0].pendingCount} ${bottlenecksArr[0].entityType}${bottlenecksArr[0].pendingCount !== 1 ? 's' : ''}`);
  }
  if (breachedAmount > 0) {
    alerts.push(`₹${Math.round(breachedAmount).toLocaleString('en-IN')} in bills/work waiting past their due time`);
  }
  const criticalAging = agingCounts[3] + agingCounts[4]; // 11-15 + 15+
  if (criticalAging > 0) {
    alerts.push(`${criticalAging} workflow${criticalAging !== 1 ? 's' : ''} overdue by more than 10 days`);
  }
  for (const [vendorName, c] of byContractor.entries()) {
    if (c.slaBreach >= 2) alerts.push(`${vendorName} has ${c.slaBreach} delayed stage${c.slaBreach !== 1 ? 's' : ''}`);
  }
  for (const [, p] of byProject.entries()) {
    const pct = p.total ? Math.round((p.onTime / p.total) * 100) : 100;
    if (p.total >= 2 && pct < 60) alerts.push(`${p.projectName} is below 60% SLA compliance`);
  }

  // Real named users only — a "role:<x>" key means the stage was never
  // claimed/completed by any specific person (still open, generically
  // assigned to "any AGM"/etc.), so there's no real individual to hold
  // accountable for it. Those stages still count everywhere else (KPIs,
  // pipeline tiles, drilldown); they just don't get a fake "role" row here.
  const byAssigneeArr = [...byAssignee.entries()]
    .filter(([key]) => !key.startsWith('role:'))
    .map(([key, v]) => ({
      key, label: v.label, totalSla: v.totalSla, slaComplete: v.slaComplete, slaBreach: v.slaBreach,
      overdueMinutes: v.breachDelays.reduce((s, d) => s + d, 0),
      avgBreachMinutes: avg(v.breachDelays),
    })).sort((a, b) => b.slaBreach - a.slaBreach);

  const byStageArr = [...byStage.values()].map(v => ({
    entityType: v.entityType, stageName: v.stageName, total: v.total,
    avgHours: avg(v.durationsHrs),
    withinSlaPct: (v.withinSla + v.breachedCount) ? Math.round((v.withinSla / (v.withinSla + v.breachedCount)) * 100) : 0,
    breachedCount: v.breachedCount,
  }));

  const departments = [...byDept.entries()].map(([name, v]) => ({
    name, totalSla: v.totalSla, slaComplete: v.slaComplete, slaBreach: v.slaBreach,
    completePct: v.totalSla ? Math.round((v.slaComplete / v.totalSla) * 100) : 0,
  })).sort((a, b) => b.totalSla - a.totalSla);

  const projectHealth = [...byProject.entries()].map(([projectId, v]) => ({
    projectId, projectName: v.projectName, total: v.total,
    onTimePct: v.total ? Math.round((v.onTime / v.total) * 100) : 100,
    pending: v.pending, delayed: v.delayed, blockedAmount: Math.round(v.blockedAmount),
  })).sort((a, b) => a.onTimePct - b.onTimePct);

  const contractorDelays = [...byContractor.entries()].map(([vendorName, v]) => ({
    vendorName, totalSla: v.totalSla, slaBreach: v.slaBreach, avgBreachMinutes: avg(v.breachDelays),
    pendingAmount: Math.round(v.pendingAmount), projectCount: v.projectIds.size,
  })).sort((a, b) => b.slaBreach - a.slaBreach);

  const heatmapArr = [...heatmap.values()].map(h => ({
    projectId: h.projectId, projectName: h.projectName, dept: h.dept,
    compliancePct: h.total ? Math.round(((h.total - h.breach) / h.total) * 100) : 100,
  }));

  const recentActivity = activityEvents
    .filter(e => e.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 10);

  const pipeline = [...pipelineGroups.values()].map(pg => ({
    templateName: pg.templateName, entityType: pg.entityType,
    stages: pg.perStage.map((s, i) => ({
      // Position in the chain, not just the name — a stage snapshot on an
      // older instance can carry a name from before the template was last
      // edited, so filtering the drilldown below by name alone would silently
      // miss those instances even though this tile's own count includes them.
      stageIndex: i,
      name: s.name, reached: s.reached, completed: s.completed,
      avgHours: avg(s.durationsHrs),
      withinSlaPct: (s.withinSla + s.breached) ? Math.round((s.withinSla / (s.withinSla + s.breached)) * 100) : 0,
      // Genuinely-open instances currently sitting at this stage — not
      // "reached minus completed", which double-counts a stage left stuck
      // at 'in-progress' on an instance that's since completed/cancelled.
      pending: s.pendingNow,
    })),
  }));

  const financial = {
    pendingAmount: Math.round(pendingAmount),
    breachedAmount: Math.round(breachedAmount),
    byStage: [...financialByStage.entries()].map(([stageName, amount]) => ({ stageName, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount),
  };

  const agingBuckets = AGING_BUCKETS.map((b, i) => ({ label: b.label, count: agingCounts[i] }));

  await captureDailySnapshotIfNeeded({
    netSla, ongoing, slaBreach, slaCompleted,
    pendingAmount: Math.round(pendingAmount), breachedAmount: Math.round(breachedAmount),
  });
  const trendDays = days ? Number(days) : 30;
  const trendSince = new Date(now.getTime() - trendDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const trend = await MISSnapshot.find({ date: { $gte: trendSince } }).sort({ date: 1 }).select('-_id -__v -createdAt -updatedAt');

  success(res, {
    health, alerts, bottlenecks: bottlenecksArr, pipeline,
    byStage: byStageArr, byAssignee: byAssigneeArr, departments,
    projectHealth, financial, contractorDelays, agingBuckets, drilldown,
    heatmap: heatmapArr, recentActivity, trend,
  });
});
