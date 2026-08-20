const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const ContractorQuotation = require('../models/ContractorQuotation');
const WorkOrder  = require('../models/WorkOrder');
const Contractor = require('../models/Contractor');
const { nextQuotationNo } = require('../utils/codeGen');
const { logAudit } = require('../utils/auditLog');

function computeTotal(items) {
  return items.reduce((sum, i) => sum + (Number(i.plannedQty) || 0) * (Number(i.rate) || 0), 0);
}

// Shared by the authenticated (/api/quotations) and public
// (/api/public/quotations/work-order/:workOrderId) routes — a quote can be
// entered internally on a contractor's behalf just as easily as submitted by
// the contractor themselves via the public link.
exports.submitQuotation = asyncHandler(async (req, res) => {
  const { workOrderId } = req.params;
  const { vendorCode, contractorName, contractorMobile, contractorEmail, quotedItems, remarks } = req.body;

  if (!contractorName)   return badRequest(res, "Contractor's name is required");
  if (!contractorMobile) return badRequest(res, "Contractor's contact is required");
  if (!Array.isArray(quotedItems) || quotedItems.length === 0) {
    return badRequest(res, 'At least one quoted item is required');
  }

  const workOrder = await WorkOrder.findById(workOrderId);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.isLocked) return badRequest(res, 'This work order is already locked — quotations are closed');

  const items = quotedItems.map(i => ({
    scopeItemId: i.scopeItemId || null,
    description: i.description,
    unit:        i.unit || 'sq.ft',
    plannedQty:  Number(i.plannedQty) || 0,
    rate:        Number(i.rate) || 0,
    amount:      (Number(i.plannedQty) || 0) * (Number(i.rate) || 0),
  }));

  const quotationNo = await nextQuotationNo();

  const quotation = await ContractorQuotation.create({
    quotationNo,
    workOrderId,
    vendorCode:       vendorCode || '',
    contractorName,
    contractorMobile,
    contractorEmail:  contractorEmail || '',
    quotedItems: items,
    totalQuoted: computeTotal(items),
    remarks:     remarks || '',
  });

  await logAudit({
    action: 'CREATE', module: 'quotations', user: req.user,
    description: `Quotation ${quotationNo} submitted by ${contractorName} for ${workOrder.workOrderNo} (₹${quotation.totalQuoted.toLocaleString('en-IN')})`,
    entityType: 'ContractorQuotation', entityId: quotation._id, entityLabel: quotation.quotationNo,
  });

  created(res, { quotation }, `Quotation ${quotationNo} submitted successfully`);
});

// Internal, authenticated — the read-only draft WO context also used to seed
// the internal-entry Modal, plus the public form fetches this via the
// unscoped public route below.
exports.getWorkOrderQuotationContext = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.workOrderId)
    .select('workOrderNo projectName vendorName isLocked scopeItems.description scopeItems.unit scopeItems.plannedQty')
    .lean();
  if (!workOrder) return notFound(res, 'Work order not found');

  success(res, {
    workOrder: {
      _id: workOrder._id,
      workOrderNo: workOrder.workOrderNo,
      projectName: workOrder.projectName,
      isLocked: workOrder.isLocked,
      scopeItems: (workOrder.scopeItems || []).map(i => ({
        _id: i._id, description: i.description, unit: i.unit, plannedQty: i.plannedQty,
      })),
    },
  });
});

exports.listQuotationsForWorkOrder = asyncHandler(async (req, res) => {
  const quotations = await ContractorQuotation.find({ workOrderId: req.params.workOrderId })
    .sort({ createdAt: -1 }).lean();
  success(res, { quotations });
});

