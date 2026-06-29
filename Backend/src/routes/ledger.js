const router      = require('express').Router();
const WorkOrder   = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function calcBill(b) {
  const gst   = (b.amount * b.gstPercent) / 100;
  const gross = b.amount + gst;
  const tds   = (gross * b.tdsPercent) / 100;
  const net   = gross - tds;
  return { gst, gross, tds, net };
}

// GET /api/ledger/summary  — billing summary for all (or filtered) work orders
router.get('/summary', async (req, res) => {
  try {
    const { projectId, vendorCode } = req.query;
    const filter = {};
    if (projectId)  filter.projectId  = projectId;
    if (vendorCode) filter.vendorCode = vendorCode;

    const workOrders = await WorkOrder.find(filter).sort({ createdAt: -1 }).lean();
    const allBills   = await RunningBill.find({
      workOrderId: { $in: workOrders.map(w => w._id) },
    }).lean();

    const summary = workOrders.map(wo => {
      const bills     = allBills.filter(b => String(b.workOrderId) === String(wo._id));
      const contract  = wo.contractValue || 0;

      let totalGross = 0, certifiedNet = 0, pendingGross = 0;
      for (const b of bills) {
        const { gross, net } = calcBill(b);
        totalGross += gross;
        if (b.status === 'approved') certifiedNet += net;
        if (['submitted', 'verified'].includes(b.status)) pendingGross += gross;
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

    res.json({ summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/ledger/:workOrderId  — full ledger for a single work order
router.get('/:workOrderId', async (req, res) => {
  try {
    const workOrder = await WorkOrder.findById(req.params.workOrderId)
      .populate('projectId', 'code name')
      .lean();
    if (!workOrder) return res.status(404).json({ message: 'Work order not found' });

    const bills = await RunningBill.find({ workOrderId: workOrder._id })
      .populate('verifiedBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('rejectedBy', 'name role')
      .sort({ billDate: 1 })
      .lean();

    const contract = workOrder.contractValue || 0;
    let runningBalance = contract;
    let cumCertifiedNet = 0;

    const ledgerRows = bills.map((b, i) => {
      const { gst, gross, tds, net } = calcBill(b);
      const isApproved = b.status === 'approved';
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
      totalBase:     bills.reduce((s, b) => s + b.amount, 0),
      totalGST:      ledgerRows.reduce((s, r) => s + r.gst, 0),
      totalGross:    ledgerRows.reduce((s, r) => s + r.gross, 0),
      totalTDS:      ledgerRows.reduce((s, r) => s + r.tds, 0),
      totalNet:      ledgerRows.reduce((s, r) => s + r.net, 0),
      certifiedNet:  cumCertifiedNet,
      pendingGross:  ledgerRows
        .filter(r => ['submitted', 'verified'].includes(r.bill.status))
        .reduce((s, r) => s + r.gross, 0),
      balance: contract - cumCertifiedNet,
    };

    res.json({ workOrder, ledgerRows, totals, contract });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
