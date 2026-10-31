const Contractor = require('../models/Contractor');
const VendorGroup = require('../models/VendorGroup');

// Resolves who a bill should actually pay out to. With no override (or an
// override matching the work order's own vendor), pays that vendor exactly
// as always. An override is only honored when it names a fellow member of
// the same Vendor Group as the WO's own vendor — e.g. "Ambika Construction"
// the firm takes the work, but this particular bill's payment should land in
// one specific individually-registered member's account instead.
async function resolvePayee(defaultVendorCode, defaultVendorName, requestedVendorCode) {
  if (!requestedVendorCode || requestedVendorCode === defaultVendorCode) {
    return { vendorCode: defaultVendorCode, vendorName: defaultVendorName, overridden: false };
  }

  const [woVendor, payee] = await Promise.all([
    Contractor.findOne({ vendorCode: defaultVendorCode }).select('groupId'),
    Contractor.findOne({ vendorCode: requestedVendorCode }).select('vendorCode companyName groupId status'),
  ]);

  if (!payee) {
    const err = new Error('Payee vendor not found'); err.status = 404; throw err;
  }
  // A deactivated vendor-group member must never be payable out to, even if
  // they're still a genuine (former) group member — paying an account the
  // business has marked inactive is exactly the kind of mistake this
  // override exists to prevent elsewhere, not enable here.
  if (payee.status === 'inactive') {
    const err = new Error(`${payee.companyName || payee.vendorCode} is an inactive vendor and cannot be set as the payee`);
    err.status = 400; throw err;
  }
  if (!woVendor?.groupId || String(payee.groupId) !== String(woVendor.groupId)) {
    const err = new Error("Payee vendor must belong to the same vendor group as this work order's own contractor");
    err.status = 400; throw err;
  }

  return { vendorCode: payee.vendorCode, vendorName: payee.companyName, overridden: true };
}

// Stamps vendorGroupId/vendorGroupName onto plain row objects — the Vendor Group of the vendor each
// row is for (codeOf picks which code; default is the row's own vendorCode). Display only: approvers
// see the group, the individual payee is shown separately once one has been chosen.
async function attachVendorGroups(rows, codeOf = (r) => r.vendorCode) {
  const codes = [...new Set(rows.map(codeOf).filter(Boolean))];
  if (!codes.length) return rows;
  const members = await Contractor.find({ vendorCode: { $in: codes }, groupId: { $ne: null } }).select('vendorCode groupId').lean();
  const groups = await VendorGroup.find({ _id: { $in: [...new Set(members.map((m) => String(m.groupId)))] } }).select('name').lean();
  const groupById = new Map(groups.map((g) => [String(g._id), g]));
  const groupByCode = new Map(members.map((m) => [m.vendorCode, groupById.get(String(m.groupId))]));
  for (const r of rows) {
    const g = groupByCode.get(codeOf(r));
    if (g) { r.vendorGroupId = String(g._id); r.vendorGroupName = g.name; }
  }
  return rows;
}

module.exports = { resolvePayee, attachVendorGroups };
