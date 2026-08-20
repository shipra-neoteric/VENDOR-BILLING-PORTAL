const VendorGroup  = require('../models/VendorGroup');
const Contractor   = require('../models/Contractor');
const WorkOrder    = require('../models/WorkOrder');
const RunningBill  = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextVendorGroupCode } = require('../utils/codeGen');
const { logAudit, diffFields } = require('../utils/auditLog');

exports.listVendorGroups = asyncHandler(async (req, res) => {
  const groups = await VendorGroup.find().sort({ name: 1 }).lean();
  const counts = await Contractor.aggregate([
    { $match: { groupId: { $ne: null } } },
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
  const members = await Contractor.find({ groupId: group._id })
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

  const perMemberArr = Array.from(perMember.values());
  const summary = perMemberArr.reduce((s, r) => ({
    workOrderCount: s.workOrderCount + r.workOrderCount,
    contractValue:  s.contractValue  + r.contractValue,
    billed:         s.billed         + r.billed,
    paid:           s.paid           + r.paid,
  }), { workOrderCount: 0, contractValue: 0, billed: 0, paid: 0 });

  success(res, { group, summary, perMember: perMemberArr, workOrders });
});
