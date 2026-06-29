/**
 * Seed the database with the same data currently in the frontend mockData.ts
 * Run: npm run seed
 */
const dotenv = require('dotenv');
dotenv.config();

const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const User       = require('../models/User');
const Project    = require('../models/Project');
const Contractor = require('../models/Contractor');
const WorkOrder  = require('../models/WorkOrder');
const RunningBill = require('../models/RunningBill');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Promise.all([
    User.deleteMany(),
    Project.deleteMany(),
    Contractor.deleteMany(),
    WorkOrder.deleteMany(),
    RunningBill.deleteMany(),
  ]);
  console.log('Cleared existing data');

  // ── Users ────────────────────────────────────────────────────
  const hashedPw = await bcrypt.hash('password123', 12);
  const users = await User.insertMany([
    { name: 'Owner Admin',    email: 'owner@neotericgrp.in',    password: hashedPw, role: 'owner'      },
    { name: 'Jalaj Gupta',    email: 'gm@neotericgrp.in',       password: hashedPw, role: 'gm'         },
    { name: 'Rishabh Sharma', email: 'engineer@neotericgrp.in', password: hashedPw, role: 'engineer'   },
    { name: 'Accounts Team',  email: 'accounts@neotericgrp.in', password: hashedPw, role: 'accounts'   },
  ]);
  const owner = users[0];
  console.log('Users seeded');

  // ── Projects ─────────────────────────────────────────────────
  const projects = await Project.insertMany([
    { code: 'PRJ-001', name: 'NH Highway Expansion',   location: 'Gwalior', contractValue: 25000000, status: 'active', createdBy: owner._id },
    { code: 'PRJ-002', name: 'Metro Station Construction', location: 'Indore', contractValue: 27000000, status: 'active', createdBy: owner._id },
  ]);
  const [p001, p002] = projects;
  console.log('Projects seeded');

  // ── Contractors ───────────────────────────────────────────────
  const contractors = await Contractor.insertMany([
    {
      vendorCode: 'VC-0001', companyName: 'ABC Infra Pvt Ltd', ownerName: 'Rajesh Sharma',
      address: 'Gwalior', mobile: '9876543210', email: 'abc@gmail.com',
      accountHolderName: 'ABC Infra Pvt Ltd', bankName: 'HDFC', accountNumber: '123456789',
      ifscCode: 'HDFC000111', branchName: 'Gwalior', gstNumber: '23ABCDE1234F1Z5',
      panNumber: 'ABCDE1234F', workTypes: ['Concrete'], status: 'active', createdBy: owner._id,
    },
    {
      vendorCode: 'VC-0002', companyName: 'XYZ Constructions', ownerName: 'Amit Gupta',
      address: 'Indore', mobile: '9123456780', email: 'mahakal@gmail.com',
      accountHolderName: 'XYZ Constructions', bankName: 'SBI', accountNumber: '987654321',
      ifscCode: 'SBIN000222', branchName: 'Indore', gstNumber: '23XYZAB1234F1Z5',
      panNumber: 'XYZAB1234F', workTypes: ['Electrical'], status: 'active', createdBy: owner._id,
    },
    {
      vendorCode: 'VC-0042', companyName: 'Mukesh Singh Constructions', ownerName: 'Mukesh Singh',
      address: 'Regal Garden, Gwalior', mobile: '9800012345',
      accountHolderName: 'Mukesh Singh', bankName: 'PNB', accountNumber: '456789123',
      ifscCode: 'PUNB000042', branchName: 'Gwalior', panNumber: 'MUKSH1234X',
      workTypes: ['Masonry', 'Concrete'], status: 'active', createdBy: owner._id,
    },
  ]);
  console.log('Contractors seeded');

  // ── Work Orders ───────────────────────────────────────────────
  const workOrders = await WorkOrder.insertMany([
    {
      workOrderNo: 'WO-0001', issueDate: new Date('2025-10-08'),
      projectId: p001._id, projectName: 'NH Highway Expansion',
      vendorCode: 'VC-0001', vendorName: 'ABC Infra Pvt Ltd', ownerName: 'Rajesh Sharma', mobile: '9876543210',
      scopeOfWork: 'Earthwork excavation, foundation and RCC works for highway expansion project',
      contractValue: 5000000, status: 'in-progress', createdBy: owner._id,
    },
    {
      workOrderNo: 'WO-0002', issueDate: new Date('2025-12-17'),
      projectId: p002._id, projectName: 'Metro Station Construction',
      vendorCode: 'VC-0042', vendorName: 'Mukesh Singh Constructions', ownerName: 'Mukesh Singh', mobile: '9800012345',
      scopeOfWork: 'Complete masonry and brick works for metro station platforms and walls',
      contractValue: 3200000, status: 'issued', createdBy: owner._id,
    },
    {
      workOrderNo: 'WO-0003', issueDate: new Date('2026-01-05'),
      projectId: p001._id, projectName: 'NH Highway Expansion',
      vendorCode: 'VC-0002', vendorName: 'XYZ Constructions', ownerName: 'Amit Gupta', mobile: '9123456780',
      scopeOfWork: 'HT/LT electrical panel installation and full wiring package',
      contractValue: 4500000, status: 'in-progress', createdBy: owner._id,
    },
  ]);
  const [wo1, wo2] = workOrders;
  const engineer = users[2];
  console.log('Work orders seeded');

  // ── Running Bills ─────────────────────────────────────────────
  await RunningBill.insertMany([
    {
      billNo: 'RA-0001', workOrderId: wo1._id, workOrderNo: 'WO-0001',
      projectId: p001._id, projectName: 'NH Highway Expansion',
      vendorCode: 'VC-0001', vendorName: 'ABC Infra Pvt Ltd',
      billDate: new Date('2026-01-15'), billRefNo: 'ABCI/2026/001',
      description: 'Earthwork excavation — Chainage 0+000 to 2+500',
      amount: 500000, gstPercent: 18, tdsPercent: 1, status: 'approved',
      submittedAt: new Date('2026-01-15'), verifiedBy: engineer._id, verifiedAt: new Date('2026-01-17'),
      approvedBy: users[1]._id, approvedAt: new Date('2026-01-20'), createdBy: owner._id,
    },
    {
      billNo: 'RA-0002', workOrderId: wo1._id, workOrderNo: 'WO-0001',
      projectId: p001._id, projectName: 'NH Highway Expansion',
      vendorCode: 'VC-0001', vendorName: 'ABC Infra Pvt Ltd',
      billDate: new Date('2026-03-10'), billRefNo: 'ABCI/2026/002',
      description: 'RCC foundation work — Sections A to D',
      amount: 800000, gstPercent: 18, tdsPercent: 1, status: 'verified',
      submittedAt: new Date('2026-03-10'), verifiedBy: engineer._id, verifiedAt: new Date('2026-03-12'),
      createdBy: owner._id,
    },
    {
      billNo: 'RA-0003', workOrderId: wo2._id, workOrderNo: 'WO-0002',
      projectId: p002._id, projectName: 'Metro Station Construction',
      vendorCode: 'VC-0042', vendorName: 'Mukesh Singh Constructions',
      billDate: new Date('2026-04-05'), billRefNo: 'MSC/2026/001',
      description: 'Masonry work — Platform walls east side',
      amount: 300000, gstPercent: 18, tdsPercent: 1, status: 'submitted',
      submittedAt: new Date('2026-04-05'), createdBy: owner._id,
    },
  ]);
  console.log('Running bills seeded');

  console.log('\n✅  Seed complete!\n');
  console.log('Login credentials (all passwords: password123):');
  console.log('  owner@neotericgrp.in    — Owner');
  console.log('  gm@neotericgrp.in       — GM');
  console.log('  engineer@neotericgrp.in — Site Engineer');
  console.log('  accounts@neotericgrp.in — Accounts\n');

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
