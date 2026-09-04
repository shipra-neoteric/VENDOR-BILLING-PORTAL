const VendorGroup  = require('../models/VendorGroup');
const Contractor   = require('../models/Contractor');
const WorkOrder    = require('../models/WorkOrder');
const RunningBill  = require('../models/RunningBill');
const AdvanceSlip  = require('../models/AdvanceSlip');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextVendorGroupCode } = require('../utils/codeGen');
const { logAudit, diffFields } = require('../utils/auditLog');

exports.listVendorGroups = asyncHandler(async (req, res) => {
  const groups = await VendorGroup.find().sort({ name: 1 }).lean();
  // Inactive (archived) contractors don't count as active group members —
  // matches getVendorGroup's own member list below.
  const counts = await Contractor.aggregate([
    { $match: { groupId: { $ne: null }, status: 'active' } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map(c => [String(c._id), c.count]));
  success(res, {
    groups: groups.map(g => ({ ...g, memberCount: countMap.get(String(g._id)) || 0 })),
  });
});

exports.getVendorGroup = asyncHandler(async (req, res) => {
  const group = await VendorGroup.findById(req.params.id).lean();
  if (!group) return notFound(res, 'Vendor group not found');
  // Archived (inactive) contractors are excluded — a group's "members" means
  // its currently-active ones, not every vendor code ever assigned to it.
  const members = await Contractor.find({ groupId: group._id, status: 'active' })
    .select('vendorCode companyName ownerName mobile status').sort({ vendorCode: 1 }).lean();
  success(res, { group, members });
});

exports.createVendorGroup = asyncHandler(async (req, res) => {
  if (!req.body.name) return badRequest(res, 'Group name is required');
  const groupCode = await nextVendorGroupCode();
  const group = await VendorGroup.create({ groupCode, name: req.body.name, createdBy: req.user._id });

  await logAudit({
    action: 'CREATE', module: 'vendor-groups', user: req.user,
    description: `Vendor group ${group.groupCode} (${group.name}) created`,
    entityType: 'VendorGroup', entityId: group._id, entityLabel: `${group.groupCode} — ${group.name}`,
  });

  created(res, { group }, `Vendor group ${groupCode} created`);
});

exports.updateVendorGroup = asyncHandler(async (req, res) => {
  const before = await VendorGroup.findById(req.params.id).lean();
  if (!before) return notFound(res, 'Vendor group not found');

  const group = await VendorGroup.findByIdAndUpdate(
    req.params.id, { $set: { name: req.body.name } }, { new: true, runValidators: true }
  );
  if (!group) return notFound(res, 'Vendor group not found');

  const changes = diffFields(before, group.toObject(), ['name']);
  if (changes) {
    await logAudit({
      action: 'UPDATE', module: 'vendor-groups', user: req.user,
      description: `Updated vendor group ${group.groupCode}`,
      entityType: 'VendorGroup', entityId: group._id, entityLabel: `${group.groupCode} — ${group.name}`,
      changes,
    });
  }

  success(res, { group }, 'Vendor group updated');
});

// GET /vendor-groups/:id/progress?projectId=... — aggregate contract/billing
// figures across every member vendor's work orders (optionally scoped to one
// project), plus a per-member breakdown so it's clear who's actually done
// what within the group.
exports.getVendorGroupProgress = asyncHandler(async (req, res) => {
  const group = await VendorGroup.findById(req.params.id).lean();
  if (!group) return notFound(res, 'Vendor group not found');

  // Unlike getVendorGroup's own member list (active only), this progress
  // rollup deliberately includes every vendor code ever assigned to the
  // group — an inactive vendor's past work orders/billing still happened
  // and must still count toward the group's totals, even though that vendor
  // no longer shows up as a current "member" elsewhere.
  const members = await Contractor.find({ groupId: group._id })
    .select('vendorCode companyName').lean();
  const vendorCodes = members.map(m => m.vendorCode);
  const nameByCode = new Map(members.map(m => [m.vendorCode, m.companyName]));

  const woFilter = { vendorCode: { $in: vendorCodes } };
  if (req.query.projectId) woFilter.projectId = req.query.projectId;
  const workOrders = await WorkOrder.find(woFilter)
    .select('workOrderNo vendorCode projectId projectName contractValue status')
    .sort({ createdAt: -1 }).lean();

  const woIds = workOrders.map(w => w._id);
  const bills = await RunningBill.find({ workOrderId: { $in: woIds }, isActive: { $ne: false } })
    .select('workOrderId vendorCode amount status paidAmount').lean();

  const billsByWO = new Map();
  for (const b of bills) {
    const key = String(b.workOrderId);
    if (!billsByWO.has(key)) billsByWO.set(key, []);
    billsByWO.get(key).push(b);
  }

  // Per-member rollup — every member appears even with zero work orders, so
  // it's obvious at a glance who in the group has (and hasn't) picked up work.
  const perMember = new Map(vendorCodes.map(vc => [vc, {
    vendorCode: vc, companyName: nameByCode.get(vc), workOrderCount: 0,
    contractValue: 0, billed: 0, paid: 0,
  }]));

  for (const wo of workOrders) {
    const row = perMember.get(wo.vendorCode);
    if (!row) continue;
    row.workOrderCount += 1;
    row.contractValue += wo.contractValue || 0;
    for (const b of billsByWO.get(String(wo._id)) || []) {
      row.billed += b.amount || 0;
      if (b.status === 'paid') row.paid += b.paidAmount ?? b.amount ?? 0;
    }
  }

  // Advance slips given to any member vendor — same "every code ever
  // assigned" scope as the work-order rollup above, so a member removed
  // from the group after taking an advance doesn't silently drop it.
  const advanceFilter = { contractorCode: { $in: vendorCodes }, isArchived: { $ne: true } };
  if (req.query.projectId) advanceFilter.projectId = req.query.projectId;
  // .lean() skips the schema's `balance` virtual, so it's added back here.
  const advanceSlips = (await AdvanceSlip.find(advanceFilter).sort({ date: -1 }).lean())
    .map(s => ({ ...s, balance: (s.amount || 0) - (s.amountRecovered || 0) }));

  for (const row of perMember.values()) { row.advanceGiven = 0; row.advanceRecovered = 0; row.advanceBalance = 0; }
  for (const slip of advanceSlips) {
    const row = perMember.get(slip.contractorCode);
    if (!row) continue;
    row.advanceGiven += slip.amount || 0;
    row.advanceRecovered += slip.amountRecovered || 0;
    row.advanceBalance += (slip.amount || 0) - (slip.amountRecovered || 0);
  }

  const perMemberArr = Array.from(perMember.values());
  const summary = perMemberArr.reduce((s, r) => ({
    workOrderCount: s.workOrderCount + r.workOrderCount,
    contractValue:  s.contractValue  + r.contractValue,
    billed:         s.billed         + r.billed,
    paid:           s.paid           + r.paid,
    advanceGiven:     s.advanceGiven     + r.advanceGiven,
    advanceRecovered: s.advanceRecovered + r.advanceRecovered,
    advanceBalance:   s.advanceBalance   + r.advanceBalance,
  }), { workOrderCount: 0, contractValue: 0, billed: 0, paid: 0, advanceGiven: 0, advanceRecovered: 0, advanceBalance: 0 });

  success(res, { group, summary, perMember: perMemberArr, workOrders, advanceSlips });
});
