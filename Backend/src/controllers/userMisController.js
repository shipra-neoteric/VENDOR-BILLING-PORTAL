// User MIS — per-person performance in VMS, counted from the real records:
//   - documents each person created (Work Orders, Bill Requests, Bills),
//   - approval decisions they took (approvalHistory entries with their timestamps),
//   - SLA performance of the workflow stages they handled (WorkflowInstance stages: due time, completed time, delay).
// Read-only; nothing is stored. `from`/`to` filter every figure by the timestamp of the event it counts.
const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest, notFound } = require('../utils/responseFormatter');
const User = require('../models/User');
const WorkOrder = require('../models/WorkOrder');
const BillRequest = require('../models/BillRequest');
const RunningBill = require('../models/RunningBill');
const WorkflowInstance = require('../models/WorkflowInstance');
const { overdueMinutesFor } = require('../utils/slaEngine');

// Shared/system accounts left out of the report (not real individual staff).
const HIDDEN_USERS = ['Admin', 'DRI 1'];
// Same stage the SLA engine already silences everywhere (TMS callback not reliable yet).
const SLA_EXCLUDED_STAGES = new Set(['Payment Released']);

const DOCS = [
  { key: 'workOrders', Model: WorkOrder, createdField: 'createdBy', label: 'Work Order', numberField: 'workOrderNo' },
  { key: 'billRequests', Model: BillRequest, createdField: 'requestedBy', label: 'Bill Request', numberField: 'reqNo' },
  { key: 'bills', Model: RunningBill, createdField: 'createdBy', label: 'Bill', numberField: 'billNo' },
];

// approvalHistory actions grouped into the three decisions shown as columns.
const ACTION_GROUP = { approved: 'approved', approve: 'approved', rejected: 'rejected', 'sent-back': 'sentBack' };

function dateRange(query) {
  const range = {};
  if (query.from) { const d = new Date(query.from); if (!Number.isNaN(d.getTime())) range.$gte = d; }
  if (query.to) { const d = new Date(query.to); if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); range.$lte = d; } }
  return Object.keys(range).length ? range : null;
}

// Every started workflow stage that can be pinned on a person (the one who completed it, else the one it is assigned to).
// kind: onTime = completed within SLA · delayed = completed late, or still open and past due · pending = open, not due yet.
async function slaCases(range, onlyUserId) {
  const instances = await WorkflowInstance.find({}).select('entityType entityLabel projectName vendorName amount status currentStageIndex stages').lean();
  const now = new Date();
  const cases = [];
  for (const inst of instances) {
    for (const [idx, st] of inst.stages.entries()) {
      if (st.status === 'pending' || !st.startedAt || SLA_EXCLUDED_STAGES.has(st.name)) continue;
      // an open stage only counts while its workflow is really sitting on it (not left open on a finished / cancelled one)
      if (st.status !== 'completed' && !(inst.status === 'in-progress' && idx === inst.currentStageIndex)) continue;
      const userId = st.completedBy || st.assignedUserId;
      if (!userId) continue;
      if (onlyUserId && String(userId) !== String(onlyUserId)) continue;
      const started = new Date(st.startedAt);
      if (range && ((range.$gte && started < range.$gte) || (range.$lte && started > range.$lte))) continue;
      let kind, delayMinutes;
      if (st.status === 'completed') { delayMinutes = st.delayMinutes || 0; kind = delayMinutes > 0 ? 'delayed' : 'onTime'; }
      else { delayMinutes = overdueMinutesFor(st, now); kind = delayMinutes > 0 ? 'delayed' : 'pending'; }
      cases.push({
        userId: String(userId), kind, delayMinutes,
        tatMinutes: st.status === 'completed' && st.completedAt ? Math.round((new Date(st.completedAt) - started) / 60000) : null,
        entityType: inst.entityType, ref: inst.entityLabel, projectName: inst.projectName, vendorName: inst.vendorName, amount: inst.amount,
        stage: st.name, startedAt: st.startedAt, dueAt: st.dueAt, completedAt: st.completedAt,
      });
    }
  }
  return cases;
}

