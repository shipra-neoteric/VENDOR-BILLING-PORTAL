// MIS Report — SLA by module. Every started approval stage of a Work Order / Bill Request workflow is one "SLA case":
//   on time  = stage completed within its SLA,
//   delayed  = stage completed late, or still open and past its due time (breached),
//   pending  = stage still open and not yet due.
// Compliance % = on-time cases / all cases. Read-only, counted from existing WorkflowInstance stages.
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/responseFormatter');
const WorkflowInstance = require('../models/WorkflowInstance');
const { overdueMinutesFor } = require('../utils/slaEngine');

const MODULE_LABEL = { WorkOrder: 'Work Order', BillRequest: 'Bill Request', Custom: 'Custom' };

const newBucket = () => ({ total: 0, onTime: 0, delayed: 0, pending: 0, tatMinutes: [], breachMinutes: [] });
const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0);
const finish = (b) => ({
  total: b.total, onTime: b.onTime, delayed: b.delayed, pending: b.pending,
  ratePct: b.total ? Math.round((b.onTime / b.total) * 1000) / 10 : 0,
  avgTatMinutes: avg(b.tatMinutes), avgBreachMinutes: avg(b.breachMinutes),
});

exports.getSlaByModule = asyncHandler(async (req, res) => {
  const { entityType, from, to } = req.query;
  const filter = {};
  if (entityType && MODULE_LABEL[entityType]) filter.entityType = entityType;
  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;
  if (toD) toD.setHours(23, 59, 59, 999);

  const instances = await WorkflowInstance.find(filter).select('entityType stages.name stages.status stages.startedAt stages.completedAt stages.dueAt stages.delayMinutes stages.businessHoursOnly stages.workingDays').lean();
  const now = new Date();
  const all = newBucket();
  const byModule = new Map();
  const byStage = new Map();

  for (const inst of instances) {
    for (const st of inst.stages) {
      if (st.status === 'pending' || !st.startedAt) continue; // not started yet — not a case
      const started = new Date(st.startedAt);
      if ((fromD && started < fromD) || (toD && started > toD)) continue;

      let kind, breachMin = 0;
      if (st.status === 'completed') {
        kind = st.delayMinutes > 0 ? 'delayed' : 'onTime';
        breachMin = st.delayMinutes || 0;
      } else {
        breachMin = overdueMinutesFor(st, now);
        kind = breachMin > 0 ? 'delayed' : 'pending';
      }
      const tat = st.status === 'completed' && st.completedAt ? Math.round((new Date(st.completedAt) - started) / 60000) : null;

      const mKey = inst.entityType;
      const sKey = `${inst.entityType}:${st.name}`;
      if (!byModule.has(mKey)) byModule.set(mKey, newBucket());
      if (!byStage.has(sKey)) byStage.set(sKey, { module: mKey, stage: st.name, ...newBucket() });
      for (const b of [all, byModule.get(mKey), byStage.get(sKey)]) {
        b.total++; b[kind]++;
        if (tat !== null) b.tatMinutes.push(tat);
        if (kind === 'delayed' && breachMin > 0) b.breachMinutes.push(breachMin);
      }
    }
  }

  const modules = [...byModule.entries()].map(([key, b]) => ({ key, label: MODULE_LABEL[key] || key, ...finish(b) })).sort((a, b) => b.total - a.total);
  const stages = [...byStage.values()].map(b => ({ module: b.module, moduleLabel: MODULE_LABEL[b.module] || b.module, stage: b.stage, ...finish(b) }))
    .sort((a, b) => b.total - a.total);

  return success(res, { cards: finish(all), modules, stages });
});
