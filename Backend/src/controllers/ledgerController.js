const WorkOrder    = require('../models/WorkOrder');
const RunningBill  = require('../models/RunningBill');
const asyncHandler = require('../utils/asyncHandler');
const { success, notFound } = require('../utils/responseFormatter');

// Hold/Retention and Advance Recovery aren't the contractor's taxable value —
// GST is calculated on the amount net of both, not the raw billed amount.
// TDS is the bill's own already-decided tdsAmount (set at Verification,
// itself net of Hold/Advance/GST) rather than a recompute from a stale
// tdsPercent against the full gross.
function calcBill(b) {
  const retention = b.retentionAmount || 0;
  const advance   = b.advanceRecovery || 0;
  const netBeforeGst = (b.amount || 0) - retention - advance;
  const gst   = (netBeforeGst * (b.gstPercent || 0)) / 100;
  const gross = (b.amount || 0) + gst;
  const tds   = b.tdsAmount || 0;
  const net   = gross - tds - retention - advance;
  return { gst, gross, tds, net };
}

exports.getSummary = asyncHandler(async (req, res) => {
  const { projectId, vendorCode } = req.query;
  const filter = {};
  if (projectId)  filter.projectId  = projectId;
  if (vendorCode) filter.vendorCode = vendorCode;

  const workOrders = await WorkOrder.find(filter).sort({ createdAt: -1 }).lean();
  const allBills   = await RunningBill.find({
    workOrderId: { $in: workOrders.map((w) => w._id) },
  }).lean();

  const summary = workOrders.map((wo) => {
    const bills    = allBills.filter((b) => String(b.workOrderId) === String(wo._id));
    const contract = wo.contractValue || 0;

    let totalGross = 0, certifiedNet = 0, pendingGross = 0;
    for (const b of bills) {
      const { gross, net } = calcBill(b);
      totalGross += gross;
      if (['approved', 'hold'].includes(b.status))                   certifiedNet  += net;
      if (['draft', 'verify-done', 'l1-approved'].includes(b.status)) pendingGross  += gross;
    }

    return {
      workOrder:    wo,
      contract,
      totalGross,
      certifiedNet,
      pendingGross,
      balance:      contract - certifiedNet,
      billCount:    bills.length,
      billedPct:    contract ? (totalGross / contract) * 100 : 0,
      certifiedPct: contract ? (certifiedNet / contract) * 100 : 0,
    };
  });

  success(res, { summary });
});

exports.getWorkOrderLedger = asyncHandler(async (req, res) => {
  const workOrder = await WorkOrder.findById(req.params.workOrderId)
    .populate('projectId', 'code name')
    .lean();
  if (!workOrder) return notFound(res, 'Work order not found');

  const bills = await RunningBill.find({ workOrderId: workOrder._id })
    .populate('verifiedBy', 'name role')
    .populate('approvedBy', 'name role')
    .populate('rejectedBy', 'name role')
    .sort({ billDate: 1 })
    .lean();

  const contract = workOrder.contractValue || 0;
  let runningBalance  = contract;
  let cumCertifiedNet = 0;

  const ledgerRows = bills.map((b, i) => {
    const { gst, gross, tds, net } = calcBill(b);
    const isApproved = ['approved', 'hold'].includes(b.status);
    if (isApproved) {
      runningBalance  -= net;
      cumCertifiedNet += net;
    }
    return {
      seq: i + 1,
      bill: b,
      gst, gross, tds, net,
      isApproved,
      balanceAfter: isApproved ? runningBalance : null,
    };
  });

  const totals = {
    totalBase:    bills.reduce((s, b) => s + b.amount, 0),
    totalGST:     ledgerRows.reduce((s, r) => s + r.gst, 0),
    totalGross:   ledgerRows.reduce((s, r) => s + r.gross, 0),
    totalTDS:     ledgerRows.reduce((s, r) => s + r.tds, 0),
    totalNet:     ledgerRows.reduce((s, r) => s + r.net, 0),
    certifiedNet: cumCertifiedNet,
    pendingGross: ledgerRows
      .filter((r) => ['draft', 'verify-done', 'l1-approved'].includes(r.bill.status))
      .reduce((s, r) => s + r.gross, 0),
    balance: contract - cumCertifiedNet,
  };

  success(res, { workOrder, ledgerRows, totals, contract });
});
