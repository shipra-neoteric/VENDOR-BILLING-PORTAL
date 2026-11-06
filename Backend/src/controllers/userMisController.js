// User MIS — one row per user showing what each person actually did in VMS: documents they created, and the approval
// decisions they took (read from the append-only approvalHistory on Work Orders, Bill Requests and Bills).
// Read-only; every figure is counted straight from existing records, nothing new is stored.
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/responseFormatter');
const User = require('../models/User');
const WorkOrder = require('../models/WorkOrder');
const BillRequest = require('../models/BillRequest');
const RunningBill = require('../models/RunningBill');

const DOCS = [
  { key: 'workOrders', Model: WorkOrder, createdField: 'createdBy' },
  { key: 'billRequests', Model: BillRequest, createdField: 'requestedBy' },
  { key: 'bills', Model: RunningBill, createdField: 'createdBy' },
];

// approvalHistory actions grouped into the three decisions shown as columns.
const ACTION_GROUP = { approved: 'approved', approve: 'approved', rejected: 'rejected', 'sent-back': 'sentBack' };

function dateRange(query) {
  const range = {};
  if (query.from) { const d = new Date(query.from); if (!Number.isNaN(d.getTime())) range.$gte = d; }
  if (query.to) { const d = new Date(query.to); if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); range.$lte = d; } }
  return Object.keys(range).length ? range : null;
}

exports.getUserMis = asyncHandler(async (req, res) => {
  const range = dateRange(req.query);
  const users = await User.find({ isActive: { $ne: false } }).select('name role department').lean();
  const rows = new Map(users.map(u => [String(u._id), {
    userId: String(u._id), name: u.name, role: u.role || '', department: u.department || '',
    workOrders: 0, billRequests: 0, bills: 0,
    approved: 0, rejected: 0, sentBack: 0, lastActiveAt: null,
  }]));
  const touch = (row, at) => { if (at && (!row.lastActiveAt || new Date(at) > new Date(row.lastActiveAt))) row.lastActiveAt = at; };

  await Promise.all(DOCS.map(async ({ key, Model, createdField }) => {
    const createdMatch = { [createdField]: { $ne: null } };
    if (range) createdMatch.createdAt = range;
    const [created, decided] = await Promise.all([
      Model.aggregate([
        { $match: createdMatch },
        { $group: { _id: `$${createdField}`, n: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]),
      Model.aggregate([
        { $match: { 'approvalHistory.0': { $exists: true } } },
        { $unwind: '$approvalHistory' },
        { $match: { 'approvalHistory.by': { $ne: null }, 'approvalHistory.action': { $in: Object.keys(ACTION_GROUP) },
          ...(range ? { 'approvalHistory.at': range } : {}) } },
        { $group: { _id: { by: '$approvalHistory.by', action: '$approvalHistory.action' }, n: { $sum: 1 }, last: { $max: '$approvalHistory.at' } } },
      ]),
    ]);
    for (const c of created) {
      const row = rows.get(String(c._id));
      if (!row) continue;
      row[key] += c.n;
      touch(row, c.last);
    }
    for (const d of decided) {
      const row = rows.get(String(d._id.by));
      if (!row) continue;
      row[ACTION_GROUP[d._id.action]] += d.n;
      touch(row, d.last);
    }
  }));

  const list = [...rows.values()]
    .map(r => ({ ...r, total: r.workOrders + r.billRequests + r.bills + r.approved + r.rejected + r.sentBack }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return success(res, { users: list });
});
