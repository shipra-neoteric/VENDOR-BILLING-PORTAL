const Contractor = require('../models/Contractor');
const WorkOrder  = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');
const Project    = require('../models/Project');

async function nextVendorCode() {
  const all = await Contractor.find().select('vendorCode').lean();
  if (!all.length) return 'VC-0001';
  const nums = all.map(c => parseInt(c.vendorCode.replace('VC-', ''), 10)).filter(Boolean);
  return `VC-${String(Math.max(...nums) + 1).padStart(4, '0')}`;
}

async function nextProjectCode() {
  const all = await Project.find().select('code').lean();
  if (!all.length) return 'PRJ-001';
  const nums = all.map(p => parseInt(p.code.replace('PRJ-', ''), 10)).filter(Boolean);
  return `PRJ-${String(Math.max(...nums) + 1).padStart(3, '0')}`;
}

async function nextWorkOrderNo() {
  const all = await WorkOrder.find().select('workOrderNo').lean();
  if (!all.length) return 'WO-0001';
  const nums = all.map(w => parseInt(w.workOrderNo.replace('WO-', ''), 10)).filter(Boolean);
  return `WO-${String(Math.max(...nums) + 1).padStart(4, '0')}`;
}

async function nextBillNo() {
  const all = await RunningBill.find().select('billNo').lean();
  if (!all.length) return 'RA-0001';
  const nums = all.map(b => parseInt(b.billNo.replace('RA-', ''), 10)).filter(Boolean);
  return `RA-${String(Math.max(...nums) + 1).padStart(4, '0')}`;
}

module.exports = { nextVendorCode, nextProjectCode, nextWorkOrderNo, nextBillNo };