exports.listDraftWorkOrders = asyncHandler(async (req, res) => {
  const workOrders = await WorkOrder.find({ isLocked: false })
    .select('workOrderNo projectName vendorName contractValue createdAt')
    .sort({ createdAt: -1 }).lean();

  const counts = await ContractorQuotation.aggregate([
    { $match: { status: 'submitted' } },
    { $group: { _id: '$workOrderId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map(c => [String(c._id), c.count]));

  success(res, {
    workOrders: workOrders.map(w => ({ ...w, pendingQuotationCount: countMap.get(String(w._id)) || 0 })),
  });
});

// Locks the winning contractor's rates onto the still-draft WorkOrder.
// Deliberately leaves status/approvalStatus/isLocked untouched — the existing
// maker -> checker -> approver -> final chain (which already auto-locks at
// finalApprove) takes over from here exactly as it does for any other WO.
exports.approveQuotation = asyncHandler(async (req, res) => {
  const quotation = await ContractorQuotation.findById(req.params.id);
  if (!quotation) return notFound(res, 'Quotation not found');
  if (quotation.status !== 'submitted') return badRequest(res, 'Only a submitted quotation can be approved');

  const workOrder = await WorkOrder.findById(quotation.workOrderId);
  if (!workOrder) return notFound(res, 'Work order not found');
  if (workOrder.isLocked) return badRequest(res, 'This work order is already locked');

  let vendorName = quotation.contractorName;
  let ownerName  = quotation.contractorName;
  let mobile     = quotation.contractorMobile;

  if (quotation.vendorCode) {
    const contractor = await Contractor.findOne({ vendorCode: quotation.vendorCode }).lean();
    if (contractor) {
      vendorName = contractor.companyName;
      ownerName  = contractor.ownerName;
      mobile     = contractor.mobile;
    }
  }

  // Map each quoted rate back onto its scope item by _id when the contractor
  // quoted against a pre-listed item; items quoted free-text (no scopeItemId)
  // are appended as new scope items instead.
  const byScopeItemId = new Map(quotation.quotedItems.filter(i => i.scopeItemId).map(i => [String(i.scopeItemId), i]));
  workOrder.scopeItems = workOrder.scopeItems.map(item => {
    const quoted = byScopeItemId.get(String(item._id));
    if (!quoted) return item;
    item.rate   = quoted.rate;
    item.amount = quoted.amount;
    return item;
  });
  const newItems = quotation.quotedItems.filter(i => !i.scopeItemId);
  for (const ni of newItems) {
    workOrder.scopeItems.push({
      description: ni.description, unit: ni.unit, plannedQty: ni.plannedQty,
      rate: ni.rate, amount: ni.amount,
    });
  }

  workOrder.vendorCode = quotation.vendorCode || workOrder.vendorCode;
  workOrder.vendorName = vendorName;
  workOrder.ownerName  = ownerName;
  workOrder.mobile      = mobile;
  workOrder.contractValue = workOrder.scopeItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  await workOrder.save();

  quotation.status     = 'approved';
  quotation.approvedBy = req.user._id;
  quotation.approvedAt = new Date();
  await quotation.save();

  await ContractorQuotation.updateMany(
    { workOrderId: workOrder._id, status: 'submitted', _id: { $ne: quotation._id } },
    { status: 'rejected', rejectedBy: req.user._id, rejectedAt: new Date(), rejectReason: 'Another quotation was approved for this work order' }
  );

  await logAudit({
    action: 'APPROVE', module: 'quotations', user: req.user,
    description: `Quotation ${quotation.quotationNo} approved and applied to work order ${workOrder.workOrderNo}`,
    entityType: 'ContractorQuotation', entityId: quotation._id, entityLabel: quotation.quotationNo,
  });

  success(res, { quotation, workOrder }, 'Quotation approved and applied to the work order');
});

exports.rejectQuotation = asyncHandler(async (req, res) => {
  const quotation = await ContractorQuotation.findById(req.params.id);
  if (!quotation) return notFound(res, 'Quotation not found');
  if (quotation.status !== 'submitted') return badRequest(res, 'Only a submitted quotation can be rejected');

  quotation.status       = 'rejected';
  quotation.rejectedBy    = req.user._id;
  quotation.rejectedAt    = new Date();
  quotation.rejectReason  = req.body.reason || '';
  await quotation.save();

  await logAudit({
    action: 'REJECT', module: 'quotations', user: req.user,
    description: `Quotation ${quotation.quotationNo} rejected${quotation.rejectReason ? ` — ${quotation.rejectReason}` : ''}`,
    entityType: 'ContractorQuotation', entityId: quotation._id, entityLabel: quotation.quotationNo,
  });

  success(res, { quotation }, 'Quotation rejected');
});
