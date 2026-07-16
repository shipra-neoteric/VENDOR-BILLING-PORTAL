// One-off DEMO script (NOT for production use) — creates fully isolated dummy
// records (tagged "TEST-SLA-DEMO") to drive both seeded SLA workflow templates
// through a realistic mix of on-time / late / currently-breached stages, so
// the SLA MIS report can be visually inspected before relying on it for real.
// Nothing here touches any real project/contractor/work-order/bill-request
// data — everything created is new and clearly tagged for easy deletion later
// (see the summary printed at the end). Safe to re-run — wipes its own prior
// output first.
require('dotenv').config();
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const Contractor = require('../src/models/Contractor');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
const User = require('../src/models/User');
const WorkflowInstance = require('../src/models/WorkflowInstance');
const { startInstance, advanceInstance, completeStageById } = require('../src/utils/slaEngine');

const TAG = 'TEST-SLA-DEMO';

async function wipePrior() {
  const projects = await Project.find({ code: { $in: ['TEST-SLA', 'TEST-SLA-2'] } }).select('_id');
  const projectIds = projects.map(p => p._id);
  const wos = await WorkOrder.find({ workOrderNo: { $regex: `^${TAG}` } }).select('_id');
  const woIds = wos.map(w => w._id);
  const brs = await BillRequest.find({ reqNo: { $regex: `^${TAG}` } }).select('_id');
  const brIds = brs.map(b => b._id);

  await WorkflowInstance.deleteMany({ $or: [{ entityId: { $in: woIds } }, { entityId: { $in: brIds } }] });
  await BillRequest.deleteMany({ _id: { $in: brIds } });
  await WorkOrder.deleteMany({ _id: { $in: woIds } });
  await Project.deleteMany({ _id: { $in: projectIds } });
  await Contractor.deleteMany({ vendorCode: { $in: ['TEST-SLA-01', 'TEST-SLA-02'] } });
}

