const Contractor = require('../models/Contractor');

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
    Contractor.findOne({ vendorCode: requestedVendorCode }).select('vendorCode companyName groupId'),
  ]);

  if (!payee) {
    const err = new Error('Payee vendor not found'); err.status = 404; throw err;
  }
  if (!woVendor?.groupId || String(payee.groupId) !== String(woVendor.groupId)) {
    const err = new Error("Payee vendor must belong to the same vendor group as this work order's own contractor");
    err.status = 400; throw err;
  }

  return { vendorCode: payee.vendorCode, vendorName: payee.companyName, overridden: true };
}

module.exports = { resolvePayee };
