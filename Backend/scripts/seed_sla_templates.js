// One-off: create the two SLA workflow templates approved by the user —
// "Work Order Sign-off Chain" (WorkOrder) and "Bill Request Approval & Payment
// Chain" (BillRequest, full 6-stage). Skips creation if a template with the
// same name already exists, so it's safe to re-run.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkflowTemplate = require('../src/models/WorkflowTemplate');
const User = require('../src/models/User');

const stage = (name, assignedRole, slaHours) => ({
  name, assignedRole, slaHours,
  businessHoursOnly: false,
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  reminderBeforeMinutes: 0,
  escalateAfterMinutes: 0,
});

const TEMPLATES = [
  {
    name: 'Work Order Sign-off Chain',
    description: 'Contractor sign-off through final CEO approval on newly created work orders.',
    entityType: 'WorkOrder',
    isActive: true,
    stages: [
      stage('Contractor Sign-off', 'contractor', 48),
      stage('AGM Approval', 'agm', 24),
      stage('GM Approval', 'gm', 24),
      stage('CEO Approval', 'ceo', 48),
    ],
  },
  {
    name: 'Bill Request Approval & Payment Chain',
    description: 'Full approval-to-payment chain for bill requests: AGM, GM, Accounts verification/approval, payment initiation and release.',
    entityType: 'BillRequest',
    isActive: true,
    stages: [
      stage('AGM Approval', 'agm', 24),
      stage('GM Approval', 'gm', 24),
      stage('Accounts Verification', 'accounts', 48),
      stage('Accounts Final Approval', 'accounts', 24),
      stage('Payment Initiated', 'accounts', 24),
      stage('Payment Released', 'accounts', 48),
    ],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const owner = await User.findOne({ role: 'owner' }).select('_id');

  for (const t of TEMPLATES) {
    const existing = await WorkflowTemplate.findOne({ name: t.name });
    if (existing) {
      console.log(`Skipped (already exists): ${t.name}`);
      continue;
    }
    const created = await WorkflowTemplate.create({
      ...t,
      stages: t.stages.map((s, i) => ({ ...s, order: i })),
      createdBy: owner ? owner._id : undefined,
    });
    console.log(`Created: ${created.name} (${created.stages.length} stages)`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