function printInstance(label, instance) {
  console.log(`\n── ${label} ──`);
  console.log(`Template: ${instance.templateName} | Status: ${instance.status}`);
  instance.stages.forEach((s, i) => {
    const now = new Date();
    const isCurrent = i === instance.currentStageIndex && instance.status === 'in-progress';
    const breached = isCurrent && s.dueAt && new Date(s.dueAt) < now;
    let line = `  ${i + 1}. ${s.name} [${s.status}]`;
    if (s.status === 'completed') {
      line += s.delayMinutes > 0 ? ` — LATE by ${s.delayMinutes}min (red)` : ` — ON TIME (green)`;
    } else if (isCurrent) {
      line += breached ? ` — currently BREACHED, overdue since ${new Date(s.dueAt).toLocaleString()} (red)` : ` — ongoing, due ${new Date(s.dueAt).toLocaleString()}`;
    }
    console.log(line);
  });
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await wipePrior();
  const owner = await User.findOne({ role: 'owner' }).select('_id name email');
  if (!owner) throw new Error('No owner user found');

  // ── Isolated dummy projects + contractors ──────────────────────
  const projectA = await Project.create({ code: 'TEST-SLA', name: `${TAG} Tower A`, location: 'Test', status: 'active' });
  const projectB = await Project.create({ code: 'TEST-SLA-2', name: `${TAG} Tower B`, location: 'Test', status: 'active' });
  const contractorA = await Contractor.create({ vendorCode: 'TEST-SLA-01', companyName: `${TAG} Contractor A`, ownerName: 'Test Owner', mobile: '9999999999' });
  const contractorB = await Contractor.create({ vendorCode: 'TEST-SLA-02', companyName: `${TAG} Contractor B`, ownerName: 'Test Owner 2', mobile: '9999999998' });

  // ══════════════════ Work Order Sign-off Chain (Tower A — mixed/late) ══════════════════
  const wo = await WorkOrder.create({
    workOrderNo: `${TAG}-WO1`,
    issueDate: new Date(),
    projectId: projectA._id, projectName: projectA.name,
    vendorCode: contractorA.vendorCode, vendorName: contractorA.companyName,
    contractValue: 500000, status: 'issued',
    scopeItems: [{ description: 'Demo scope item', unit: 'sq.ft', plannedQty: 100, rate: 5000, amount: 500000 }],
    preparedByName: owner.name, preparedByContact: owner.email,
    createdBy: owner._id,
  });

  let woInstance = await startInstance('WorkOrder', wo._id, wo.workOrderNo, owner._id, {
    projectId: wo.projectId, projectName: wo.projectName, vendorName: wo.vendorName, amount: wo.contractValue,
  });

  // Stage 1 (Contractor Sign-off): complete immediately — ON TIME
  await completeStageById(woInstance._id, woInstance.stages[0]._id, owner._id, 'Demo: signed on time');

  // Stage 2 (AGM Approval): back-date its due time, then complete — LATE
  woInstance = await WorkflowInstance.findById(woInstance._id);
  woInstance.stages[1].dueAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h overdue
  await woInstance.save();
  await completeStageById(woInstance._id, woInstance.stages[1]._id, owner._id, 'Demo: approved late');

  // Stage 3 (GM Approval): back-date due time, leave ONGOING — currently breached (critical, >48h)
  woInstance = await WorkflowInstance.findById(woInstance._id);
  woInstance.stages[2].dueAt = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50h overdue — crosses the "critical" threshold
  await woInstance.save();

  // Stage 4 (CEO Approval): left untouched — still pending

  woInstance = await WorkflowInstance.findById(woInstance._id);
  printInstance('Work Order Sign-off Chain (Tower A)', woInstance);

  // ══════════════ Bill Request Approval & Payment Chain (Tower A) ══════════
  wo.scopeItems[0].completedQty = 100; // simulate full progress so a bill can be raised
  await wo.save();

  const br = await BillRequest.create({
    reqNo: `${TAG}-BR1`, stageNo: 1,
    workOrderId: wo._id, workOrderNo: wo.workOrderNo,
    projectId: projectA._id, projectName: projectA.name,
    vendorCode: contractorA.vendorCode, vendorName: contractorA.companyName,
    periodFrom: new Date(), periodTo: new Date(),
    items: [{ description: 'Demo scope item', unit: 'sq.ft', billedQty: 100, rate: 5000, amount: 500000 }],
    requestedBy: owner._id,
  });

  let brInstance = await startInstance('BillRequest', br._id, br.reqNo, owner._id, {
    projectId: br.projectId, projectName: br.projectName, vendorName: br.vendorName, amount: 500000,
  });

  // Stage 1 (AGM Approval): simulate the real "Approve" button — auto-advance, ON TIME
  await advanceInstance('BillRequest', br._id, owner._id, 'Demo: approved');

  // Stage 2 (GM Approval): complete on time
  brInstance = await WorkflowInstance.findById(brInstance._id);
  await completeStageById(brInstance._id, brInstance.stages[1]._id, owner._id, 'Demo: GM approved on time');

  // Stage 3 (Accounts Verification): back-date due time, then complete — LATE
  brInstance = await WorkflowInstance.findById(brInstance._id);
  brInstance.stages[2].dueAt = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h overdue
  await brInstance.save();
  await completeStageById(brInstance._id, brInstance.stages[2]._id, owner._id, 'Demo: verified late');

  // Stage 4 (Accounts Final Approval): back-date due time, leave ONGOING — currently breached
  brInstance = await WorkflowInstance.findById(brInstance._id);
  brInstance.stages[3].dueAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h overdue, not yet completed
  await brInstance.save();

  // Stages 5-6 (Payment Initiated, Payment Released): left untouched — still pending.
  // NOTE: deliberate — proves "Release Payment" must not be clicked yet, or it would
  // wrongly complete stage 4 instead of stage 6.

  brInstance = await WorkflowInstance.findById(brInstance._id);
  printInstance('Bill Request Approval & Payment Chain (Tower A)', brInstance);

  // ══════════════ Second Work Order (Tower B — clean/on-time, for contrast) ══════════
  const wo2 = await WorkOrder.create({
    workOrderNo: `${TAG}-WO2`,
    issueDate: new Date(),
    projectId: projectB._id, projectName: projectB.name,
    vendorCode: contractorB.vendorCode, vendorName: contractorB.companyName,
    contractValue: 300000, status: 'issued',
    scopeItems: [{ description: 'Demo scope item B', unit: 'sq.ft', plannedQty: 50, rate: 6000, amount: 300000 }],
    preparedByName: owner.name, preparedByContact: owner.email,
    createdBy: owner._id,
  });

  let wo2Instance = await startInstance('WorkOrder', wo2._id, wo2.workOrderNo, owner._id, {
    projectId: wo2.projectId, projectName: wo2.projectName, vendorName: wo2.vendorName, amount: wo2.contractValue,
  });

  // Complete all 4 stages on time, back to back — fully completed, ON TIME instance
  for (let i = 0; i < 4; i++) {
    wo2Instance = await WorkflowInstance.findById(wo2Instance._id);
    await completeStageById(wo2Instance._id, wo2Instance.stages[wo2Instance.currentStageIndex]._id, owner._id, 'Demo: on time');
  }
  wo2Instance = await WorkflowInstance.findById(wo2Instance._id);
  printInstance('Work Order Sign-off Chain (Tower B — fully completed)', wo2Instance);

  // ── Summary for later cleanup ─────────────────────────────────
  console.log('\n── Created records (all tagged "TEST-SLA-DEMO" for easy cleanup) ──');
  console.log(`Project A:      ${projectA._id}  (code: ${projectA.code})`);
  console.log(`Project B:      ${projectB._id}  (code: ${projectB.code})`);
  console.log(`Contractor A:   ${contractorA._id}  (vendorCode: ${contractorA.vendorCode})`);
  console.log(`Contractor B:   ${contractorB._id}  (vendorCode: ${contractorB.vendorCode})`);
  console.log(`WorkOrder 1:    ${wo._id}  (${wo.workOrderNo})`);
  console.log(`WorkOrder 2:    ${wo2._id}  (${wo2.workOrderNo})`);
  console.log(`BillRequest:    ${br._id}  (${br.reqNo})`);
  console.log('\nOpen SLA Dashboard (/sla-dashboard) to see the full MIS report live.');

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
