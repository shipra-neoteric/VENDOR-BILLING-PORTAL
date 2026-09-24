// One-off seed script: populates vbp_dev with realistic demo data sitting at
// the 4 pending states the MD/CEO Approvals aggregator surfaces. DEV ONLY —
// guarded by printing mongoose.connection.name before any write, and by never
// touching the vbp_dev -> vbp URI replacement other scripts use.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('./src/models/WorkOrder');
const BillRequest = require('./src/models/BillRequest');
const RunningBill = require('./src/models/RunningBill');
const Contractor = require('./src/models/Contractor');
const User = require('./src/models/User');
const Project = require('./src/models/Project');
const { nextWorkOrderNo, nextBillNo, nextBillRequestReqNo } = require('./src/utils/codeGen');

const MARKER = 'DEMO-MD-SEED';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('=== CONNECTED DB:', mongoose.connection.name, '===');
  if (mongoose.connection.name !== 'vbp_dev') {
    throw new Error('Refusing to run — not connected to vbp_dev! db=' + mongoose.connection.name);
  }

  const owner = await User.findOne({ role: 'owner' });
  const agmUser = await User.findOne({ role: 'agm' }) || owner;
  const accountsUser = await User.findOne({ role: 'accounts' }) || owner;
  const contractors = await Contractor.find().limit(3);
  const project = await Project.findOne();
  if (!owner || !contractors.length || !project) throw new Error('Missing base data (owner/contractor/project) in vbp_dev');

  const created = { workOrders: [], billRequests: [], runningBills: [] };

  // ── 1. WorkOrders at pending-final ──────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const woNo = await nextWorkOrderNo();
    const contractor = contractors[i % contractors.length];
    const makerAt = daysAgo(9 - i);
    const checkerAt = daysAgo(7 - i);
    const approverAt = daysAgo(4 - i);
    const rate = 250 + i * 10;
    const qty = 500 + i * 50;
    const amount1 = rate * qty;
    const rate2 = 180;
    const qty2 = 300;
    const amount2 = rate2 * qty2;
    const contractValue = amount1 + amount2;

    const wo = new WorkOrder({
      workOrderNo: woNo,
      issueDate: makerAt,
      companyName: 'Neoteric Properties',
      projectId: project._id,
      projectName: project.name || project.projectName,
      vendorCode: contractor.vendorCode,
      vendorName: contractor.companyName,
      ownerName: contractor.ownerName,
      mobile: contractor.mobile,
      department: 'civil',
      description: `Demo seeded work order for MD Approvals testing (${MARKER})`,
      scopeOfWork: 'Civil execution scope — demo seed',
      internalRemark: MARKER,
      scopeItems: [
        {
          description: 'RCC Column & Shuttering work',
          unit: 'sq.ft',
          plannedQty: qty,
          rate,
          amount: amount1,
          gstPercent: 18,
          status: 'pending',
        },
        {
          description: 'Brick Masonry work',
          unit: 'sq.ft',
          plannedQty: qty2,
          rate: rate2,
          amount: amount2,
          gstPercent: 18,
          status: 'pending',
        },
      ],
      contractValue,
      gstPercent: 18,
      retentionPercent: 5,
      status: 'draft',
      createdBy: owner._id,
      makerBy: owner._id,
      makerAt,
      checkerBy: agmUser._id,
      checkerAt,
      checkerRemarks: 'Verified scope and rates — forwarded to approver.',
      approverBy: accountsUser._id,
      approverAt,
      approverRemarks: 'Reviewed — forwarded for final (CEO/Owner) approval.',
      approvalStatus: 'pending-final',
      approvalHistory: [
        { stage: 'maker', action: 'submitted', by: owner._id, byName: owner.name, byRole: owner.role, at: makerAt, remarks: 'Submitted for checker review.' },
        { stage: 'checker', action: 'approved', by: agmUser._id, byName: agmUser.name, byRole: agmUser.role, at: checkerAt, remarks: 'Verified scope and rates — forwarded to approver.' },
        { stage: 'approver', action: 'approved', by: accountsUser._id, byName: accountsUser.name, byRole: accountsUser.role, at: approverAt, remarks: 'Reviewed — forwarded for final (CEO/Owner) approval.' },
      ],
    });
    await wo.save();
    created.workOrders.push(wo.workOrderNo);
  }

  // ── 2. BillRequests at pending-l4, linked to an EXISTING approved WO ────
  const existingApprovedWO = await WorkOrder.findOne({ approvalStatus: 'approved', internalRemark: { $not: /DEMO-MD-SEED/ } }).sort({ createdAt: -1 });
  if (!existingApprovedWO) throw new Error('No existing approved WorkOrder found to link BillRequests to');

  for (let i = 0; i < 3; i++) {
    const reqNo = await nextBillRequestReqNo();
    const agmAt = daysAgo(8 - i);
    const gmAt = daysAgo(6 - i);
    const l3At = daysAgo(3 - i);
    const rate = 200 + i * 5;
    const qty = 100 + i * 10;
    const amount = rate * qty;

    const br = new BillRequest({
      reqNo,
      stageNo: 1,
      workOrderId: existingApprovedWO._id,
      workOrderNo: existingApprovedWO.workOrderNo,
      projectId: existingApprovedWO.projectId,
      projectName: existingApprovedWO.projectName,
      projectLocation: existingApprovedWO.projectLocation || '',
      vendorCode: existingApprovedWO.vendorCode,
      vendorName: existingApprovedWO.vendorName,
      companyName: existingApprovedWO.companyName,
      department: 'civil',
      items: [
        {
          description: 'Progress billing — demo seeded item',
          unit: 'sq.ft',
          billedQty: qty,
          rate,
          amount,
        },
      ],
      remarks: `Seeded demo bill request for MD Approvals testing (${MARKER})`,
      periodFrom: daysAgo(20),
      periodTo: daysAgo(10),
      status: 'pending-l4',
      agmApprovedBy: agmUser._id,
      agmApprovedAt: agmAt,
      gmApprovedBy: accountsUser._id,
      gmApprovedAt: gmAt,
      l3ApprovedBy: owner._id,
      l3ApprovedAt: l3At,
      retentionAmount: Math.round(amount * 0.05),
      requestedBy: agmUser._id,
      approvalHistory: [
        { stage: 'agm', action: 'approved', by: agmUser._id, byName: agmUser.name, byRole: agmUser.role, at: agmAt, remarks: 'AGM approved.' },
        { stage: 'gm', action: 'approved', by: accountsUser._id, byName: accountsUser.name, byRole: accountsUser.role, at: gmAt, remarks: 'GM approved.' },
        { stage: 'l3', action: 'approved', by: owner._id, byName: owner.name, byRole: owner.role, at: l3At, remarks: 'L3 approved — moved to L4 approval.' },
      ],
    });
    await br.save();
    created.billRequests.push(br.reqNo);
  }

  // ── 3. RunningBills — 2 at manualApprovalStatus pending-l4, 2 at status l1-approved ──
  for (let i = 0; i < 2; i++) {
    const billNo = reqNoPlaceholder(await nextBillRequestReqNo());
    const contractor = contractors[i % contractors.length];
    const rate = 220;
    const qty = 80 + i * 5;
    const amount = rate * qty;
    const l3At = daysAgo(2 - i + 5);

    const bill = new RunningBill({
      billNo,
      workOrderId: existingApprovedWO._id,
      workOrderNo: existingApprovedWO.workOrderNo,
      projectId: existingApprovedWO.projectId,
      projectName: existingApprovedWO.projectName,
      projectLocation: existingApprovedWO.projectLocation || '',
      vendorCode: contractor.vendorCode,
      vendorName: contractor.companyName,
      companyName: existingApprovedWO.companyName,
      billDate: daysAgo(6 - i),
      lineItems: [
        {
          description: 'Manual bill — demo seeded line item',
          unit: 'sq.ft',
          billedQty: qty,
          rate,
          amount,
        },
      ],
      amount,
      gstPercent: 18,
      tdsPercent: 1,
      remarks: `Seeded demo manual bill for MD Approvals testing (${MARKER})`,
      department: 'civil',
      generatedBy: agmUser.name,
      status: 'draft',
      manualApprovalStatus: 'pending-l4',
      manualAgmApprovedBy: agmUser._id,
      manualAgmApprovedAt: daysAgo(9 - i),
      manualGmApprovedBy: accountsUser._id,
      manualGmApprovedAt: daysAgo(6 - i + 1),
      manualL3ApprovedBy: owner._id,
      manualL3ApprovedAt: l3At,
      createdBy: agmUser._id,
      approvalHistory: [
        { stage: 'manual-agm', action: 'approved', by: agmUser._id, at: daysAgo(9 - i), remarks: 'AGM approved.' },
        { stage: 'manual-gm', action: 'approved', by: accountsUser._id, at: daysAgo(6 - i + 1), remarks: 'GM approved.' },
        { stage: 'manual-l3', action: 'approved', by: owner._id, at: l3At, remarks: 'L3 approved — moved to L4 approval.' },
      ],
    });
    await bill.save();
    created.runningBills.push(bill.billNo + ' (manual-l4)');
  }

  for (let i = 0; i < 2; i++) {
    const billNo = await nextBillNo();
    const contractor = contractors[(i + 1) % contractors.length];
    const rate = 300;
    const qty = 60 + i * 5;
    const amount = rate * qty;
    const verifiedAt = daysAgo(3 - i + 3);
    const l1At = daysAgo(1 - i + 2);

    const bill = new RunningBill({
      billNo,
      workOrderId: existingApprovedWO._id,
      workOrderNo: existingApprovedWO.workOrderNo,
      projectId: existingApprovedWO.projectId,
      projectName: existingApprovedWO.projectName,
      projectLocation: existingApprovedWO.projectLocation || '',
      vendorCode: contractor.vendorCode,
      vendorName: contractor.companyName,
      companyName: existingApprovedWO.companyName,
      billDate: daysAgo(5 - i),
      lineItems: [
        {
          description: 'Accounts chain bill — demo seeded line item',
          unit: 'sq.ft',
          billedQty: qty,
          rate,
          amount,
        },
      ],
      amount,
      gstPercent: 18,
      tdsPercent: 1,
      remarks: `Seeded demo bill for MD Approvals L2-Director testing (${MARKER})`,
      department: 'civil',
      generatedBy: accountsUser.name,
      status: 'l1-approved',
      manualApprovalStatus: 'approved',
      manualAgmApprovedBy: agmUser._id,
      manualAgmApprovedAt: daysAgo(10 - i),
      manualL4ApprovedBy: owner._id,
      manualL4ApprovedAt: daysAgo(8 - i),
      verificationBy: accountsUser._id,
      verificationAt: verifiedAt,
      l1ApprovedBy: agmUser._id,
      l1ApprovedAt: l1At,
      createdBy: accountsUser._id,
      approvalHistory: [
        { stage: 'verification', action: 'approved', by: accountsUser._id, at: verifiedAt, remarks: 'Verified against WO + vendor details.' },
        { stage: 'l1-agm', action: 'approved', by: agmUser._id, at: l1At, remarks: 'L1 AGM approved — ready for L2 Director approval.' },
      ],
    });
    await bill.save();
    created.runningBills.push(bill.billNo + ' (l1-approved)');
  }

  console.log('\n=== SEED SUMMARY ===');
  console.log('WorkOrders (pending-final):', created.workOrders);
  console.log('BillRequests (pending-l4):', created.billRequests);
  console.log('RunningBills:', created.runningBills);

  // ── Verify via the same queries the real controller runs ───────────────
  const pendingWO = await WorkOrder.find({ approvalStatus: 'pending-final' }).select('workOrderNo');
  const pendingBR = await BillRequest.find({ status: 'pending-l4' }).select('reqNo');
  const pendingManual = await RunningBill.find({ manualApprovalStatus: 'pending-l4' }).select('billNo');
  const pendingAccounts = await RunningBill.find({ status: 'l1-approved' }).select('billNo');
  console.log('\n=== AGGREGATOR QUERY RESULTS (what listMdApprovals would see, Owner-role, no department filtering needed) ===');
  console.log('pending-final WOs total in DB:', pendingWO.length, pendingWO.map(w => w.workOrderNo));
  console.log('pending-l4 BillRequests total in DB:', pendingBR.length, pendingBR.map(b => b.reqNo));
  console.log('manualApprovalStatus pending-l4 RunningBills total in DB:', pendingManual.length, pendingManual.map(b => b.billNo));
  console.log('status l1-approved RunningBills total in DB:', pendingAccounts.length, pendingAccounts.map(b => b.billNo));

  await mongoose.disconnect();
}

function reqNoPlaceholder(n) { return n; } // BR-#### placeholder used as billNo pre-L4, matching real flow

main().catch((e) => { console.error(e); process.exit(1); });