async function buildRows(range) {
  const users = await User.find({ isActive: { $ne: false }, name: { $nin: HIDDEN_USERS } }).select('name role department').lean();
  const rows = new Map(users.map(u => [String(u._id), {
    userId: String(u._id), name: u.name, role: u.role || '', department: u.department || '',
    workOrders: 0, billRequests: 0, bills: 0,
    approved: 0, rejected: 0, sentBack: 0,
    slaTotal: 0, slaOnTime: 0, slaDelayed: 0, slaPending: 0, tatSum: 0, tatCount: 0,
    lastActiveAt: null, firstActiveAt: null,
  }]));
  const touch = (row, at, first) => {
    if (!at) return;
    if (!row.lastActiveAt || new Date(at) > new Date(row.lastActiveAt)) row.lastActiveAt = at;
    const f = first || at;
    if (!row.firstActiveAt || new Date(f) < new Date(row.firstActiveAt)) row.firstActiveAt = f;
  };

  await Promise.all([
    ...DOCS.map(async ({ key, Model, createdField }) => {
      const createdMatch = { [createdField]: { $ne: null } };
      if (range) createdMatch.createdAt = range;
      const [created, decided] = await Promise.all([
        Model.aggregate([
          { $match: createdMatch },
          { $group: { _id: `$${createdField}`, n: { $sum: 1 }, last: { $max: '$createdAt' }, first: { $min: '$createdAt' } } },
        ]),
        Model.aggregate([
          { $match: { 'approvalHistory.0': { $exists: true } } },
          { $unwind: '$approvalHistory' },
          { $match: { 'approvalHistory.by': { $ne: null }, 'approvalHistory.action': { $in: Object.keys(ACTION_GROUP) },
            ...(range ? { 'approvalHistory.at': range } : {}) } },
          { $group: { _id: { by: '$approvalHistory.by', action: '$approvalHistory.action' }, n: { $sum: 1 }, last: { $max: '$approvalHistory.at' }, first: { $min: '$approvalHistory.at' } } },
        ]),
      ]);
      for (const c of created) {
        const row = rows.get(String(c._id));
        if (!row) continue;
        row[key] += c.n; touch(row, c.last, c.first);
      }
      for (const d of decided) {
        const row = rows.get(String(d._id.by));
        if (!row) continue;
        row[ACTION_GROUP[d._id.action]] += d.n; touch(row, d.last, d.first);
      }
    }),
    slaCases(range).then(cases => {
      for (const c of cases) {
        const row = rows.get(c.userId);
        if (!row) continue;
        row.slaTotal++;
        row[c.kind === 'onTime' ? 'slaOnTime' : c.kind === 'delayed' ? 'slaDelayed' : 'slaPending']++;
        if (c.tatMinutes !== null) { row.tatSum += c.tatMinutes; row.tatCount++; }
        touch(row, c.completedAt || c.startedAt);
      }
    }),
  ]);
  return rows;
}

function finishRow(r) {
  return {
    ...r,
    slaPct: r.slaTotal ? Math.round((r.slaOnTime / r.slaTotal) * 1000) / 10 : null,
    avgTatMinutes: r.tatCount ? Math.round(r.tatSum / r.tatCount) : 0,
    total: r.workOrders + r.billRequests + r.bills + r.approved + r.rejected + r.sentBack,
  };
}

exports.getUserMis = asyncHandler(async (req, res) => {
  const rows = await buildRows(dateRange(req.query));
  const list = [...rows.values()].map(finishRow).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return success(res, { users: list });
});

// One person's detail: the same figures as their table row, plus a dated activity history (what they created, decided and handled).
exports.getUserMisDetail = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return badRequest(res, 'Invalid user');
  const range = dateRange(req.query);
  const rows = await buildRows(range);
  const row = rows.get(userId);
  if (!row) return notFound(res, 'User not found');
  const oid = new mongoose.Types.ObjectId(userId);
  const LIMIT = 100;
  const activity = [];
  const sub = (d) => [d.projectName, d.vendorName].filter(Boolean).join(' · ');

  await Promise.all([
    ...DOCS.map(async ({ Model, createdField, label, numberField }) => {
      const createdMatch = { [createdField]: oid };
      if (range) createdMatch.createdAt = range;
      const [created, decided] = await Promise.all([
        Model.find(createdMatch).select(`${numberField} workOrderNo projectName vendorName status contractValue amount items createdAt`).sort({ createdAt: -1 }).limit(LIMIT).lean(),
        Model.aggregate([
          { $match: { 'approvalHistory.by': oid } },
          { $unwind: '$approvalHistory' },
          { $match: { 'approvalHistory.by': oid, 'approvalHistory.action': { $in: Object.keys(ACTION_GROUP) }, ...(range ? { 'approvalHistory.at': range } : {}) } },
          { $sort: { 'approvalHistory.at': -1 } },
          { $limit: LIMIT },
          { $project: { ref: `$${numberField}`, projectName: 1, vendorName: 1, stage: '$approvalHistory.stage', action: '$approvalHistory.action', at: '$approvalHistory.at', remarks: '$approvalHistory.remarks' } },
        ]),
      ]);
      for (const d of created) {
        const amount = d.contractValue ?? d.amount ?? (d.items ? d.items.reduce((s, it) => s + (it.amount ?? (it.rate || 0) * (it.billedQty || 0)), 0) : null);
        activity.push({ type: 'created', module: label, ref: d[numberField], detail: sub(d), amount, at: d.createdAt, status: d.status || '' });
      }
      for (const d of decided) {
        activity.push({ type: ACTION_GROUP[d.action], module: label, ref: d.ref, detail: sub(d), stage: d.stage, note: d.remarks || '', at: d.at });
      }
    }),
    slaCases(range, userId).then(cases => {
      for (const c of cases) {
        activity.push({
          type: 'sla', module: c.entityType === 'BillRequest' ? 'Bill Request' : c.entityType === 'WorkOrder' ? 'Work Order' : c.entityType,
          ref: c.ref, detail: sub(c), stage: c.stage, amount: c.amount || null, slaKind: c.kind, delayMinutes: c.delayMinutes,
          tatMinutes: c.tatMinutes, dueAt: c.dueAt, at: c.completedAt || c.startedAt,
        });
      }
    }),
  ]);

  activity.sort((a, b) => new Date(b.at) - new Date(a.at));
  return success(res, { user: finishRow(row), activity: activity.slice(0, 300) });
});
