const WorkOrder = require('../models/WorkOrder');
const Contractor = require('../models/Contractor');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The work order that already covers this site + vendor + category, if any — a second one must not be
// raised; further work goes onto that one as an addendum (see workOrderAddendumController). A Vendor
// Group counts as one vendor: every member's work order for the same site and category matches.
// Cancelled work orders don't count. Consultancy (professional-services) orders are matched only
// against other consultancy orders.
async function findExistingSiteVendorCategoryWo({ projectId, vendorCode, category, contractType, excludeId }) {
  const cat = String(category || '').trim();
  if (!projectId || !vendorCode || !cat) return null;
  const professional = contractType === 'professional-services';

  let codes = [vendorCode];
  if (!professional) {
    const vendor = await Contractor.findOne({ vendorCode }).select('groupId').lean();
    if (vendor?.groupId) {
      const members = await Contractor.find({ groupId: vendor.groupId }).select('vendorCode').lean();
      codes = members.map((m) => m.vendorCode);
    }
  }

  const filter = {
    projectId,
    vendorCode: { $in: codes },
    category: new RegExp(`^${escapeRegex(cat)}$`, 'i'),
    status: { $ne: 'cancelled' },
    contractType: professional ? 'professional-services' : { $ne: 'professional-services' },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return WorkOrder.findOne(filter).select('workOrderNo vendorName vendorCode category approvalStatus').sort({ createdAt: 1 }).lean();
}

function duplicateMessage(existing) {
  return `${existing.workOrderNo} (${existing.vendorName || existing.vendorCode}, ${existing.category}) already covers this site, vendor and category — open it and use "Add Scope" instead of creating a new work order.`;
}

module.exports = { findExistingSiteVendorCategoryWo, duplicateMessage };
